// Supreme Victors (pl3) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded or moved are picked when the
// cards that fit differ (the same-card rule, agreed); Doom News Knocks Out the Defending Pokémon only if it's still Active then
// (as Doom Desire); Antique Magic's counters go one at a time on any Pokémon in play, the player's own too; Hover Hit's 0
// lasts until the end of the player's next turn (`hoverHit`), Deep Sea Pressure's 2 more through the opponent's next turn
// (`pressure`); Turnaround Standby's 40 more is before Weakness and Resistance (`turnaround`); Hibernation Spore's Pokémon
// flips 2 coins to wake (`hibernation`); Top Drop does the HP printed on the Pokémon discarded; Search and Escape puts
// Chatot G and its cards on top of the deck before the search's shuffle; Silver Feather is Land Shake's rule for a turn.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isPokemonCard, isTrainerCard, lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { energyPool, isSpecialEnergy, retireStadium, type InPlayPokemon, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { isPokemonSP } from '../trainers.js';
import { benchedSlots, damageOpponent, energyCards, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { DP4 } from './dp4.js';
import { DPP } from './dpp.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf, EX2 } from './ex2.js';
import { EX13 } from './ex13.js';
import { EX5 } from './ex5.js';
import { PL1 } from './pl1.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
/** How many Special Conditions a Pokémon has: Asleep, Confused or Paralyzed, Poisoned and Burned each count. */
const conditions = (p: InPlayPokemon) => (p.condition ? 1 : 0) + (p.poison ? 1 : 0) + (p.burned ? 1 : 0);
/** Every Energy card of a type discarded from the attacker, then a coin for each (Discharge, Metal Max): the heads. */
function discardAllFlip(ctx: AttackContext, type: EnergyType) {
  const gone = energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, type));
  discardOwn(ctx, gone);
  return ctx.flips(gone.length);
}
/** "You may move a [type] Energy card attached to [it] to 1 of your Benched Pokémon" (Flame Ball, Electric Current). */
const moveToBench = (type: EnergyType, label: string, optional: boolean): Pick<AttackEffect, 'choices'> & { move: (ctx: AttackContext) => void } => ({
  choices: (s): ChoiceSpec[] => {
    const options = benchedSlots(s.ownBench);
    return options.length && s.attacker.energy.some((e) => energyCardOf(s.cards, e, type)) ? [{ kind: 'ownBench', options: optional ? [-1, ...options] : options, optional, prompt: `${label}: ${optional ? 'you may move' : 'move'} a ${type[0]!.toUpperCase()}${type.slice(1)} Energy card to one of your Benched Pokémon` }] : [];
  },
  move(ctx) {
    const slot = ctx.choices.ownBenchSlot;
    const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
    const card = to && ctx.attacker.energy.find((e) => energyCardOf(ctx.state.cards, e, type));
    if (!to || !card) return;
    ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
    to.energy.push(card);
    ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
  },
});
const flameBall = moveToBench('fire', 'Flame Ball', true);
const current = moveToBench('lightning', 'Electric Current', false);
/** Mawile's Swallow and Bite after Turnaround Standby: 40 more before Weakness and Resistance. */
const turnaround = (ctx: AttackContext) => (ctx.attacker.effects?.turnaround === ctx.turn ? 40 : 0);

