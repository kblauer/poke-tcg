// Rising Rivals (pl2) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded are picked when the cards that
// fit differ (the same-card rule, agreed); "evolved from Eevee during this turn" is an Eeveelution evolved this turn; Needle
// Shock's effect is skipped after any of the player's Pokémon used it during their last turn (`needleShockTurn`); Crunch marks
// the Defending Pokémon (`crunch`): attack damage to it is 40 more until the end of the player's next turn; Long Whip and Fling
// Away hit only the opponent's Benched Pokémon; Brush Off puts the Defending Pokémon's cards on top of the deck, then shuffles;
// Magic Heal's counters are removed one at a time from the Pokémon clicked (removeDamage); Mend takes a basic Metal Energy card;
// Damage Porter (Technical Machine G) counts the damage counters on the Pokémon it's attached to.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, isPokemonCard, lookupCard, namesMatch } from '../cards.js';
import { afflictBetweenTurns, isEnergyCardOf, retireStadium, type InPlayPokemon, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { clearSpecialConditions, evolvedFromName, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, damageChosen, energyCards, headsUntilTails, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { DP2 } from './dp2.js';
import { DP4 } from './dp4.js';
import { DP5 } from './dp5.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { discardAtRandom, energyAmount } from './ex1.js';
import { energyCardOf } from './ex2.js';
import { EX7 } from './ex7.js';
import { EX8 } from './ex8.js';
import { notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
/** Damage counters on one of the opponent's Pokémon (not attack damage), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}
/** An Eeveelution that evolved from Eevee this turn (Evolving Flare, Evolving Thunder, Evolving Aqua). */
const evolvedNow = (ctx: AttackContext) => ctx.attacker.playedTurn === ctx.turn && ctx.attacker.evolvedFrom.length > 0 && evolvedFromName(ctx.state.cards, ctx.attacker, 'Eevee');
/** Each player shuffles their hand into their deck and draws up to `n`, the attacking player first (Hand Refresh). */
function refreshHands(ctx: AttackContext, n: number, source: string) {
  for (const side of [ctx.me, ctx.opp]) {
    [side.deck, ctx.state.rngState] = shuffle([...side.deck, ...side.hand], ctx.state.rngState);
    ctx.log(`Shuffled ${side.hand.length} card${side.hand.length === 1 ? '' : 's'} from the hand into the deck.`, side.id);
    side.hand = [];
  }
  if (ctx.opp.deck.length) (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source, kind: 'drawCount', max: n, afterAttack: true });
  if (ctx.me.deck.length) ctx.pend({ kind: 'drawCount', source, max: n });
}
/** "If the Defending Pokémon is affected by a Special Condition, you may do 30 damage to any 1 Benched Pokémon instead" (Long Whip). */
const benchInstead = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], prompt: string): ChoiceSpec[] => {
  const options = benchedSlots(s.opponentBench);
  return hasSpecialCondition(s.defender) && options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt }] : [];
};

