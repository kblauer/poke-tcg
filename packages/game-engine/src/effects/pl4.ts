// Arceus (pl4) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded are picked when the cards that
// fit differ (the same-card rule, agreed); Magma Mantle counts the Fire and Metal Energy cards, basic or Special, among the 3
// discarded; Primal Scythe's Fossil card is picked when they differ; Damage Roller's counters are put as damage counters (not
// damage); Time Spiral's card goes into the opponent's deck; Recruit uses a Supporter from the opponent's hand, then discards
// it (as Supernatural); Darkness Grace's damage counter goes on Spiritomb only if a Pokémon evolved; Serve Trash's card is any
// card; Ripple Swell's Energy cards are attached one at a time, to the Pokémon clicked; Sky Spear's Energy cards go to
// the Lost Zone; Metal Barrier stops Pokémon LV.X (`lvxProof`).
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, typesOf } from '../cards.js';
import { energyPool, type InPlayPokemon, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { devolvable, inPlayDef, pokemonName, removeTopEvolution } from '../status.js';
import { FOSSIL_NAMES } from '../trainers.js';
import { benchedSlots, damageChosen, energyCards, headsUntilTails, inPlay, opponentTargets, same } from './common.js';
import { DP3 } from './dp3.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { DPP } from './dpp.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX6 } from './ex6.js';
import { PL3 } from './pl3.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const hasTool = (p: InPlayPokemon) => (p.attached ?? []).some((a) => a.tool);
const hasNamed = (ctx: AttackContext, name: string) => inPlay(ctx.me).some((p) => inPlayDef(ctx.state.cards, p).name === name);
/** Damage counters on one of the opponent's Pokémon (not attack damage), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}
/** The player's own Pokémon, by target, for "1 of your Pokémon". */
const ownChoice = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], prompt: string, filter: (p: InPlayPokemon) => boolean = () => true): ChoiceSpec[] => {
  const options = (['active', ...benchedSlots(s.ownBench)] as Target[]).filter((t) => filter((t === 'active' ? s.attacker : s.ownBench[t])!));
  return options.length ? [{ kind: 'ownPokemon', options, prompt }] : [];
};