export const PL3: Record<string, Record<string, AttackEffect>> = {
  // Absol G – Doom News: every Energy card on it back into the hand; the Defending Pokémon is Knocked Out at the end of the opponent's next turn.
  'pl3-1': {
    'Doom News': {
      run(ctx) {
        const back = energyCards(ctx.attacker);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        if (back.length) ctx.log(`Returned ${back.length} Energy card${back.length === 1 ? '' : 's'} to the hand.`);
        ctx.affectDefender((e) => (e.delayed = { turn: ctx.turn + 1, knockOut: true }));
      },
    },
  },
  // Drifblim FB – Shadow Ball: 40 to one of the opponent's Benched Pokémon, with Weakness and Resistance.
  'pl3-3': {
    'Shadow Ball': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 40 damage to"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 40, { weakness: true });
      },
    },
  },
  // Electivire FB – Dump and Draw: as Platinum Vulpix's Reheat. Electric Current: a Lightning Energy card moved to a Benched Pokémon.
  'pl3-4': {
    'Dump and Draw': same(() => PL1['pl1-102']?.['Reheat']),
    'Electric Current': {
      choices: current.choices,
      run(ctx) {
        ctx.hit(40);
        current.move(ctx);
      },
    },
  },
  // Garchomp – Speed Impact: 20 less for each Energy on the Defending Pokémon.
  'pl3-5': { 'Speed Impact': { run: (ctx) => void ctx.hit(Math.max(0, 120 - 20 * energyAmount(ctx, ctx.defender))) } },
  // Magmortar – Flame Ball: may move a Fire Energy card to a Benched Pokémon.
  'pl3-6': {
    'Flame Ball': {
      choices: flameBall.choices,
      run(ctx) {
        ctx.hit(60);
        flameBall.move(ctx);
      },
    },
  },
  // Metagross – Geo Impact: with the player's Stadium in play, 20 to each of the opponent's Benched Pokémon of the Defending Pokémon's type.
  'pl3-7': {
    'Geo Impact': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.state.stadium?.owner !== ctx.me.id) return;
        const types = inPlayDef(ctx.state.cards, ctx.defender);
        for (const slot of benchedSlots(ctx.opp.bench)) {
          const d = inPlayDef(ctx.state.cards, ctx.opp.bench[slot]!);
          if ((types.types ?? [types.type]).some((t) => hasType(d, t))) ctx.damageBenched(ctx.opp, slot, 20);
        }
      },
    },
  },
  // Rayquaza C – Trash Burst: may discard up to 5 Energy cards from the hand, 10 more for each. Twister: as Great Encounters Milotic's.
  'pl3-8': {
    'Trash Burst': {
      choices(s): ChoiceSpec[] {
        const n = Math.min(5, (s.ownHand ?? []).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy').length);
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Trash Burst: how many Energy cards to discard from your hand (10 more damage each)?' }] : [];
      },
      run(ctx) {
        const n = ctx.choices.amount ?? 0;
        ctx.hit(10 + 10 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Trash Burst', count: n, energyOnly: true });
      },
    },
    Twister: same(() => DP4['dp4-25']?.['Twister']),
  },
  // Regigigas FB – Drain Punch: a damage counter off it for each Energy on the Defending Pokémon. Rainbow Lariat: 20 for each
  // type of the player's Pokémon SP in play.
  'pl3-9': {
    'Drain Punch': {
      run(ctx) {
        ctx.hit(30);
        ctx.heal(10 * energyAmount(ctx, ctx.defender));
      },
    },
    'Rainbow Lariat': { run: (ctx) => void ctx.hit(20 * new Set(inPlay(ctx.me).flatMap((p) => (isPokemonSP(inPlayDef(ctx.state.cards, p).name) ? (inPlayDef(ctx.state.cards, p).types ?? [inPlayDef(ctx.state.cards, p).type]) : []))).size) },
  },
  // Rhyperior – Deep Scrap: Knocking Out the Defending Pokémon, the top 3 cards of the opponent's deck discarded.
  'pl3-10': {
    'Deep Scrap': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.defender.damage < ctx.defenderDef.hp) return;
        const top = ctx.opp.deck.splice(0, 3);
        ctx.opp.discard.push(...top);
        if (top.length) ctx.log(`Discarded the top ${top.length} cards of the deck.`, ctx.opp.id);
      },
    },
  },
  // Swampert – Drag Off: may switch in one of the opponent's Benched Pokémon before the damage.
  'pl3-12': {
    'Drag Off': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.opponentBench).length ? [{ kind: 'opponentBench', options: [-1, ...benchedSlots(s.opponentBench)], optional: true, prompt: "Drag Off: you may switch in one of your opponent's Benched Pokémon first" }] : []),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
        ctx.hit(30);
      },
    },
  },
  // Venusaur – Desperate Pollen: with 8 or more damage counters on it, Burned, Confused and Poisoned. Special Reaction: 40 more
  // for each Special Condition of the Defending Pokémon.
  'pl3-13': {
    'Desperate Pollen': {
      run(ctx) {
        const desperate = ctx.attacker.damage >= 80;
        ctx.hit(30);
        if (!desperate) return;
        for (const c of ['burned', 'confused', 'poisoned'] as const) ctx.inflict(c);
      },
    },
    'Special Reaction': { run: (ctx) => void ctx.hit(40 + 40 * conditions(ctx.defender)) },
  },
  // Yanmega – Wind Return: may return every Grass Energy on it to the hand, 20 more for each.
  'pl3-14': {
    'Wind Return': {
      choices: (s) => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'grass')) ? [may('Wind Return: return all Grass Energy on Yanmega to your hand for 20 more damage each?')] : []),
      run(ctx) {
        const back = ctx.choices.boost ? energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'grass')) : [];
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        if (back.length) ctx.log(`Returned ${back.length} Grass Energy card${back.length === 1 ? '' : 's'} to the hand.`);
        ctx.hit(20 + 20 * back.length);
      },
    },
  },
  // Butterfree FB – Select Powder: Burned or Poisoned, as the player chooses.
  'pl3-17': {
    'Select Powder': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['burned', 'poisoned'], prompt: 'Select Powder: Burned or Poisoned?' }],
      run(ctx) {
        ctx.hit(30);
        ctx.inflict(ctx.choices.condition === 'burned' ? 'burned' : 'poisoned');
      },
    },
  },
  // Camerupt – Moving Fire: may move a Fire Energy card from a Benched Pokémon to it. Volcanic Crash: 3 coins, the top card of
  // the deck discarded for each tails, unless the opponent has a Water Pokémon in play.
  'pl3-18': {
    'Moving Fire': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.energy.some((e) => energyCardOf(s.cards, e, 'fire')));
        return options.length ? [{ kind: 'ownBench', options: [-1, ...options], optional: true, prompt: 'Moving Fire: you may move a Fire Energy card from one of your Benched Pokémon to Camerupt' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        const from = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        const card = from?.energy.find((e) => energyCardOf(ctx.state.cards, e, 'fire'));
        if (!from || !card) return;
        from.energy = from.energy.filter((e) => e !== card);
        ctx.attacker.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${ctx.attackerDef.name}.`);
      },
    },
    'Volcanic Crash': {
      run(ctx) {
        ctx.hit(100);
        if (inPlay(ctx.opp).some((p) => hasType(inPlayDef(ctx.state.cards, p), 'water'))) return;
        const tails = 3 - ctx.flips(3);
        const top = ctx.me.deck.splice(0, tails);
        ctx.me.discard.push(...top);
        if (top.length) ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`);
      },
    },
  },
  // Camerupt G – Earth Power: as Platinum Giratina's.
  'pl3-19': { 'Earth Power': same(() => PL1['pl1-9']?.['Earth Power']) },
  // Charizard G – Flame Jet: heads, 40 to one of the opponent's Pokémon.
  'pl3-20': {
    'Flame Jet': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (40 damage to it if heads)"),
      run(ctx) {
        if (ctx.flip()) damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 40);
      },
    },
  },
  // Chimecho – Super Psywave: as EX Holon Phantoms Chimecho δ's.
  'pl3-21': { 'Super Psywave': same(() => EX13['ex13-111']?.['Super Psywave']) },
  // Claydol – Antique Magic: 3 damage counters on any Pokémon in play, as the player likes. Synchro Attack: base 90 with the same HP left.
  'pl3-22': {
    'Antique Magic': { run: (ctx) => ctx.pend({ kind: 'antiqueMagic', source: 'Antique Magic', count: 3 }) },
    'Synchro Attack': { run: (ctx) => void ctx.hit(inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage === ctx.defenderDef.hp - ctx.defender.damage ? 90 : 30) },
  },
  // Dewgong – Ice Shard: base 80 against a Fighting Pokémon.
  'pl3-24': { 'Ice Shard': { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'fighting') ? 80 : 30) } },
  // Dusknoir FB – Ghost Hand: a damage counter on one of the player's Benched Pokémon. Cursed Wrath: 10 for each Pokémon SP in the discard pile.
  'pl3-26': {
    'Ghost Hand': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Ghost Hand: choose one of your Benched Pokémon to put a damage counter on' }] : []),
      run(ctx) {
        ctx.hit(30);
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!p) return;
        p.damage += 10;
        ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`);
      },
    },
    'Cursed Wrath': { run: (ctx) => void ctx.hit(10 * ctx.me.discard.filter((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)) && isPokemonSP(lookupCard(ctx.state.cards, c.defId).name)).length) },
  },
  // Empoleon FB – Escort: 20 more after a Supporter from the hand this turn.
  'pl3-27': { Escort: { run: (ctx) => void ctx.hit(ctx.me.supporterTurn === ctx.turn ? 60 : 40) } },
  // Honchkrow – Riot: 10 more for each Pokémon in play that isn't an Evolved Pokémon, both players'.
  'pl3-29': { Riot: { run: (ctx) => void ctx.hit(30 + 10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => !p.evolvedFrom.length).length) } },
  // Lickilicky C – Licking-Licking Heal: a basic Energy card from the hand attached to one of the player's Pokémon, then 2 damage counters off it.
  'pl3-30': {
    'Licking-Licking Heal': {
      run(ctx) {
        if (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromHand', source: 'Licking-Licking Heal', basic: true, count: 1, anyTarget: true, healAfter: 20 });
      },
    },
  },
  // Lunatone – Gravity Wave: 30 to each of the opponent's Benched Pokémon with no Retreat Cost.
  'pl3-32': {
    'Gravity Wave': {
      run(ctx) {
        ctx.hit(30);
        for (const slot of benchedSlots(ctx.opp.bench)) if (!(inPlayDef(ctx.state.cards, ctx.opp.bench[slot]!).retreatCost ?? 0)) ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Mawile – Turnaround Standby: next turn, Swallow and Bite do 40 more. Swallow: as many damage counters off it as it did.
  'pl3-33': {
    'Turnaround Standby': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).turnaround = ctx.turn + 2;
        ctx.log("Mawile's Swallow and Bite do 40 more damage next turn.");
      },
    },
    Swallow: {
      run(ctx) {
        const done = ctx.hit(20 + turnaround(ctx));
        if (done > 0) ctx.heal(done);
      },
    },
    Bite: { run: (ctx) => void ctx.hit(30 + turnaround(ctx)) },
  },
  // Medicham – Channeling: the opponent draws 2 cards. Chakra Points: as EX Hidden Legends Medicham's.
  'pl3-34': {
    Channeling: {
      run(ctx) {
        ctx.hit(60);
        const drawn = ctx.opp.deck.splice(0, 2);
        ctx.opp.hand.push(...drawn);
        ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, ctx.opp.id);
      },
    },
    'Chakra Points': same(() => EX5['ex5-10']?.['Chakra Points']),
  },
  // Mr. Mime – Desperate Slap: with 5 or more damage counters on it, 40 more.
  'pl3-37': { 'Desperate Slap': { run: (ctx) => void ctx.hit(ctx.attacker.damage >= 50 ? 60 : 20) } },
  // Parasect – Hibernation Spore: Asleep, 2 coins to wake between turns.
  'pl3-38': {
    'Hibernation Spore': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('asleep');
        if (ctx.defender.condition === 'asleep') ctx.affectDefender((e) => (e.hibernation = true));
      },
    },
  },
  // Primeape – Top Drop: the top card of the opponent's deck discarded; a Pokémon does its HP.
  'pl3-39': {
    'Top Drop': {
      run(ctx) {
        const top = ctx.opp.deck.shift();
        if (!top) return ctx.log("Your opponent's deck is empty.");
        ctx.opp.discard.push(top);
        const d = lookupCard(ctx.state.cards, top.defId);
        ctx.log(`Discarded ${d.name} from the top of the deck.`, ctx.opp.id);
        if (isPokemonCard(d) && d.kind === 'pokemon') ctx.hit(d.hp);
      },
    },
  },
  // Solrock – Luna Turn: with Lunatone in the discard pile, 30 more, then a Lunatone from it shuffled into the deck.
  'pl3-45': {
    'Luna Turn': {
      run(ctx) {
        const luna = ctx.me.discard.find((c) => namesMatch(lookupCard(ctx.state.cards, c.defId).name, 'Lunatone'));
        ctx.hit(luna ? 60 : 30);
        if (!luna) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== luna);
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, luna], ctx.state.rngState);
        ctx.log('Shuffled Lunatone from the discard pile into the deck.');
      },
    },
  },
  // Spinda – Synchro Removal: an Energy card of the Defending Pokémon of a type on Spinda's Energy cards discarded.
  'pl3-46': {
    'Synchro Removal': {
      run(ctx) {
        const types = [...new Set(energyPool(ctx.attacker, ctx.state.cards).filter((e): e is EnergyType => typeof e === 'string' && !e.startsWith('crystal') && e !== 'any'))];
        if (types.length) removeDefenderEnergy(ctx, 1, 'Synchro Removal', { types });
      },
    },
  },
  // Breloom – Hover Hit: the Defending Pokémon retreats for free until the end of the player's next turn. Crash Bomber: 40
  // more against a Special Energy card, which is then discarded.
  'pl3-52': {
    'Hover Hit': {
      run(ctx) {
        ctx.hit(40);
        ctx.affectDefender((e) => (e.hoverHit = ctx.turn + 2));
      },
    },
    'Crash Bomber': {
      run(ctx) {
        const special = ctx.defender.energy.some((e) => isSpecialEnergy(ctx.state.cards, e));
        ctx.hit(special ? 60 : 20);
        if (special) removeDefenderEnergy(ctx, 1, 'Crash Bomber', { onlySpecial: true });
      },
    },
  },
  // Carnivine – Swallow: heads, as many damage counters off it as it did.
  'pl3-53': {
    Swallow: {
      run(ctx) {
        const done = ctx.hit(30);
        if (done > 0 && ctx.flip()) ctx.heal(done);
      },
    },
  },
  // Chatot G – Search and Escape: a Trainer card from the deck, shown; then Chatot G and its cards on top of the deck, shuffled.
  'pl3-54': {
    'Search and Escape': {
      run(ctx) {
        ctx.after(() => {
          const p = ctx.attacker;
          if (ctx.me.active !== p) return;
          ctx.me.deck.unshift(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
          ctx.me.active = null;
          ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it went on top of the deck.`);
        });
        if (ctx.me.deck.some((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'pickFromDeck', source: 'Search and Escape', filter: 'trainer', reveal: true, optional: true });
      },
    },
  },
  // Dragonite FB – Mach Blow: base 80 against a Pokémon SP.
  'pl3-56': { 'Mach Blow': { run: (ctx) => void ctx.hit(isPokemonSP(ctx.defenderDef.name) ? 80 : 20) } },
  // Garchomp C – Earthquake: 10 to each of the player's Benched Pokémon.
  'pl3-60': {
    Earthquake: {
      run(ctx) {
        ctx.hit(50);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Milotic – Cleansing Ring: may discard 2 cards from the hand, then 4 damage counters off one of the player's Pokémon. Scale
  // Blow: 10 less for each card in the hand.
  'pl3-70': {
    'Cleansing Ring': {
      choices: (s): ChoiceSpec[] => {
        const hurt = (['active', ...benchedSlots(s.ownBench)] as Target[]).filter((t) => (t === 'active' ? s.attacker : s.ownBench[t])!.damage > 0);
        return (s.ownHand ?? []).length >= 2 && hurt.length ? [may('Cleansing Ring: discard 2 cards from your hand to remove 4 damage counters from one of your Pokémon?'), { kind: 'ownPokemon', options: hurt, prompt: 'Choose the Pokémon to heal' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const p = ctx.choices.boost && ctx.choices.ownTarget !== undefined ? mine(ctx, ctx.choices.ownTarget) : null;
        if (!p || ctx.me.hand.length < 2) return;
        healUpTo(ctx, ctx.me, p, 40);
        ctx.pend({ kind: 'discardFromHand', source: 'Cleansing Ring', count: 2 });
      },
    },
    'Scale Blow': { run: (ctx) => void ctx.hit(Math.max(0, 90 - 10 * ctx.me.hand.length)) },
  },
  // Minun – Call for Family: up to 2 Lightning Basic Pokémon onto the Bench. Trash Charge: a Lightning Energy card from the
  // discard pile attached to one of the player's Pokémon.
  'pl3-71': {
    'Call for Family': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicType', type: 'lightning', toBench: true, optional: true, count: 2 })) },
    'Trash Charge': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'lightning'))) ctx.pend({ kind: 'attachFromDiscard', source: 'Trash Charge', count: 1, type: 'lightning' });
      },
    },
  },
  // Murkrow – Switcheroo: as Great Encounters Linoone's.
  'pl3-72': { Switcheroo: same(() => DP4['dp4-43']?.['Switcheroo']) },
  // Ninjask – Circling Dive: 10 to each of the opponent's Pokémon, then Ninjask switched with a Benched Pokémon. Parallel Drain:
  // as many damage counters as it did off one of the player's Pokémon.
  'pl3-73': {
    'Circling Dive': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Circling Dive: choose a Benched Pokémon to switch Ninjask with' }] : []),
      run(ctx) {
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined) ctx.after(() => ctx.me.active === ctx.attacker && ctx.me.bench[slot] && ctx.switchOwn(slot));
      },
    },
    'Parallel Drain': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: (['active', ...benchedSlots(s.ownBench)] as Target[]).filter((t) => (t === 'active' ? s.attacker : s.ownBench[t])!.damage > 0), prompt: 'Parallel Drain: choose one of your Pokémon to heal' }],
      run(ctx) {
        const done = ctx.hit(30);
        const p = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        if (p && done > 0) healUpTo(ctx, ctx.me, p, done);
      },
    },
  },
  // Numel – Draw In: up to 2 Fire Energy cards from the discard pile attached to it.
  'pl3-74': {
    'Draw In': {
      run(ctx) {
        if (ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'fire'))) ctx.pend({ kind: 'attachFromDiscard', source: 'Draw In', count: 2, target: 'active', type: 'fire' });
      },
    },
  },
  // Pinsir – Sever: 30 more against a Stage 2 Pokémon.
  'pl3-75': { Sever: { run: (ctx) => void ctx.hit(ctx.defenderDef.stage === 'stage2' ? 80 : 50) } },
  // Plusle – Greedy Draw: cards drawn until the hand has 1 more than the opponent's. Hand Charge: a Lightning Energy card from
  // the hand attached to one of the player's Pokémon.
  'pl3-76': {
    'Greedy Draw': {
      run(ctx) {
        if (ctx.me.hand.length > ctx.opp.hand.length) return ctx.log('Greedy Draw did nothing.');
        ctx.draw(ctx.opp.hand.length + 1 - ctx.me.hand.length);
      },
    },
    'Hand Charge': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.hand.some((c) => energyCardOf(ctx.state.cards, c, 'lightning'))) ctx.pend({ kind: 'attachFromHand', source: 'Hand Charge', types: ['lightning'], count: 1, anyTarget: true });
      },
    },
  },
  // Raticate G – Find: a Trainer or Supporter card from the discard pile into the hand, shown. Biting Fang: heads, 20 more.
  'pl3-78': {
    Find: {
      run(ctx) {
        if (ctx.me.discard.some((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'discardToHand', source: 'Find', count: 1, filter: 'trainerAny', reveal: true });
      },
    },
    'Biting Fang': { run: (ctx) => void ctx.hit(ctx.flip() ? 30 : 10) },
  },
  // Relicanth – Grand Swell: 30 for each Pokémon Tool and Stadium card the opponent has in play, to one of their Pokémon.
  'pl3-79': {
    'Grand Swell': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run(ctx) {
        const tools = inPlay(ctx.opp).filter((p) => (p.attached ?? []).some((a) => a.tool)).length;
        const stadium = ctx.state.stadium?.owner === ctx.opp.id ? 1 : 0;
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 30 * (tools + stadium));
      },
    },
  },
  // Rotom – Discharge: every Lightning Energy discarded, a coin for each, 40 for each heads.
  'pl3-82': { Discharge: { run: (ctx) => void ctx.hit(40 * discardAllFlip(ctx, 'lightning')) } },
  // Skarmory FB – Silver Feather: next turn, a Basic Pokémon the opponent benches from the hand gets 2 damage counters (as Land
  // Shake). Metal Max: every Metal Energy discarded, a coin for each, 40 more for each heads.
  'pl3-83': {
    'Silver Feather': {
      run(ctx) {
        ctx.hit(20);
        ctx.opp.landShakeUntil = ctx.turn + 1;
        ctx.log('Basic Pokémon put onto the Bench from the hand next turn get 2 damage counters.', ctx.opp.id);
      },
    },
    'Metal Max': { run: (ctx) => void ctx.hit(20 + 40 * discardAllFlip(ctx, 'metal')) },
  },
  // Cherubi – Growth: as EX Sandstorm Oddish's Growth Spurt.
  'pl3-96': { Growth: same(() => EX2['ex2-78']?.['Growth Spurt']) },
  // Chingling – Chime: as EX Hidden Legends Chimecho's.
  'pl3-98': { Chime: same(() => EX5['ex5-17']?.['Chime']) },
  // Feebas – Count and Draw: a card drawn for each of the opponent's Pokémon that isn't an Evolved Pokémon.
  'pl3-104': { 'Count and Draw': { run: (ctx) => ctx.draw(inPlay(ctx.opp).filter((p) => !p.evolvedFrom.length).length) } },
  // Mankey – Extra Punch: 50 more against a Pokémon LV.X.
  'pl3-112': { 'Extra Punch': { run: (ctx) => void ctx.hit(ctx.defenderDef.stage === 'levelUp' ? 60 : 10) } },
  // Mime Jr. – Encore: the Defending Pokémon can use only the attack picked next turn.
  'pl3-115': {
    Encore: {
      choices: (s): ChoiceSpec[] => (inPlayDef(s.cards, s.defender).attacks.length ? [{ kind: 'defenderAttack', options: inPlayDef(s.cards, s.defender).attacks.map((_, i) => i), prompt: "Encore: choose the Defending Pokémon's attack it can use next turn" }] : []),
      run(ctx) {
        const attack = ctx.defenderDef.attacks[ctx.choices.attackIndex ?? 0];
        if (attack) ctx.affectDefender((e) => (e.encore = { attack: attack.name, until: ctx.turn + 1 }));
      },
    },
  },
  // Absol G LV.X – Darkness Slugger: may discard a card from the hand for 30 more.
  'pl3-141': {
    'Darkness Slugger': {
      choices: (s) => ((s.ownHand ?? []).length ? [may('Darkness Slugger: discard a card from your hand for 30 more damage?')] : []),
      run(ctx) {
        const boost = !!ctx.choices.boost && ctx.me.hand.length > 0;
        ctx.hit(boost ? 60 : 30);
        if (boost) ctx.pend({ kind: 'discardFromHand', source: 'Darkness Slugger', count: 1 });
      },
    },
  },
  // Blaziken FB LV.X – Jet Shoot: attack damage to it is 40 more next turn (after Weakness and Resistance).
  'pl3-142': {
    'Jet Shoot': {
      run(ctx) {
        ctx.hit(80);
        (ctx.attacker.effects ??= {}).jetShoot = ctx.turn + 1;
      },
    },
  },
  // Charizard G LV.X – Malevolent Fire: tails, every Energy on it discarded.
  'pl3-143': {
    'Malevolent Fire': {
      run(ctx) {
        ctx.hit(150);
        if (!ctx.flip()) discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Electivire FB LV.X – Powerful Spark: 10 more for each Energy on the player's Pokémon.
  'pl3-144': { 'Powerful Spark': { run: (ctx) => void ctx.hit(30 + 10 * inPlay(ctx.me).reduce((n, p) => n + energyAmount(ctx, p), 0)) } },
  // Garchomp C LV.X – Dragon Rush; Rayquaza C LV.X – Final Blowup: as the DP Black Star Promos'.
  'pl3-145': { 'Dragon Rush': same(() => DPP['dpp-DP46']?.['Dragon Rush']) },
  'pl3-146': { 'Final Blowup': same(() => DPP['dpp-DP47']?.['Final Blowup']) },
  // Staraptor FB LV.X – Defog: may discard the Stadium in play first, for base 70.
  'pl3-147': {
    Defog: {
      choices: (s) => (s.stadium ? [may('Defog: discard the Stadium card in play for a base damage of 70?')] : []),
      run(ctx) {
        const stadium = ctx.choices.boost ? ctx.state.stadium : null;
        if (stadium) {
          ctx.log(`${lookupCard(ctx.state.cards, stadium.card.defId).name} was discarded.`, stadium.owner);
          retireStadium(ctx.state);
        }
        ctx.hit(stadium ? 70 : 40);
      },
    },
  },
  // Articuno – Diamond Dust: heads, Paralyzed and 10 to each of the opponent's Benched Pokémon.
  'pl3-148': {
    'Diamond Dust': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.inflict('paralyzed');
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Moltres – Hyper Flame: heads, a Fire Energy discarded; tails, every Energy.
  'pl3-149': {
    'Hyper Flame': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) discardOwnEnergy(ctx, 1, 'Hyper Flame', ['fire']);
        else discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Zapdos – Lightning Burn: heads, 30 to one of the opponent's Benched Pokémon; tails, 30 to itself.
  'pl3-150': {
    'Lightning Burn': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon (30 damage to it if heads)"),
      run(ctx) {
        ctx.hit(30);
        if (!ctx.flip()) return ctx.selfDamage(30);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Relicanth – Deep Sea Pressure: the Defending Pokémon's Retreat Cost is 2 more next turn.
  'pl3-SH8': {
    'Deep Sea Pressure': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => (e.pressure = ctx.turn + 1));
      },
    },
  },
};