export const PL2: Record<string, Record<string, AttackEffect>> = {
  // Arcanine – Burn Out: may do 30 more; then Arcanine is Burned. Flames of Rage: a Fire Energy discarded, 10 more for each damage counter on it.
  'pl2-1': {
    'Burn Out': {
      choices: () => [may('Burn Out: do 30 more damage (Arcanine is then Burned)?')],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 60 : 30);
        if (ctx.choices.boost) afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'burned');
      },
    },
    'Flames of Rage': {
      run(ctx) {
        const counters = ctx.attacker.damage / 10;
        discardOwnEnergy(ctx, 1, 'Flames of Rage', ['fire']);
        ctx.hit(60 + 10 * counters);
      },
    },
  },
  // Darkrai G – Darkness Sleep: Asleep when the Defending Pokémon already had damage counters.
  'pl2-3': {
    'Darkness Sleep': {
      run(ctx) {
        const hurt = ctx.defender.damage > 0;
        ctx.hit(50);
        if (hurt) ctx.inflict('asleep');
      },
    },
  },
  // Floatzel GL – Incite: up to 2 Supporter cards from the discard pile into the hand, shown.
  'pl2-4': {
    Incite: {
      run(ctx) {
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'trainer')) ctx.pend({ kind: 'discardToHand', source: 'Incite', count: 2, filter: 'supporter', reveal: true });
        else ctx.log('Incite found nothing.');
      },
    },
  },
  // Flygon – Sand Wall: the opponent's Stadium discarded; if it was, nothing from attacks to Flygon next turn. Power Swing:
  // 10 more for each Evolved Pokémon on the Bench.
  'pl2-5': {
    'Sand Wall': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.state.stadium?.owner !== ctx.opp.id) return;
        ctx.log(`${lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name} was discarded.`, ctx.opp.id);
        retireStadium(ctx.state);
        ctx.protect('preventAll');
      },
    },
    'Power Swing': { run: (ctx) => void ctx.hit(60 + 10 * ctx.me.bench.filter((p) => p?.evolvedFrom.length).length) },
  },
  // Froslass GL – Wake-Up Slap: 20 more against a Special Condition, which it then cures.
  'pl2-6': {
    'Wake-Up Slap': {
      run(ctx) {
        const afflicted = hasSpecialCondition(ctx.defender);
        ctx.hit(afflicted ? 50 : 30);
        if (afflicted && ctx.opp.active === ctx.defender) ctx.affectDefender(() => clearSpecialConditions(ctx.defender));
      },
    },
  },
  // Jirachi – Detour: as EX Team Rocket Returns Magby's.
  'pl2-7': { Detour: same(() => EX7['ex7-24']?.['Detour']) },
  // Luxray GL – Trash Bolt: an Energy card discarded from the hand (nothing without one).
  'pl2-9': {
    'Trash Bolt': {
      run(ctx) {
        if (!ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) return ctx.log('Trash Bolt did nothing.');
        ctx.hit(70);
        ctx.pend({ kind: 'discardFromHand', source: 'Trash Bolt', count: 1, energyOnly: true });
      },
    },
  },
  // Mismagius GL – Psychic Removal: 2 heads, every Energy card on the Defending Pokémon discarded.
  'pl2-10': {
    'Psychic Removal': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flips(2) === 2) removeDefenderEnergy(ctx, energyCards(ctx.defender).length, 'Psychic Removal');
      },
    },
  },
  // Rampardos GL – Trample: a coin for each Benched Pokémon, both players'; 30 to it on heads.
  'pl2-11': {
    Trample: {
      run(ctx) {
        for (const side of [ctx.opp, ctx.me]) for (const slot of benchedSlots(side.bench)) if (ctx.flip()) ctx.damageBenched(side, slot, 30);
      },
    },
  },
  // Roserade GL – Long Whip: against a Special Condition, may do the 30 to one of the opponent's Benched Pokémon instead.
  'pl2-12': {
    'Long Whip': {
      choices: (s) => benchInstead(s, "Long Whip: you may do the 30 damage to one of your opponent's Benched Pokémon instead"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 30);
        else ctx.hit(30);
      },
    },
  },
  // Shiftry – Conform: Confused when both hands are the same size. Seal Off: no Poké-Powers or Poké-Bodies for the Defending Pokémon next turn.
  'pl2-13': {
    Conform: {
      run(ctx) {
        ctx.hit(40);
        if (ctx.me.hand.length === ctx.opp.hand.length) ctx.inflict('confused');
      },
    },
    'Seal Off': {
      run(ctx) {
        ctx.hit(60);
        ctx.affectDefender((e) => (e.sealed = ctx.turn + 1));
      },
    },
  },
  // Aggron – Metal Fang: may discard the top card of the deck for 2 damage counters and every Special Condition off it.
  'pl2-14': {
    'Metal Fang': {
      choices: (s) => [may('Metal Fang: discard the top card of your deck to remove 2 damage counters and all Special Conditions from Aggron?')],
      run(ctx) {
        ctx.hit(40);
        const top = ctx.choices.boost ? ctx.me.deck.shift() : undefined;
        if (!top) return;
        ctx.me.discard.push(top);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`);
        ctx.heal(20);
        clearSpecialConditions(ctx.attacker);
      },
    },
  },
  // Beedrill – Needle Shock: Paralyzed and Poisoned, unless one of the player's Pokémon used it during their last turn.
  'pl2-15': {
    'Needle Shock': {
      run(ctx) {
        ctx.hit(30);
        const used = ctx.me.needleShockTurn === ctx.turn - 2;
        ctx.me.needleShockTurn = ctx.turn;
        if (used) return ctx.log('Needle Shock was used last turn: no Special Conditions.');
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Bronzong E4 – Hand Refresh: each player's hand into their deck, up to 4 drawn, the player first. Payback: 50 more and
  // Confused when the opponent has 1 Prize card left.
  'pl2-16': {
    'Hand Refresh': { run: (ctx) => refreshHands(ctx, 4, 'Hand Refresh') },
    Payback: {
      run(ctx) {
        const last = ctx.opp.prizes.length === 1;
        ctx.hit(last ? 60 : 10);
        if (last) ctx.inflict('confused');
      },
    },
  },
  // Flareon – Evolving Flare: evolved this turn, 20 more and Burned.
  'pl2-19': {
    'Evolving Flare': {
      run(ctx) {
        const now = evolvedNow(ctx);
        ctx.hit(now ? 60 : 40);
        if (now) ctx.inflict('burned');
      },
    },
  },
  // Gastrodon East Sea – Calling Wave: up to 2 Gastrodon from the deck onto the Bench as Basic Pokémon, 2 damage counters on each.
  'pl2-21': { 'Calling Wave': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Calling Wave', filter: 'ownerPokemon', name: 'Gastrodon', toBench: true, asBasic: true, benchCounters: 2, optional: true, count: 2 })) } },
  // Gastrodon West Sea – Muddy Bomb: as Great Encounters'. Raging Sea: 10 more for each damaged Benched Pokémon.
  'pl2-22': {
    'Muddy Bomb': same(() => DP4['dp4-46']?.['Muddy Bomb']),
    'Raging Sea': { run: (ctx) => void ctx.hit(60 + 10 * ctx.me.bench.filter((p) => p?.damage).length) },
  },
  // Golem E4 – Rage: 10 more for each damage counter on it.
  'pl2-23': { Rage: { run: (ctx) => void ctx.hit(20 + ctx.attacker.damage) } },
  // Heracross E4 – Focus Energy: Megahorn's base damage is 100 next turn. Megahorn: tails, nothing.
  'pl2-24': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Megahorn', turn: ctx.turn + 2 };
        ctx.log("Heracross E4's Megahorn's base damage is 100 next turn.");
      },
    },
    Megahorn: {
      run(ctx) {
        if (ctx.flip()) ctx.hit(boosted(ctx, 'Megahorn') ? 100 : 50);
        else ctx.log('Megahorn did nothing.');
      },
    },
  },
  // Hippowdon – Save Sand: may attach a Fighting Energy card from the discard pile first; 10 more for each Energy on it.
  // Groundquake: 10 to each Benched Pokémon that isn't an Evolved Pokémon, both players'.
  'pl2-25': {
    'Save Sand': {
      choices: (s) => (!s.discardsLocked && s.ownDiscard.some((c) => energyCardOf(s.cards, c, 'fighting')) ? [may('Save Sand: attach a Fighting Energy card from your discard pile to Hippowdon first?')] : []),
      run(ctx) {
        const card = ctx.choices.boost ? ctx.me.discard.find((c) => energyCardOf(ctx.state.cards, c, 'fighting')) : undefined;
        if (card) {
          ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
          ctx.attacker.energy.push(card);
          ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${ctx.attackerDef.name}.`);
        }
        ctx.hit(20 + 10 * energyAmount(ctx, ctx.attacker));
      },
    },
    Groundquake: {
      run(ctx) {
        ctx.hit(80);
        for (const side of [ctx.opp, ctx.me]) for (const slot of benchedSlots(side.bench)) if (!side.bench[slot]!.evolvedFrom.length) ctx.damageBenched(side, slot, 10);
      },
    },
  },
  // Jolteon – Evolving Thunder: evolved this turn, 10 to each of the opponent's Benched Pokémon.
  'pl2-26': {
    'Evolving Thunder': {
      run(ctx) {
        ctx.hit(50);
        if (evolvedNow(ctx)) ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Mr. Mime E4 – Magic Heal: 3 coins, that many damage counters off the player's Pokémon, as they choose.
  'pl2-28': {
    'Magic Heal': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads && inPlay(ctx.me).some((p) => p.damage)) ctx.pend({ kind: 'removeDamage', source: 'Magic Heal', count: heads });
      },
    },
  },
  // Nidoking – Fling Away: with a Benched Pokémon, base 30 and 30 to one of the opponent's Benched Pokémon. Giga Horn: 2 tails, nothing.
  'pl2-29': {
    'Giga Horn': {
      run(ctx) {
        if (ctx.flips(2)) ctx.hit(100);
        else ctx.log('Giga Horn did nothing.');
      },
    },
    'Fling Away': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 30 damage to"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (!benchedSlots(ctx.opp.bench).length) return void ctx.hit(60);
        ctx.hit(30);
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Nidoqueen – Ruthless Tail: 10 more for each of the opponent's Benched Pokémon.
  'pl2-30': { 'Ruthless Tail': { run: (ctx) => void ctx.hit(50 + 10 * benchedSlots(ctx.opp.bench).length) } },
  // Raichu GL – Repeat Lightning: 10 more for each of the opponent's damaged Benched Pokémon.
  'pl2-31': { 'Repeat Lightning': { run: (ctx) => void ctx.hit(30 + 10 * ctx.opp.bench.filter((p) => p?.damage).length) } },
  // Snorlax – Pick and Collect: up to 4 basic Energy cards from the discard pile into the hand, shown. Roll Over: heads, both
  // Asleep; tails, Snorlax.
  'pl2-33': {
    'Pick and Collect': {
      run(ctx) {
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'discardToHand', source: 'Pick and Collect', count: 4, filter: 'basicEnergy', reveal: true });
      },
    },
    'Roll Over': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) ctx.inflict('asleep');
        ctx.sleepSelf();
      },
    },
  },
  // Vaporeon – Evolving Aqua: 40 to one of the opponent's damaged Pokémon, 60 if it evolved this turn.
  'pl2-34': {
    'Evolving Aqua': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: (['active', ...benchedSlots(s.opponentBench)] as Target[]).filter((t) => (t === 'active' ? s.defender : s.opponentBench[t])!.damage > 0), prompt: "Choose one of your opponent's Pokémon with damage counters on it" }],
      run(ctx) {
        const t = ctx.choices.oppTarget;
        if (t === undefined || !theirs(ctx, t)?.damage) return ctx.log('Evolving Aqua did nothing.');
        damageChosen(ctx, t, evolvedNow(ctx) ? 60 : 40);
      },
    },
  },
  // Walrein – Cold Crush: as Majestic Dawn Flareon's Kindle.
  'pl2-36': { 'Cold Crush': same(() => DP5['dp5-19']?.['Kindle']) },
  // Alakazam E4 – Recover: a Psychic Energy discarded, 4 damage counters off.
  'pl2-38': { Recover: { discard: { count: 1, type: 'psychic' }, run: (ctx) => ctx.heal(40) } },
  // Electrode G – Reckless Bomb: 20 to each of the opponent's Pokémon, 100 to itself.
  'pl2-39': {
    'Reckless Bomb': {
      run(ctx) {
        ctx.hit(20);
        ctx.benchDamage(ctx.opp, 20);
        ctx.selfDamage(100);
      },
    },
  },
  // Gengar GL – Attack and Hide: 3 damage counters on one of the opponent's Pokémon; may shuffle Gengar GL and its cards into the deck.
  'pl2-40': {
    'Attack and Hide': {
      choices: (s) => [...opponentTargets(s, "Choose one of your opponent's Pokémon to put 3 damage counters on"), may('Attack and Hide: shuffle Gengar GL and all cards attached to it into your deck afterward?')],
      run(ctx) {
        putCounters(ctx, theirs(ctx, ctx.choices.oppTarget ?? 'active'), 3);
        if (!ctx.choices.boost) return;
        ctx.after(() => {
          const p = ctx.attacker;
          if (ctx.me.active !== p) return;
          const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
          ctx.me.active = null;
          [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
          ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it were shuffled into the deck.`);
        });
      },
    },
  },
  // Glaceon – Ice Bind: the opponent discards a card from their hand, or the Defending Pokémon is Paralyzed.
  'pl2-41': {
    'Ice Bind': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.opp.active || !ctx.canAffect(ctx.opp, ctx.opp.active)) return;
        if (ctx.opp.hand.length) return ctx.opponentChooses({ kind: 'iceBind', source: 'Ice Bind' });
        ctx.inflict('paralyzed');
      },
    },
  },
  // Leafeon – Plus Energy: a basic Energy card from the hand attached to one of the player's Pokémon.
  'pl2-45': {
    'Plus Energy': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromHand', source: 'Plus Energy', basic: true, count: 1, anyTarget: true });
      },
    },
  },
  // Machamp GL – Brush Off: the Defending Pokémon and its cards on top of the opponent's deck, then shuffled (not without a Benched Pokémon).
  'pl2-46': {
    'Brush Off': {
      run(ctx) {
        const p = ctx.opp.active;
        if (!p || !benchedSlots(ctx.opp.bench).length) return ctx.log('Brush Off did nothing.');
        if (!ctx.canAffect(ctx.opp, p)) return;
        const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
        ctx.opp.active = null;
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...cards, ...ctx.opp.deck], ctx.state.rngState);
        ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it were shuffled into the deck.`, ctx.opp.id);
      },
    },
  },
  // Rapidash E4 – Pickup Power: 3 coins, a basic Energy card from the discard pile into the hand for each heads, shown.
  'pl2-47': {
    'Pickup Power': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads && ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'discardToHand', source: 'Pickup Power', count: heads, filter: 'basicEnergy', reveal: true });
      },
    },
  },
  // Sharpedo – Crunch: attack damage to the Defending Pokémon is 40 more until the end of the player's next turn (attacks.ts).
  'pl2-49': {
    Crunch: {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => (e.crunch = ctx.turn + 2));
      },
    },
  },
  // Starmie – Synchro Gain: 4 damage counters off it when it and the Defending Pokémon have the same amount of Energy.
  'pl2-50': {
    'Synchro Gain': {
      run(ctx) {
        ctx.hit(20);
        if (energyAmount(ctx, ctx.attacker) === energyAmount(ctx, ctx.defender)) ctx.heal(40);
      },
    },
  },
  // Steelix GL – Mend: a basic Metal Energy card from the discard pile attached to it, then a damage counter off.
  'pl2-51': {
    Mend: {
      run(ctx) {
        if (!ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)) && isEnergyCardOf(c, ctx.state.cards, 'metal'))) return ctx.log('Mend found nothing.');
        ctx.pend({ kind: 'attachFromDiscard', source: 'Mend', count: 1, target: 'active', type: 'metal' });
        ctx.heal(10);
      },
    },
  },
  // Tropius – Fly: tails, nothing; heads, nothing from attacks to it next turn. Blessed Fruit: every damage counter off a Benched Grass Pokémon.
  'pl2-52': {
    Fly: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fly did nothing.');
        ctx.hit(30);
        ctx.protect('preventAll');
      },
    },
    'Blessed Fruit': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage && hasType(inPlayDef(s.cards, s.ownBench[i]!), 'grass'));
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Blessed Fruit: choose one of your Benched Grass Pokémon to heal' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, p.damage);
      },
    },
  },
  // Vibrava – Energy Typhoon: 20 for each Energy card in the opponent's discard pile, which then go into their deck.
  'pl2-53': {
    'Energy Typhoon': {
      run(ctx) {
        const energy = ctx.opp.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        ctx.hit(20 * energy.length);
        if (!energy.length) return;
        ctx.opp.discard = ctx.opp.discard.filter((c) => !energy.includes(c));
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...energy, ...ctx.opp.deck], ctx.state.rngState);
        ctx.log(`Shuffled ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from the discard pile into the deck.`, ctx.opp.id);
      },
    },
  },
  // Aerodactyl GL – Primal Breath: the Defending Pokémon can't evolve or level up from the hand next turn.
  'pl2-55': {
    'Primal Breath': {
      run(ctx) {
        ctx.hit(30);
        ctx.affectDefender((e) => (e.noEvolve = ctx.turn + 1));
      },
    },
  },
  // Ambipom G – Snap Attack: base 20 against Energy cards on the Defending Pokémon.
  'pl2-56': { 'Snap Attack': { run: (ctx) => void ctx.hit(energyCards(ctx.defender).length ? 20 : 60) } },
  // Eevee – Signs of Evolution: up to 2 cards that evolve from Eevee from the deck, shown.
  'pl2-59': { 'Signs of Evolution': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'evolvesFrom', name: 'Eevee', reveal: true, optional: true, count: 2 })) } },
  // Flareon E4 – Fire Tail Slap: tails, a Fire Energy discarded.
  'pl2-60': {
    'Fire Tail Slap': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) discardOwnEnergy(ctx, 1, 'Fire Tail Slap', ['fire']);
      },
    },
  },
  // Forretress G – Shell Scatter: 10 to each of the opponent's Pokémon; not next turn. Bomb Risk: 10 to each Benched Pokémon, both players'; tails, 80 to itself.
  'pl2-61': {
    'Shell Scatter': {
      run(ctx) {
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
        notNextTurn(ctx, 'Shell Scatter');
      },
    },
    'Bomb Risk': {
      run(ctx) {
        ctx.hit(80);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
        if (!ctx.flip()) ctx.selfDamage(80);
      },
    },
  },
  // Kakuna – Dangerous Evolution: Poisoned; heads, it evolves from the deck.
  'pl2-66': {
    'Dangerous Evolution': {
      run(ctx) {
        ctx.inflict('poisoned');
        if (!ctx.flip()) return;
        const names = [...new Set(ctx.me.deck.flatMap((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'pokemon' && d.evolvesFrom && namesMatch(d.evolvesFrom, 'Kakuna') ? [d.name] : [];
        }))];
        if (names.length) ctx.pend({ kind: 'evolveFromDeck', source: 'Dangerous Evolution', target: 'active', names });
      },
    },
  },
  // Koffing – Gas Bomb: 30 to itself, no Weakness or Resistance.
  'pl2-68': {
    'Gas Bomb': {
      run(ctx) {
        ctx.hit(30);
        ctx.selfDamage(30);
      },
    },
  },
  // Nidorina – Jump Tackle: as EX Deoxys's Flip Over. Stress Poison: with damage counters on it, 20 more and Poisoned.
  'pl2-73': {
    'Jump Tackle': same(() => EX8['ex8-55']?.['Flip Over']),
    'Stress Poison': {
      run(ctx) {
        const hurt = ctx.attacker.damage > 0;
        ctx.hit(hurt ? 60 : 40);
        if (hurt) ctx.inflict('poisoned');
      },
    },
  },
  // Shellos East Sea – Ripple: heads, a damage counter on each of the opponent's Pokémon.
  'pl2-79': {
    Ripple: {
      run(ctx) {
        if (ctx.flip()) for (const p of inPlay(ctx.opp)) putCounters(ctx, p, 1);
      },
    },
  },
  // Shellos West Sea – Healing Sea: 2 coins, a damage counter off one of the player's Pokémon for each heads.
  'pl2-80': {
    'Healing Sea': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: (['active', ...benchedSlots(s.ownBench)] as Target[]).filter((t) => (t === 'active' ? s.attacker : s.ownBench[t])!.damage > 0), prompt: 'Healing Sea: choose one of your Pokémon to heal' }],
      run(ctx) {
        const heads = ctx.flips(2);
        const p = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        if (p && heads) healUpTo(ctx, ctx.me, p, 10 * heads);
      },
    },
  },
  // Snorlax – Toss and Turn: 30 more while Asleep (usable while Asleep). Heavy Press: heads, 40 more; tails, Snorlax Asleep.
  'pl2-81': {
    'Toss and Turn': { whileAsleep: true, run: (ctx) => void ctx.hit(ctx.attacker.condition === 'asleep' ? 50 : 20) },
    'Heavy Press': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(80);
        ctx.hit(40);
        ctx.sleepSelf();
      },
    },
  },
  // Weedle – Rescue String: up to 5 Pokémon from the discard pile shuffled into the deck, shown.
  'pl2-86': {
    'Rescue String': {
      run(ctx) {
        if (ctx.me.discard.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'discardToDeck', source: 'Rescue String', count: 5, of: 5 });
      },
    },
  },
  // Weezing – Damage Breakdown: as many damage counters on the Defending Pokémon as on Weezing; Weezing Confused.
  'pl2-87': {
    'Damage Breakdown': {
      run(ctx) {
        putCounters(ctx, ctx.defender, ctx.attacker.damage / 10);
        ctx.confuseSelf();
      },
    },
  },
  // Technical Machine G – Damage Porter: 10 for each damage counter on its Pokémon, to one of the opponent's Pokémon.
  'pl2-95': {
    'Damage Porter': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run: (ctx) => damageChosen(ctx, ctx.choices.oppTarget ?? 'active', ctx.attacker.damage),
    },
  },
  // Floatzel GL LV.X – Energy Cyclone: as Mysterious Treasures'.
  'pl2-104': { 'Energy Cyclone': same(() => DP2['dp2-8']?.['Energy Cyclone']) },
  // Flygon LV.X – Extreme Attack: 150 to one of the opponent's Pokémon LV.X.
  'pl2-105': {
    'Extreme Attack': {
      choices: (s): ChoiceSpec[] => {
        const options = (['active', ...benchedSlots(s.opponentBench)] as Target[]).filter((t) => inPlayDef(s.cards, (t === 'active' ? s.defender : s.opponentBench[t])!).stage === 'levelUp');
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon LV.X to do 150 damage to" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        if (t === undefined) return ctx.log('Extreme Attack did nothing: your opponent has no Pokémon LV.X.');
        damageChosen(ctx, t, 150);
      },
    },
  },
  // Hippowdon LV.X – Double Shoot: 2 Fighting Energy discarded, 40 to 2 of the opponent's Benched Pokémon.
  'pl2-107': {
    'Double Shoot': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: Math.min(2, options.length), options, prompt: "Choose 2 of your opponent's Benched Pokémon to do 40 damage to" }] : [];
      },
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Double Shoot', ['fighting']);
        for (const slot of new Set(ctx.choices.benchSlots ?? [])) if (ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 40);
      },
    },
  },
  // Infernape E4 LV.X – Fire Spin: 2 Energy discarded.
  'pl2-108': {
    'Fire Spin': {
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Fire Spin');
        ctx.hit(100);
      },
    },
  },
  // Luxray GL LV.X – Flash Impact: 30 to one of the player's own Pokémon.
  'pl2-109': {
    'Flash Impact': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ['active', ...benchedSlots(s.ownBench)], prompt: 'Flash Impact: choose one of your Pokémon to do 30 damage to' }],
      run(ctx) {
        ctx.hit(60);
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') ctx.selfDamage(30);
        else if (ctx.me.bench[t]) ctx.damageBenched(ctx.me, t, 30);
      },
    },
  },
  // Mismagius GL LV.X – Darkness Magic: a damage counter on the Defending Pokémon for each card in the hand, up to 8.
  'pl2-110': { 'Darkness Magic': { run: (ctx) => putCounters(ctx, ctx.defender, Math.min(8, ctx.me.hand.length)) } },
  // Snorlax LV.X – Exercise: any Energy cards discarded from the hand, a damage counter off Snorlax for each.
  'pl2-111': {
    Exercise: {
      run(ctx) {
        ctx.hit(80);
        if (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'discardFromHand', source: 'Exercise', count: ctx.me.hand.length, energyOnly: true, upTo: true, healOn: 'active' });
      },
    },
  },
  // Flying Pikachu – Fly: as Tropius's.
  'pl2-113': { Fly: same(() => PL2['pl2-52']?.['Fly']) },
  // Heat Rotom – Warm Up: a Fire Energy card from the deck attached to one of the player's Benched Pokémon.
  'pl2-RT3': {
    'Warm Up': {
      run(ctx) {
        if (ctx.me.deck.length && benchedSlots(ctx.me.bench).length) ctx.pend({ kind: 'pickFromDeck', source: 'Warm Up', filter: 'typedEnergy', type: 'fire', attach: true, attachOnly: { bench: true } });
      },
    },
  },
  // Mow Rotom – Mow Down: heads, an Energy card discarded from each of the opponent's Pokémon.
  'pl2-RT4': {
    'Mow Down': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.flip()) return;
        for (const target of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) removeDefenderEnergy(ctx, 1, 'Mow Down', { target });
      },
    },
  },
  // Wash Rotom – Drain Wash: coins until tails, a random card from the opponent's hand discarded for each heads.
  'pl2-RT5': {
    'Drain Wash': {
      run(ctx) {
        ctx.hit(30);
        const heads = headsUntilTails(ctx);
        for (let i = 0; i < heads && ctx.opp.hand.length; i++) discardAtRandom(ctx);
      },
    },
  },
};

