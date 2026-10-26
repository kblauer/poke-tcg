// Platinum (pl1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded are picked when the cards that
// fit differ (the same-card rule, agreed); "each Energy attached" counts the Energy provided; Iron Skull (Rampardos's
// Poké-Body) makes its attacks' damage swift but for Weakness; Perish Song needs the Defending Pokémon Asleep and hit by
// Midnight Eyes during the player's last turn (`midnightEyes`); Loneliness shows the hand only when it holds no Pokémon;
// Shoot Needle's 2 Pokémon are picked before the flips, the first for the first heads; Octazooka lasts while the Defending
// Pokémon stays Active; Seed Flare asks how many Grass Energy cards to attach, each then attached to the Pokémon clicked;
// Future Sight asks whose deck; Water Vein's Energy cards are any Energy cards among the 5.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isPokemonCard, lookupCard, namesMatch, typesOf } from '../cards.js';
import { afflictBetweenTurns, energyPool, type InPlayPokemon, type Target } from '../engine.js';
import { pokemonPower, powerActive } from '../powers.js';
import { shuffle } from '../rng.js';
import { clearSpecialConditions, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { isPokemonSP } from '../trainers.js';
import { benchedSlots, damageChosen, energyCards, headsUntilTails, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { DPP } from './dpp.js';
import { EX1 } from './ex1.js';
import { EX10 } from './ex10.js';
import { EX2 } from './ex2.js';
import { EX7 } from './ex7.js';
import { EX8 } from './ex8.js';
import { NEO4 } from './neo4.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { energyAmount } from './ex1.js';
import { energyCardOf } from './ex2.js';
import { returnSelf } from './gym2.js';
import { notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
const setBoost = (ctx: AttackContext, name: string, text: string) => {
  (ctx.attacker.effects ??= {}).boostedAttack = { attack: name, turn: ctx.turn + 2 };
  ctx.log(text);
};
/** A Pokémon's printed Poké-Power (working or not, agreed: "a Pokémon that has a Poké-Power"). */
const hasPokePower = (ctx: AttackContext, p: InPlayPokemon) => !!inPlayDef(ctx.state.cards, p).power && !pokemonPower(p)?.body;
/** Iron Skull: Rampardos's attack damage is changed by nothing on the Defending Pokémon but its Weakness, while the Poké-Body works. */
const ironSkull = (ctx: AttackContext) => !!pokemonPower(ctx.attacker)?.ironSkull && powerActive(ctx.attacker, ctx.state.cards, [ctx.me, ctx.opp]);
const skullHit = (ctx: AttackContext, amount: number) => ctx.hit(amount, ironSkull(ctx) ? { swift: true, keepWeakness: true } : {});
/** Switch in one of the opponent's Benched Pokémon picked by the attacker, then `then` to the new Defending Pokémon. */
const switchThen = (prompt: string, then: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, prompt),
  run(ctx) {
    const slot = ctx.choices.benchSlot;
    if (slot !== undefined && ctx.opp.bench[slot]) ctx.switchDefender(slot);
    if (ctx.opp.active) then(ctx);
  },
});

export const PL1: Record<string, Record<string, AttackEffect>> = {
  // Shaymin – Growth: as EX Sandstorm Oddish's Growth Spurt. Banette – Darkness Switch: as EX Team Rocket Returns Dark Banette's.
  'pl1-15': { Growth: same(() => EX2['ex2-78']?.['Growth Spurt']) },
  // Slakoth – Slack Off: as EX Ruby & Sapphire's. Giratina LV.X – Darkness Lost, Shaymin LV.X – Energy Flare: as the DP Black Star Promos'.
  'pl1-95': { 'Slack Off': same(() => EX1['ex1-45']?.['Slack Off']) },
  'pl1-124': { 'Darkness Lost': same(() => DPP['dpp-DP38']?.['Darkness Lost']) },
  'pl1-127': { 'Energy Flare': same(() => DPP['dpp-DP39']?.['Energy Flare']) },
  // Blastoise – Aqua Press: 10 more for each Energy on every Pokémon in play. Double Launcher: 2 Energy discarded, 60 to 2 Benched Pokémon; not next turn.
  'pl1-2': {
    'Aqua Press': { run: (ctx) => void ctx.hit(20 + 10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].reduce((n, p) => n + energyAmount(ctx, p), 0)) },
    'Double Launcher': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: Math.min(2, options.length), options, prompt: "Choose 2 of your opponent's Benched Pokémon to do 60 damage to" }] : [];
      },
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Double Launcher');
        for (const slot of new Set(ctx.choices.benchSlots ?? [])) if (ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 60);
        notNextTurn(ctx, 'Double Launcher');
      },
    },
  },
  // Dialga G – Deafen: no Trainer or Stadium cards (Supporters still) next turn. Second Strike: 20 more against 2 or more damage counters.
  'pl1-7': {
    Deafen: {
      run(ctx) {
        ctx.hit(10);
        ctx.opp.noItemsUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer or Stadium cards next turn.", ctx.opp.id);
      },
    },
    'Second Strike': { run: (ctx) => void ctx.hit(ctx.defender.damage >= 20 ? 70 : 50) },
  },
  // Gardevoir – Energy Burst: 10 more for each Energy on it and the Defending Pokémon. Psychic Protection: no Weakness next turn.
  'pl1-8': {
    'Energy Burst': { run: (ctx) => void ctx.hit(20 + 10 * (energyAmount(ctx, ctx.attacker) + energyAmount(ctx, ctx.defender))) },
    'Psychic Protection': {
      run(ctx) {
        ctx.hit(60);
        (ctx.attacker.effects ??= {}).weaknessOffUntil = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} has no Weakness next turn.`);
      },
    },
  },
  // Giratina – Earth Power: 2 coins, 10 for each heads to each of the opponent's Benched Pokémon.
  'pl1-9': {
    'Earth Power': {
      run(ctx) {
        ctx.hit(60);
        const heads = ctx.flips(2);
        if (heads) ctx.benchDamage(ctx.opp, 10 * heads);
      },
    },
  },
  // Giratina – Over Slash: 10 to each of the opponent's Pokémon.
  'pl1-10': {
    'Over Slash': {
      run(ctx) {
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Manectric – Power Wave: 30 to each Pokémon in play with a Poké-Power, both players'.
  'pl1-11': {
    'Power Wave': {
      run(ctx) {
        if (hasPokePower(ctx, ctx.defender)) ctx.hit(30);
        for (const slot of benchedSlots(ctx.opp.bench)) if (hasPokePower(ctx, ctx.opp.bench[slot]!)) ctx.damageBenched(ctx.opp, slot, 30);
        if (hasPokePower(ctx, ctx.attacker)) ctx.selfDamage(30);
        for (const slot of benchedSlots(ctx.me.bench)) if (hasPokePower(ctx, ctx.me.bench[slot]!)) ctx.damageBenched(ctx.me, slot, 30);
      },
    },
  },
  // Rampardos – Head Smash: 40 to itself when it Knocks Out the Defending Pokémon. Mold Breaker: 20 less damage to it until the end of the next turn.
  'pl1-13': {
    'Head Smash': {
      run(ctx) {
        skullHit(ctx, 80);
        if (ctx.defender.damage >= ctx.defenderDef.hp) ctx.selfDamage(40);
      },
    },
    'Mold Breaker': {
      run(ctx) {
        skullHit(ctx, 40);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 20, until: ctx.turn + 2 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks is 20 less until the end of your next turn.`);
      },
    },
  },
  // Shaymin – Flower Aroma: 2 damage counters off it, the Defending Pokémon Asleep. Damage Aid: 50 more against a Special Condition, which it then cures.
  'pl1-14': {
    'Flower Aroma': {
      run(ctx) {
        ctx.hit(10);
        ctx.heal(20);
        ctx.inflict('asleep');
      },
    },
    'Damage Aid': {
      run(ctx) {
        const afflicted = hasSpecialCondition(ctx.defender);
        ctx.hit(afflicted ? 80 : 30);
        if (afflicted && ctx.opp.active === ctx.defender) ctx.affectDefender(() => clearSpecialConditions(ctx.defender));
      },
    },
  },
  // Weavile G – Call for Family: up to 2 Basic Pokémon SP onto the Bench. Team Attack: 10 more for each Pokémon SP in play.
  'pl1-17': {
    'Call for Family': { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicSP', toBench: true, optional: true, count: 2 }) },
    'Team Attack': { run: (ctx) => void ctx.hit(10 + 10 * inPlay(ctx.me).filter((p) => isPokemonSP(inPlayDef(ctx.state.cards, p).name)).length) },
  },
  // Altaria – Midnight Eyes: Asleep (marked for Perish Song). Perish Song: Knocked Out if Asleep after Midnight Eyes last turn.
  'pl1-18': {
    'Midnight Eyes': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('asleep');
        ctx.affectDefender((e) => (e.midnightEyes = ctx.turn));
      },
    },
    'Perish Song': {
      run(ctx) {
        const marked = ctx.defender.effects?.midnightEyes === ctx.turn - 2;
        if (ctx.defender.condition !== 'asleep' || !marked) return ctx.log('Perish Song did nothing.');
        ctx.affectDefender(() => {
          ctx.defender.damage = Math.max(ctx.defender.damage, ctx.defenderDef.hp);
          ctx.log(`${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
        });
      },
    },
  },
  // Banette – Loneliness: 30 more with no Pokémon in the hand (shown).
  'pl1-19': {
    'Darkness Switch': same(() => EX7['ex7-99']?.['Darkness Switch']),
    Loneliness: {
      run(ctx) {
        const none = !ctx.me.hand.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        if (none) ctx.log(`Showed the hand: ${ctx.me.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'no cards'}.`);
        ctx.hit(none ? 60 : 30);
      },
    },
  },
  // Beautifly – Colorful Powder: by the Energy on it. Silver Scale: base 60 against a Resistance.
  'pl1-21': {
    'Colorful Powder': {
      run(ctx) {
        const n = energyAmount(ctx, ctx.attacker);
        ctx.hit(n >= 4 ? 60 : 20);
        if (n >= 4) ctx.inflict('asleep');
        if (n >= 3) ctx.inflict('burned');
        ctx.inflict('poisoned');
      },
    },
    'Silver Scale': { run: (ctx) => void ctx.hit(ctx.defenderDef.resistance ? 60 : 30) },
  },
  // Dialga – Energy Stream: heads, a basic Energy card from the discard pile attached to it.
  'pl1-23': {
    'Energy Stream': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Stream', count: 1, target: 'active' });
      },
    },
  },
  // Dustox – Smogscreen: as EX Deoxys's. Chemical Scale: Burned and Confused when the Defending Pokémon has a Poké-Power or Poké-Body.
  'pl1-25': {
    Smogscreen: same(() => EX8['ex8-51']?.['Smogscreen']),
    'Chemical Scale': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.defenderDef.power) return;
        ctx.inflict('burned');
        ctx.inflict('confused');
      },
    },
  },
  // Empoleon – Jet Smash: 70 to one of the opponent's Pokémon; not next turn.
  'pl1-26': {
    'Jet Smash': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 70 damage to"),
      run(ctx) {
        damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 70);
        notNextTurn(ctx, 'Jet Smash');
      },
    },
  },
  // Giratina – Broken-space Blow: what it Knocks Out goes to the Lost Zone.
  'pl1-27': {
    'Broken-space Blow': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.defender.damage >= ctx.defenderDef.hp) ctx.defender.lostZone = ctx.turn;
      },
    },
  },
  // Golduck – Swim: with Water Energy on any of the opponent's Pokémon, may do the 30 to a Benched Pokémon instead. Water Slide:
  // may move all its Energy cards to a Benched Pokémon for 20 more.
  'pl1-29': {
    Swim: {
      choices(s): ChoiceSpec[] {
        const water = [s.defender, ...s.opponentBench].some((p) => p && energyPool(p, s.cards).some((e) => e === 'water' || e === 'any'));
        const options = benchedSlots(s.opponentBench);
        return water && options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "Swim: you may do the 30 damage to one of your opponent's Benched Pokémon instead" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 30);
        else ctx.hit(30);
      },
    },
    'Water Slide': {
      choices: (s): ChoiceSpec[] => (energyCards(s.attacker).length && benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: [-1, ...benchedSlots(s.ownBench)], optional: true, prompt: 'Water Slide: you may move all Energy cards on Golduck to one of your Benched Pokémon for 20 more damage' }] : []),
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        if (!to) return void ctx.hit(40);
        const moved = energyCards(ctx.attacker);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !moved.includes(e));
        to.energy.push(...moved);
        ctx.log(`Moved ${moved.length} Energy card${moved.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, to)}.`);
        ctx.hit(60);
      },
    },
  },
  // Gyarados G – Wriggle: a coin for each of the opponent's Pokémon, 30 to it on heads.
  'pl1-30': {
    Wriggle: {
      run(ctx) {
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) if (ctx.flip()) damageChosen(ctx, t, 30);
      },
    },
  },
  // Infernape – Rushing Flames: any Fire Energy cards discarded from the player's Pokémon, a coin for each, 80 for each heads.
  'pl1-31': {
    'Rushing Flames': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownEnergyAny', options: [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p).filter((e) => energyCardOf(s.cards, e, 'fire')) : [])), prompt: 'Rushing Flames: discard any Fire Energy cards from your Pokémon (a coin for each, 80 damage for each heads)' }],
      run(ctx) {
        let n = 0;
        for (const p of inPlay(ctx.me)) {
          const gone = p.energy.filter((e) => !e.provides && ctx.choices.energyUids?.includes(e.uid) && energyCardOf(ctx.state.cards, e, 'fire'));
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          n += gone.length;
        }
        if (n) ctx.log(`Discarded ${n} Fire Energy card${n === 1 ? '' : 's'}.`);
        ctx.hit(80 * ctx.flips(n));
      },
    },
  },
  // Kricketune – Revenge Melody: 20 for each Kricketot and Kricketune in the discard pile. Bug Buzz: 30 more against Asleep, which wakes it.
  'pl1-32': {
    'Revenge Melody': { run: (ctx) => void ctx.hit(20 * ctx.me.discard.filter((c) => ['Kricketot', 'Kricketune'].some((n) => namesMatch(lookupCard(ctx.state.cards, c.defId).name, n))).length) },
    'Bug Buzz': {
      run(ctx) {
        const asleep = ctx.defender.condition === 'asleep';
        ctx.hit(asleep ? 80 : 50);
        if (asleep && ctx.opp.active === ctx.defender && ctx.defender.condition === 'asleep') ctx.affectDefender(() => (ctx.defender.condition = null));
      },
    },
  },
  // Lickilicky – Harrumph: one of the opponent's Pokémon's Trainer cards discarded, then 40 to it.
  'pl1-33': {
    Harrumph: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 40 damage to"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = theirs(ctx, t);
        if (p?.attached?.some((a) => !a.legendHalf) && ctx.canAffect(ctx.opp, p)) {
          const gone = p.attached.filter((a) => !a.legendHalf).map((a) => a.card);
          p.attached = p.attached.filter((a) => a.legendHalf);
          ctx.opp.discard.push(...gone);
          ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
        }
        damageChosen(ctx, t, 40);
      },
    },
  },
  // Ludicolo – Mad Dance: Confused (with Cheerful Voice's 60 more). Best Dance: as many damage counters off it as it did; not next turn.
  'pl1-34': {
    'Mad Dance': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('confused');
      },
    },
    'Best Dance': {
      run(ctx) {
        const done = ctx.hit(60);
        if (done > 0) ctx.heal(done);
        notNextTurn(ctx, 'Best Dance');
      },
    },
  },
  // Luvdisc – Sweet Kiss: as Neo Destiny Light Togetic's. Love Call: a Pokémon of the type of one of the opponent's Pokémon from the deck into the hand, shown.
  'pl1-35': {
    'Sweet Kiss': same(() => NEO4['neo4-15']?.['Sweet Kiss']),
    'Love Call': {
      choices: (s): ChoiceSpec[] => {
        const types = [...new Set([s.defender, ...s.opponentBench].flatMap((p) => (p ? typesOf(inPlayDef(s.cards, p)) : [])))];
        return types.length > 1 ? [{ kind: 'type', options: types, prompt: "Love Call: choose the type of one of your opponent's Pokémon" }] : [];
      },
      run(ctx) {
        const type = ctx.choices.type ?? typesOf(ctx.defenderDef)[0]!;
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Love Call', filter: 'pokemonType', type, reveal: true });
      },
    },
  },
  // Ninetales – Flame Bash: coins until tails, up to that many basic Fire Energy cards from the deck attached. Mysterious Flames:
  // Burned and Confused with more Energy in play than the opponent.
  'pl1-36': {
    'Flame Bash': {
      run(ctx) {
        const heads = headsUntilTails(ctx);
        if (heads && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Flame Bash', filter: 'energyType', type: 'fire', attach: true, optional: true, count: heads });
      },
    },
    'Mysterious Flames': {
      run(ctx) {
        ctx.hit(40);
        const total = (side: typeof ctx.me) => inPlay(side).reduce((n, p) => n + energyAmount(ctx, p), 0);
        if (total(ctx.me) <= total(ctx.opp)) return;
        ctx.inflict('burned');
        ctx.inflict('confused');
      },
    },
  },
  // Cacturne – Poison Experiment: may discard a Grass Energy (Poisoned) or a Darkness Energy (Paralyzed).
  'pl1-42': {
    'Poison Experiment': {
      choices(s): ChoiceSpec[] {
        const grass = s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'grass'));
        const dark = s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'darkness'));
        const options = [0, ...(grass ? [1] : []), ...(dark ? [2] : [])];
        const labels = ["Don't discard", ...(grass ? ['Discard a Grass Energy: Poisoned'] : []), ...(dark ? ['Discard a Darkness Energy: Paralyzed'] : [])];
        return options.length > 1 ? [{ kind: 'amount', options, labels, prompt: 'Poison Experiment: discard an Energy card?' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const pick = ctx.choices.amount ?? 0;
        if (!pick || !discardOwnEnergy(ctx, 1, 'Poison Experiment', [pick === 1 ? 'grass' : 'darkness'])) return;
        ctx.inflict(pick === 1 ? 'poisoned' : 'paralyzed');
      },
    },
  },
  // Carnivine – Vine Extract: Burned and Poisoned when the Defending Pokémon already had damage counters.
  'pl1-43': {
    'Vine Extract': {
      run(ctx) {
        const hurt = ctx.defender.damage > 0;
        ctx.hit(30);
        if (!hurt) return;
        ctx.inflict('burned');
        ctx.inflict('poisoned');
      },
    },
  },
  // Houndoom G – Black Cry: as EX Unseen Forces Houndour's. Dark Slash: may discard a Darkness Energy for 20 more.
  'pl1-50': {
    'Black Cry': same(() => EX10['ex10-112']?.['Black Cry']),
    'Dark Slash': {
      choices: (s) => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'darkness')) ? [may('Dark Slash: discard a Darkness Energy for 20 more damage?')] : []),
      run(ctx) {
        const boost = !!ctx.choices.boost && discardOwnEnergy(ctx, 1, 'Dark Slash', ['darkness']) > 0;
        ctx.hit(boost ? 60 : 40);
      },
    },
  },
  // Lombre – Interrupt: heads, a card from the opponent's hand (seen) shuffled into their deck.
  'pl1-52': {
    Interrupt: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Interrupt', any: true });
      },
    },
  },
  // Lucario – Do the Wave: 10 more for each Benched Pokémon.
  'pl1-53': { 'Do the Wave': { run: (ctx) => void ctx.hit(20 + 10 * benchedSlots(ctx.me.bench).length) } },
  // Mightyena – Collude: 20 more after a Supporter from the hand this turn.
  'pl1-54': { Collude: { run: (ctx) => void ctx.hit(ctx.me.supporterTurn === ctx.turn ? 40 : 20) } },
  // Muk – Strange Poison: heads the Defending Pokémon is Poisoned, tails Muk. Strange Sludge: Poisoned, 20 more and Confused.
  'pl1-57': {
    'Strange Poison': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.inflict('poisoned');
        else afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'poisoned');
      },
    },
    'Strange Sludge': {
      run(ctx) {
        const poisoned = !!ctx.attacker.poison;
        ctx.hit(poisoned ? 70 : 50);
        if (poisoned) ctx.inflict('confused');
      },
    },
  },
  // Octillery – Water Vein: the top 5 shown, a coin for each Energy card, 50 for each heads. Octazooka: while it stays Active,
  // the Defending Pokémon's attacks need heads.
  'pl1-58': {
    'Water Vein': {
      run(ctx) {
        const top = ctx.me.deck.slice(0, 5);
        ctx.log(`Revealed ${top.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'no cards'}.`);
        const n = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
        ctx.hit(50 * ctx.flips(n));
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      },
    },
    Octazooka: {
      run(ctx) {
        ctx.hit(40);
        ctx.affectDefender((e) => (e.octazooka = true));
      },
    },
  },
  // Seviper – Paralyze Poison: Poisoned; heads, Paralyzed too.
  'pl1-61': {
    'Paralyze Poison': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('poisoned');
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Vigoroth – Fight Back: 20 more with damage counters on it.
  'pl1-64': { 'Fight Back': { run: (ctx) => void ctx.hit(ctx.attacker.damage ? 70 : 50) } },
  // Wartortle – Rocket Tackle: 10 to itself; heads, no damage to it next turn.
  'pl1-65': {
    'Rocket Tackle': {
      run(ctx) {
        ctx.hit(30);
        ctx.selfDamage(10);
        if (ctx.flip()) ctx.protect('preventDamage');
      },
    },
  },
  // Zangoose – Invite and Strike: one of the opponent's Benched Pokémon switched in, then 20 to it.
  'pl1-66': { 'Invite and Strike': switchThen("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => void ctx.hit(20)) },
  // Cacnea – Shoot Needle: 2 coins, 10 to a different one of the opponent's Pokémon for each heads (picked first).
  'pl1-67': {
    'Shoot Needle': {
      choices: (s): ChoiceSpec[] => {
        const options = [-1, ...benchedSlots(s.opponentBench)];
        return [{ kind: 'opponentBenchMany', count: Math.min(2, options.length), options, prompt: "Choose 2 different Pokémon of your opponent's, in order: one for each heads" }];
      },
      run(ctx) {
        const heads = ctx.flips(2);
        for (const s of [...new Set(ctx.choices.benchSlots ?? [-1])].slice(0, heads)) damageChosen(ctx, s === -1 ? 'active' : s, 10);
      },
    },
  },
  // Chansey – Healing Trial: heads, 3 damage counters off Chansey; tails, off the Defending Pokémon.
  'pl1-69': {
    'Healing Trial': {
      run(ctx) {
        if (ctx.flip()) healUpTo(ctx, ctx.me, ctx.attacker, 30);
        else healUpTo(ctx, ctx.opp, ctx.defender, 30);
      },
    },
  },
  // Diglett – Dig Under: 10 to one of the opponent's Benched Pokémon.
  'pl1-72': {
    'Dig Under': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 10 damage to"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Happiny – Hospitality: one of the opponent's Benched Pokémon switched in, 2 damage counters off it.
  'pl1-76': { Hospitality: switchThen("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => healUpTo(ctx, ctx.opp, ctx.opp.active!, 20)) },
  // Honchkrow G – Honcho's Command: up to 2 Stadium or Team Galactic's Invention cards from the deck, shown. Target Attack: 20
  // to one of the opponent's Pokémon, 20 more with damage counters on it.
  'pl1-77': {
    "Honcho's Command": { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: "Honcho's Command", filter: 'stadiumOrInvention', optional: true, count: 2, reveal: true })) },
    'Target Attack': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        damageChosen(ctx, t, theirs(ctx, t)?.damage ? 40 : 20);
      },
    },
  },
  // Lotad – Synthesis: heads, a Grass Energy card from the deck attached to one of the player's Pokémon.
  'pl1-81': {
    Synthesis: {
      run(ctx) {
        if (ctx.flip() && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Synthesis', filter: 'typedEnergy', type: 'grass', attach: true });
      },
    },
  },
  // Misdreavus – Take Back: heads, a Trainer card from the discard pile into the hand, shown.
  'pl1-83': {
    'Take Back': {
      run(ctx) {
        if (ctx.flip() && ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'trainer')) ctx.pend({ kind: 'discardToHand', source: 'Take Back', count: 1, filter: 'trainer', reveal: true });
      },
    },
  },
  // Psyduck – Headache: heads, no Trainer, Supporter or Stadium cards next turn. Latent Power: tails, no damage and Psyduck Confused.
  'pl1-87': {
    Headache: {
      run(ctx) {
        if (!ctx.flip()) return;
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer, Supporter or Stadium cards next turn.", ctx.opp.id);
      },
    },
    'Latent Power': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(30);
        ctx.confuseSelf();
      },
    },
  },
  // Purugly G – Poor Sleep: heads, 30 more and it's Asleep.
  'pl1-88': {
    'Poor Sleep': {
      run(ctx) {
        const heads = ctx.flip();
        ctx.hit(heads ? 80 : 50);
        if (heads) ctx.sleepSelf();
      },
    },
  },
  // Ralts – Future Sight: the top 5 cards of either deck, rearranged.
  'pl1-89': {
    'Future Sight': {
      choices: (): ChoiceSpec[] => [{ kind: 'deck', options: ['own', 'opponent'], prompt: 'Choose whose deck to look at the top 5 cards of' }],
      run(ctx) {
        const owner = ctx.choices.deck === 'opponent' ? ctx.opp : ctx.me;
        const count = Math.min(5, owner.deck.length);
        if (count) ctx.pend({ kind: 'arrangeTop', source: 'Future Sight', count, deckOwner: owner.id });
      },
    },
  },
  // Shuppet – Fade Out: back to the hand with its cards (not without a Benched Pokémon).
  'pl1-92': {
    'Fade Out': {
      run(ctx) {
        if (!benchedSlots(ctx.me.bench).length) return ctx.log('Fade Out did nothing.');
        ctx.hit(30);
        ctx.after(() => returnSelf(ctx));
      },
    },
  },
  // Torchic – Focus Energy: Fire Shard's base damage is 80 next turn. Fire Shard: tails, nothing.
  'pl1-99': {
    'Focus Energy': { run: (ctx) => setBoost(ctx, 'Fire Shard', "Torchic's Fire Shard's base damage is 80 next turn.") },
    'Fire Shard': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(boosted(ctx, 'Fire Shard') ? 80 : 20);
      },
    },
  },
  // Vulpix – Reheat: up to 2 Energy cards discarded from the hand, 2 cards drawn for each.
  'pl1-102': {
    Reheat: {
      choices(s): ChoiceSpec[] {
        const n = Math.min(2, (s.ownHand ?? []).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy').length);
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Reheat: how many Energy cards to discard from your hand (2 cards drawn for each)?' }] : [];
      },
      run(ctx) {
        const n = ctx.choices.amount ?? 0;
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Reheat', count: n, energyOnly: true, drawEach: 2 });
      },
    },
  },
  // Dialga G LV.X – Remove Lost: coins until tails, an Energy card of the Defending Pokémon into the Lost Zone for each heads.
  'pl1-122': {
    'Remove Lost': {
      run(ctx) {
        ctx.hit(80);
        removeDefenderEnergy(ctx, headsUntilTails(ctx), 'Remove Lost', { toLostZone: true });
      },
    },
  },
  // Drapion LV.X – Sniping Tail: 40 to one of the opponent's Benched Pokémon; the Defending Pokémon can't retreat next turn.
  'pl1-123': {
    'Sniping Tail': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 40 damage to"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 40);
        ctx.affectDefender((e) => (e.noRetreat = ctx.turn + 1));
      },
    },
  },
  // Palkia G LV.X – Hydro Shot: 2 Energy discarded, 80 to one of the opponent's Pokémon.
  'pl1-125': {
    'Hydro Shot': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to"),
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Hydro Shot');
        damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 80);
      },
    },
  },
  // Shaymin LV.X – Seed Flare: Grass Energy cards from the hand attached to the player's Pokémon, 20 more for each.
  'pl1-126': {
    'Seed Flare': {
      choices(s): ChoiceSpec[] {
        const n = (s.ownHand ?? []).filter((c) => energyCardOf(s.cards, c, 'grass')).length;
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Seed Flare: how many Grass Energy cards from your hand to attach (20 more damage for each)?' }] : [];
      },
      run(ctx) {
        const cards = ctx.me.hand.filter((c) => energyCardOf(ctx.state.cards, c, 'grass')).slice(0, ctx.choices.amount ?? 0);
        ctx.hit(40 + 20 * cards.length);
        if (!cards.length) return;
        ctx.me.hand = ctx.me.hand.filter((c) => !cards.includes(c));
        ctx.pend({ kind: 'distributeEnergy', source: 'Seed Flare', cards, any: true });
      },
    },
  },
  // Scyther – Swords Dance: Slash's base damage is 60 next turn.
  'pl1-130': {
    'Swords Dance': { run: (ctx) => setBoost(ctx, 'Slash', "Scyther's Slash's base damage is 60 next turn.") },
    Slash: { run: (ctx) => void ctx.hit(boosted(ctx, 'Slash') ? 60 : 30) },
  },
  // Swablu – Roost: 4 damage counters off it; it can't retreat next turn.
  'pl1-SH5': {
    Roost: {
      run(ctx) {
        ctx.heal(40);
        (ctx.attacker.effects ??= {}).noRetreat = ctx.turn + 2;
      },
    },
  },
  // Vulpix – Brushfire: 10 to each of the opponent's Benched Grass Pokémon. Inflame: a Fire Energy card discarded from the hand (nothing without one).
  'pl1-SH6': {
    Brushfire: {
      run(ctx) {
        ctx.hit(10);
        for (const slot of benchedSlots(ctx.opp.bench)) if (hasType(inPlayDef(ctx.state.cards, ctx.opp.bench[slot]!), 'grass')) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
    Inflame: {
      run(ctx) {
        const fire = ctx.me.hand.find((c) => energyCardOf(ctx.state.cards, c, 'fire'));
        if (!fire) return ctx.log('Inflame did nothing.');
        ctx.me.hand = ctx.me.hand.filter((c) => c !== fire);
        ctx.me.discard.push(fire);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, fire.defId).name} from the hand.`);
        ctx.hit(30);
      },
    },
  },
};