export const PL4: Record<string, Record<string, AttackEffect>> = {
  // Froslass – Ground Frost: nothing with a Stadium in play.
  'pl4-2': { 'Ground Frost': { run: (ctx) => (ctx.state.stadium ? ctx.log('Ground Frost did nothing.') : void ctx.hit(50)) } },
  // Heatran – Magma Mantle: the top 3 cards discarded, 20 more for each Fire or Metal Energy card among them.
  'pl4-3': {
    'Magma Mantle': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 3);
        ctx.me.discard.push(...top);
        if (top.length) ctx.log(`Discarded ${top.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the top of the deck.`);
        ctx.hit(60 + 20 * top.filter((c) => energyCardOf(ctx.state.cards, c, 'fire') || energyCardOf(ctx.state.cards, c, 'metal')).length);
      },
    },
  },
  // Kabutops – Primal Scythe: may discard a Helix Fossil, Dome Fossil or Old Amber from the hand for 50 more.
  'pl4-4': {
    'Primal Scythe': {
      choices: (s) => ((s.ownHand ?? []).some((c) => FOSSIL_NAMES.includes(lookupCard(s.cards, c.defId).name)) ? [may('Primal Scythe: discard a Helix Fossil, Dome Fossil or Old Amber from your hand for 50 more damage?')] : []),
      run(ctx) {
        const fossils = ctx.me.hand.filter((c) => FOSSIL_NAMES.includes(lookupCard(ctx.state.cards, c.defId).name));
        const boost = !!ctx.choices.boost && fossils.length > 0;
        ctx.hit(boost ? 70 : 20);
        if (boost) ctx.pend({ kind: 'discardFromHand', source: 'Primal Scythe', count: 1, only: 'fossilName' });
      },
    },
  },
  // Luxray – Gadget Bolt: with a Pokémon Tool on it, may do 100 instead, discarding the Tool.
  'pl4-5': {
    'Gadget Bolt': {
      choices: (s) => (hasTool(s.attacker) ? [may('Gadget Bolt: do 100 damage instead of 60 (discarding your Pokémon Tool)?')] : []),
      run(ctx) {
        const tool = ctx.choices.boost ? (ctx.attacker.attached ?? []).find((a) => a.tool) : undefined;
        if (!tool) return void ctx.hit(60);
        ctx.attacker.attached = ctx.attacker.attached!.filter((a) => a !== tool);
        ctx.me.discard.push(tool.card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, tool.card.defId).name}.`);
        ctx.hit(100);
      },
    },
  },
  // Mothim – Cloak Party: up to 3 Burmy and Wormadam from the deck, shown. Energy Assist: a basic Energy card from the discard
  // pile attached to one of the player's Benched Pokémon.
  'pl4-6': {
    'Cloak Party': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Cloak Party', filter: 'nameIncludes', name: ['Burmy', 'Wormadam'], reveal: true, optional: true, count: 3 })) },
    'Energy Assist': {
      run(ctx) {
        ctx.hit(30);
        if (benchedSlots(ctx.me.bench).length && ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Assist', count: 1, benchOnly: true });
      },
    },
  },
  // Swalot – Damage Roller: damage counters until the Defending Pokémon has Swalot's HP left. Entangle Tackle: may do 30 more,
  // then 30 to one of the player's own Pokémon.
  'pl4-9': {
    'Damage Roller': {
      run(ctx) {
        const left = (p: InPlayPokemon) => inPlayDef(ctx.state.cards, p).hp - p.damage;
        const n = Math.floor((left(ctx.defender) - left(ctx.attacker)) / 10);
        if (n <= 0) return ctx.log('Damage Roller did nothing.');
        putCounters(ctx, ctx.defender, n);
      },
    },
    'Entangle Tackle': {
      choices: (s) => [may('Entangle Tackle: do 30 more damage (then 30 to one of your Pokémon)?'), ...ownChoice(s, 'Entangle Tackle: choose one of your Pokémon to do 30 damage to (if you do 30 more)')],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 80 : 50);
        if (!ctx.choices.boost) return;
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') ctx.selfDamage(30);
        else if (ctx.me.bench[t]) ctx.damageBenched(ctx.me, t, 30);
      },
    },
  },
  // Toxicroak – Convert Blow: with a Psychic Energy, Poisoned; with a Fighting Energy, 30 more.
  'pl4-11': {
    'Convert Blow': {
      run(ctx) {
        const pool = energyPool(ctx.attacker, ctx.state.cards);
        const has = (t: 'psychic' | 'fighting') => ctx.attacker.energy.some((e) => energyCardOf(ctx.state.cards, e, t)) || pool.includes('any');
        ctx.hit(has('fighting') ? 60 : 30);
        if (has('psychic')) ctx.inflict('poisoned');
      },
    },
  },
  // Zapdos G – Charge Beam: heads, an Energy card from the discard pile attached to it. Lightning Strike: may discard every
  // Lightning Energy for base 80.
  'pl4-12': {
    'Charge Beam': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip() && ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromDiscard', source: 'Charge Beam', count: 1, target: 'active', anyEnergy: true });
      },
    },
    'Lightning Strike': {
      choices: (s) => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'lightning')) ? [may('Lightning Strike: discard all Lightning Energy for a base damage of 80?')] : []),
      run(ctx) {
        const gone = ctx.choices.boost ? energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'lightning')) : [];
        discardOwn(ctx, gone);
        ctx.hit(gone.length ? 80 : 40);
      },
    },
  },
  // Bronzong – Antigravity: no Retreat Cost until the end of the player's next turn.
  'pl4-14': {
    Antigravity: {
      run(ctx) {
        ctx.hit(60);
        (ctx.attacker.effects ??= {}).hoverHit = ctx.turn + 2;
      },
    },
  },
  // Golem – Tumble Down: any Fighting Energy cards discarded from the hand, 30 for each.
  'pl4-19': {
    'Tumble Down': {
      choices(s): ChoiceSpec[] {
        const n = (s.ownHand ?? []).filter((c) => energyCardOf(s.cards, c, 'fighting')).length;
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Tumble Down: how many Fighting Energy cards to discard from your hand (30 damage each)?' }] : [];
      },
      run(ctx) {
        const n = ctx.choices.amount ?? 0;
        ctx.hit(30 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Tumble Down', count: n, energyOnly: true, energyType: 'fighting' });
      },
    },
  },
  // Hariyama – Vortex Chop: base 120 against a Resistance.
  'pl4-20': { 'Vortex Chop': { run: (ctx) => void ctx.hit(ctx.defenderDef.resistance ? 120 : 60) } },
  // Omastar – Time Spiral: the top Evolution card of one of the opponent's Evolved Pokémon shuffled into their deck. Primal
  // Tentacles: 10 more for each Helix Fossil, Dome Fossil and Old Amber in the discard pile.
  'pl4-23': {
    'Time Spiral': {
      choices: (s): ChoiceSpec[] => {
        const options = (['active', ...benchedSlots(s.opponentBench)] as Target[]).filter((t) => devolvable(s.cards, (t === 'active' ? s.defender : s.opponentBench[t])!));
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Time Spiral: choose one of your opponent's Evolved Pokémon" }] : [];
      },
      run(ctx) {
        const p = ctx.choices.oppTarget === undefined ? null : theirs(ctx, ctx.choices.oppTarget);
        if (!p || !devolvable(ctx.state.cards, p) || !ctx.canAffect(ctx.opp, p)) return ctx.log('Time Spiral did nothing.');
        const top = removeTopEvolution(ctx.state, ctx.opp, p);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, top], ctx.state.rngState);
        ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} was shuffled into the deck.`, ctx.opp.id);
      },
    },
    'Primal Tentacles': { run: (ctx) => void ctx.hit(30 + 10 * ctx.me.discard.filter((c) => FOSSIL_NAMES.includes(lookupCard(ctx.state.cards, c.defId).name)).length) },
  },
  // Pelipper – Continuous Crush: coins until tails, an Energy card of the Defending Pokémon discarded for each heads.
  'pl4-24': {
    'Continuous Crush': {
      run(ctx) {
        ctx.hit(70);
        removeDefenderEnergy(ctx, headsUntilTails(ctx), 'Continuous Crush');
      },
    },
  },
  // Pichu – Baby Steps: 1 of the top 5 into the hand, the rest shuffled back.
  'pl4-25': { 'Baby Steps': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromTop', source: 'Baby Steps', looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: 1, shuffleRest: true })) } },
  // Raichu – Boosted Voltage: with a Pokémon Tool on it, 20 to each of the opponent's Benched Pokémon that isn't an Evolved Pokémon.
  'pl4-27': {
    'Boosted Voltage': {
      run(ctx) {
        ctx.hit(20);
        if (!hasTool(ctx.attacker)) return;
        for (const slot of benchedSlots(ctx.opp.bench)) if (!ctx.opp.bench[slot]!.evolvedFrom.length) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Raticate – Recruit: a Supporter from the opponent's hand discarded, its effect used.
  'pl4-29': {
    Recruit: {
      run(ctx) {
        if (!ctx.opp.hand.length) return ctx.log("Recruit did nothing: your opponent's hand is empty.");
        ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
        ctx.pend({ kind: 'supernatural', source: 'Recruit', discardIt: true });
      },
    },
  },
  // Sceptile – Leaf Blast: 20 for each Grass Energy on it.
  'pl4-30': { 'Leaf Blast': { run: (ctx) => void ctx.hit(20 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => e === 'grass' || e === 'any').length) } },
  // Sceptile – Leaf Supply: may attach a basic Energy card from the hand to one of the player's Pokémon.
  'pl4-31': {
    'Leaf Supply': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.hand.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Leaf Supply', basic: true, count: 1, anyTarget: true });
      },
    },
  },
  // Spiritomb – Darkness Grace: a card from the deck evolves one of the player's Pokémon; if one did, a damage counter on Spiritomb.
  'pl4-32': {
    'Darkness Grace': {
      run(ctx) {
        const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
        if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source: 'Darkness Grace', names, done: [], once: true, limits: true, counterOn: ctx.attacker.card.uid });
      },
    },
  },
  // Luxio – Discharge: as Supreme Victors Rotom's.
  'pl4-43': { Discharge: same(() => PL3['pl3-82']?.['Discharge']) },
  // Shelgon – Dragon Bump: 20 more with a basic Fire and a basic Water Energy card on it.
  'pl4-48': {
    'Dragon Bump': {
      run(ctx) {
        const basic = (t: 'fire' | 'water') => ctx.attacker.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId)) && energyCardOf(ctx.state.cards, e, t));
        ctx.hit(basic('fire') && basic('water') ? 60 : 40);
      },
    },
  },
  // Wormadam Plant Cloak – Magical Needle: 2 damage counters off a Benched Pokémon. Cloak Scale: with Wormadam Sandy Cloak in
  // play, Burned, Confused and Poisoned.
  'pl4-49': {
    'Magical Needle': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage > 0);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Magical Needle: choose one of your Benched Pokémon to heal' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, 20);
      },
    },
    'Cloak Scale': {
      run(ctx) {
        ctx.hit(50);
        if (!hasNamed(ctx, 'Wormadam Sandy Cloak')) return;
        for (const c of ['burned', 'confused', 'poisoned'] as const) ctx.inflict(c);
      },
    },
  },
  // Wormadam Sandy Cloak – Cloak Headbutt: with Wormadam Trash Cloak in play, 30 more.
  'pl4-50': { 'Cloak Headbutt': { run: (ctx) => void ctx.hit(hasNamed(ctx, 'Wormadam Trash Cloak') ? 90 : 60) } },
  // Wormadam Trash Cloak – Cloak Shard: 10 to one of the opponent's Pokémon, 40 with Wormadam Plant Cloak in play. Serve Trash:
  // may put a card from the opponent's discard pile on top of their deck.
  'pl4-51': {
    'Cloak Shard': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run: (ctx) => damageChosen(ctx, ctx.choices.oppTarget ?? 'active', hasNamed(ctx, 'Wormadam Plant Cloak') ? 40 : 10),
    },
    'Serve Trash': {
      choices: (s): ChoiceSpec[] => ((s.opponentDiscard ?? []).length && !s.discardsLocked ? [{ kind: 'oppDiscard', options: s.opponentDiscard!, prompt: "Serve Trash: choose a card from your opponent's discard pile to put on top of their deck" }] : []),
      run(ctx) {
        ctx.hit(30);
        const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.oppDiscardUid);
        if (!card) return;
        ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
        ctx.opp.deck.unshift(card);
        ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck.`, ctx.opp.id);
      },
    },
  },
  // Beedrill G – Raid: as Secret Wonders Beedrill's Dark Raid.
  'pl4-53': { Raid: same(() => DP3['dp3-21']?.['Dark Raid']) },
  // Kabuto – Fast Evolution: as EX FireRed & LeafGreen's.
  'pl4-67': { 'Fast Evolution': same(() => EX6['ex6-40']?.['Fast Evolution']) },
  // Pikachu – Mega Shot: every Lightning Energy discarded, then 40 to one of the opponent's Pokémon.
  'pl4-71': {
    'Mega Shot': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 40 damage to"),
      run(ctx) {
        discardOwn(ctx, energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'lightning')));
        damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 40);
      },
    },
  },
  // Arceus LV.X – Meteor Blast: as the DP Black Star Promo's. Psychic Bolt: a Lightning and a Psychic Energy discarded.
  'pl4-95': { 'Meteor Blast': same(() => DPP['dpp-DP56']?.['Meteor Blast']) },
  'pl4-96': {
    'Psychic Bolt': {
      run(ctx) {
        discardOwnEnergy(ctx, 1, 'Psychic Bolt', ['lightning']);
        discardOwnEnergy(ctx, 1, 'Psychic Bolt', ['psychic']);
        ctx.hit(100);
      },
    },
  },
  // Gengar LV.X – Compound Pain: 30 to each of the opponent's damaged Pokémon.
  'pl4-97': {
    'Compound Pain': {
      run(ctx) {
        if (ctx.defender.damage) ctx.hit(30);
        for (const slot of benchedSlots(ctx.opp.bench)) if (ctx.opp.bench[slot]!.damage) ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Salamence LV.X – Steam Blast: an Energy card discarded.
  'pl4-98': {
    'Steam Blast': {
      run(ctx) {
        discardOwnEnergy(ctx, 1, 'Steam Blast');
        ctx.hit(100);
      },
    },
  },
  // Tangrowth LV.X – Big Growth: any Grass Energy cards from the discard pile attached to the player's Pokémon.
  'pl4-99': {
    'Big Growth': {
      run(ctx) {
        const n = ctx.me.discard.filter((c) => energyCardOf(ctx.state.cards, c, 'grass')).length;
        if (n) ctx.pend({ kind: 'attachFromDiscard', source: 'Big Growth', count: n, type: 'grass', optional: true });
      },
    },
  },
  // Arceus – Bright Flame: tails, 2 Energy discarded.
  'pl4-AR3': {
    'Bright Flame': {
      run(ctx) {
        ctx.hit(80);
        if (!ctx.flip()) discardOwnEnergy(ctx, 2, 'Bright Flame');
      },
    },
  },
  // Arceus – Ripple Swell: with 6 Arceus of different types in play, up to 6 basic Energy cards from the deck, one to each
  // of 6 different Pokémon. Sky Spear: 80 to one of the opponent's Pokémon; Arceus's Energy cards to the Lost Zone.
  'pl4-AR5': {
    'Ripple Swell': {
      run(ctx) {
        const arceus = inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Arceus'));
        const types = new Set(arceus.flatMap((p) => typesOf(inPlayDef(ctx.state.cards, p))));
        if (arceus.length < 6 || types.size < 6) return ctx.log('Ripple Swell did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Ripple Swell', filter: 'basicEnergy', attach: true, optional: true, count: 6 });
      },
    },
    'Sky Spear': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to"),
      run(ctx) {
        damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 80);
        const lost = energyCards(ctx.attacker);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !lost.includes(e));
        (ctx.me.lostZone ??= []).push(...lost.map(({ converted: _c, windless: _w, ...c }) => c));
        if (lost.length) ctx.log(`${lost.length} Energy card${lost.length === 1 ? '' : 's'} went to the Lost Zone.`);
      },
    },
  },
  // Arceus – Metal Barrier: nothing from Pokémon LV.X next turn.
  'pl4-AR9': {
    'Metal Barrier': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).lvxProof = ctx.turn + 1;
      },
    },
  },
  // Shinx – Payback: 30 more when the opponent has 1 Prize card left.
  'pl4-SH12': { Payback: { run: (ctx) => void ctx.hit(ctx.opp.prizes.length === 1 ? 40 : 10) } },
};
