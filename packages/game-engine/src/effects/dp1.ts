// Diamond & Pearl (dp1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// The era's rules apply as the EX sets' do (agreed: for every set): "1 of the Defending Pokémon" is the Active Pokémon;
// putting damage counters isn't attack damage (no Weakness, Resistance or Revenge). Removing "the highest Stage Evolution
// card" discards a Pokémon LV.X's card on it too (agreed: removeTopEvolution).
// From the text: Flash Cannon and Giga Impact ask first whether to return or discard; Transback's flip is asked first, and
// its Defending Pokémon goes into the deck before any Knock Out (as returning it to the hand does); Accelerative Dive keeps
// all attack damage, Staraptor's own included, off it until the end of its player's next turn; Metronome copies with the
// copied attack's discards (as Aquapolis's Copy); Heave discards after the flips, but does nothing with fewer than 2 cards.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import type { PendingChoice, PendingChoiceInput } from '../trainers.js';
import { hasType, lookupCard, type CardLibrary, type EnergyType } from '../cards.js';
import { counts, discardTheirEnergy, energyPool, isSpecialEnergy, PRIZE_COUNT, retreatCost, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { clearOnLeavingActive, countersMoved, devolvable, evolvedFromName, inPlayDef, pokemonName, removeTopEvolution, sameCards } from '../status.js';
import { amnesia } from './base1.js';
import { benchedSlots, energyCanMove, energyCards, headsUntilTails, inPlay, leechSeed, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { copyAttack } from './ecard2.js';
import { EX1, energyAmount, restNextTurn } from './ex1.js';
import { discardOwn, energyCardOf, EX2 } from './ex2.js';
import { EX6 } from './ex6.js';
import { EX8 } from './ex8.js';
import { energyCanGo } from './neo3.js';
import { discardStadium } from './gym2.js';
import { healUpTo } from './si1.js';

/** Damage counters on one of the opponent's Pokémon (not attack damage: no Weakness or Resistance), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}

/** The opponent's Pokémon at a target. */
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);

/** The player's own Pokémon at a target. */
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);

/** The player's Pokémon in play, as targets: those that pass `fits`. */
const ownTargets = (s: { attacker: InPlayPokemon; ownBench: (InPlayPokemon | null)[] }, fits: (p: InPlayPokemon) => boolean = () => true): Target[] => [
  ...(fits(s.attacker) ? ['active' as const] : []),
  ...benchedSlots(s.ownBench).filter((i) => fits(s.ownBench[i]!)),
];

/** A Pokémon and every card with it, shuffled into its owner's deck (Transback, Blowing Wind). Its place is emptied. */
export function shuffleIntoDeck(ctx: Pick<AttackContext, 'state' | 'log'>, owner: PlayerState, p: InPlayPokemon) {
  const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card)];
  if (owner.active === p) owner.active = null;
  else owner.bench = owner.bench.map((q) => (q === p ? null : q));
  [owner.deck, ctx.state.rngState] = shuffle([...owner.deck, ...cards], ctx.state.rngState);
  ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it were shuffled into the deck.`, owner.id);
}

/** The Pokémon loses its highest Stage Evolution card (a LV.X card on it discarded), to `to`; as evolving does, its Special Conditions and attack effects end. */
export function devolveTop(ctx: Pick<AttackContext, 'state' | 'log'>, owner: PlayerState, p: InPlayPokemon, to: 'hand' | 'deck') {
  if (!devolvable(ctx.state.cards, p)) return;
  const top = removeTopEvolution(ctx.state, owner, p);
  clearOnLeavingActive(p);
  if (to === 'hand') owner.hand.push(top);
  else [owner.deck, ctx.state.rngState] = shuffle([...owner.deck, top], ctx.state.rngState);
  ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} was removed from ${pokemonName(ctx.state, p)} and ${to === 'hand' ? 'put into the hand' : 'shuffled into the deck'}.`, owner.id);
}

/** Fire Energy cards (basic or Special) in the discard pile (Flare Up). */
const fireInDiscard = (cards: CardLibrary, discard: CardInstance[]) =>
  discard.filter((c) => {
    const d = lookupCard(cards, c.defId);
    return d.kind === 'energy' && !d.anyType && d.energyType === 'fire';
  });

/** How much Energy of `type` a Pokémon has (Dark Pulse). */
const typedAmount = (cards: CardLibrary, p: InPlayPokemon, type: 'darkness') => energyPool(p, cards).filter((e) => counts(e, type)).length;

/** A choice for the attacking player once the attack is over, after any already asked. */
function askAfter(ctx: AttackContext, choice: PendingChoiceInput) {
  if (ctx.state.pendingChoice) (ctx.state.queuedChoices ??= []).push({ ...choice, player: ctx.me.id } as PendingChoice);
  else ctx.pend(choice);
}

/**
 * `count` Energy cards discarded from the attacking Pokémon (only those of `types`, basic or Special, when given): picked by
 * its player once the attack is over when the cards that fit differ (the same-card rule, agreed), otherwise the first ones.
 * Returns how many go.
 */
export function discardOwnEnergy(ctx: AttackContext, count: number, source: string, types?: EnergyType[]) {
  const fit = energyCards(ctx.attacker).filter((e) => !types || types.some((t) => energyCardOf(ctx.state.cards, e, t)));
  const n = Math.min(count, fit.length);
  if (!n) return 0;
  if (fit.length <= count || sameCards(ctx.state.cards, fit)) discardOwn(ctx, fit.slice(0, count));
  else askAfter(ctx, { kind: 'discardAttached', source, target: 'active', count, ...(types && { types }) });
  return n;
}

/**
 * `count` Energy cards attached to the attacking Pokémon (only those of `types`, when given) back into the player's hand:
 * picked by its player once the attack is over when the cards that fit differ (the same-card rule, agreed).
 */
export function returnOwnEnergy(ctx: AttackContext, count: number, source: string, types?: EnergyType[]) {
  const fit = energyCards(ctx.attacker).filter((e) => !types || types.some((t) => energyCardOf(ctx.state.cards, e, t)));
  if (!fit.length) return 0;
  if (fit.length <= count || sameCards(ctx.state.cards, fit)) {
    const back = fit.slice(0, count);
    ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
    ctx.me.hand.push(...back.map(({ converted: _c, windless: _w, ...c }) => c));
    ctx.log(`Returned ${back.map((e) => lookupCard(ctx.state.cards, e.defId).name).join(', ')} to the hand.`);
  } else askAfter(ctx, { kind: 'discardAttached', source, target: 'active', count, toHand: true, ...(types && { types }) });
  return Math.min(count, fit.length);
}

/**
 * `count` Energy cards off one of the opponent's Pokémon (the Defending one unless `target` says), discarded (or `toBottom`
 * of their deck, or `toLostZone`; `onlySpecial`: Special Energy cards only; `types`: Energy cards of these types only): picked
 * by the attacking player once the attack is over when they differ (the same-card rule, agreed), otherwise the first ones.
 */
export function removeDefenderEnergy(ctx: AttackContext, count: number, source: string, { toBottom = false, toLostZone = false, onlySpecial = false, target = 'active' as Target, types }: { toBottom?: boolean; toLostZone?: boolean; onlySpecial?: boolean; target?: Target; types?: EnergyType[] } = {}) {
  const p = target === 'active' ? ctx.opp.active : ctx.opp.bench[target];
  const cards = p ? energyCards(p).filter((e) => (!onlySpecial || isSpecialEnergy(ctx.state.cards, e)) && (!types || types.some((t) => energyCardOf(ctx.state.cards, e, t)))) : [];
  if (count <= 0 || !p || !cards.length || !ctx.canAffect(ctx.opp, p)) return;
  if (!(toBottom || toLostZone ? energyCanMove(ctx, p) : energyCanGo(ctx, p))) return;
  if (cards.length > count && !sameCards(ctx.state.cards, cards)) return askAfter(ctx, { kind: 'removeEach', source, targets: Array<Target>(count).fill(target), ...(toBottom && { toBottom }), ...(toLostZone && { toLostZone }), ...(onlySpecial && { onlySpecial }), ...(types && { types }) });
  const gone = cards.slice(0, count);
  if (!toBottom && !toLostZone && p === ctx.opp.active) return gone.forEach((e) => ctx.discardDefenderEnergy(e.uid));
  p.energy = p.energy.filter((e) => !gone.includes(e));
  const names = gone.map((e) => lookupCard(ctx.state.cards, e.defId).name).join(', ');
  if (toLostZone) {
    (ctx.opp.lostZone ??= []).push(...gone.map(({ converted: _c, windless: _w, ...card }) => card));
    return ctx.log(`Put ${names} from ${pokemonName(ctx.state, p)} in the Lost Zone.`, ctx.opp.id);
  }
  if (!toBottom) {
    ctx.log(`Discarded ${names} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
    return discardTheirEnergy(ctx.state, ctx.opp, gone);
  }
  ctx.opp.deck.push(...gone.map(({ converted: _c, windless: _w, ...card }) => card));
  ctx.log(`Put ${gone.length} Energy card${gone.length === 1 ? '' : 's'} on the bottom of the deck.`, ctx.opp.id);
}

/** A yes-or-no question asked before the attack ("you may …"): yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });

export const DP1: Record<string, Record<string, AttackEffect>> = {
  // Dialga – Flash Cannon: may return all its Energy cards to the hand; then the Defending Pokémon's top Evolution card is shuffled into the deck.
  'dp1-1': {
    'Flash Cannon': {
      choices: (s): ChoiceSpec[] => (energyCards(s.attacker).length && devolvable(s.cards, s.defender) ? [may("Flash Cannon: return all Energy cards attached to Dialga to your hand, to shuffle the Defending Pokémon's highest Stage Evolution card into its deck?")] : []),
      run(ctx) {
        ctx.hit(40);
        if (!ctx.choices.boost) return;
        const back = energyCards(ctx.attacker);
        if (!back.length) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        ctx.log(`Returned ${back.length} Energy card${back.length === 1 ? '' : 's'} from Dialga to the hand.`);
        const defender = ctx.opp.active;
        if (defender && ctx.canAffect(ctx.opp, defender)) devolveTop(ctx, ctx.opp, defender, 'deck');
      },
    },
  },
  // Dusknoir – Hard Feelings: 5 damage counters, and 1 more for each Prize card the opponent has taken.
  'dp1-2': { 'Hard Feelings': { run: (ctx) => putCounters(ctx, ctx.defender, 5 + Math.max(0, PRIZE_COUNT - ctx.opp.prizes.length)) } },
  // Electivire – Giga Impact: may discard all its Lightning Energy for a base damage of 120.
  'dp1-3': {
    'Giga Impact': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'lightning')) ? [may('Giga Impact: discard all Lightning Energy attached to Electivire for a base damage of 120?')] : []),
      run(ctx) {
        const lightning = ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'lightning'));
        if (!ctx.choices.boost || !lightning.length) return void ctx.hit(60);
        discardOwn(ctx, lightning);
        ctx.hit(120);
      },
    },
  },
  // Luxray – Lightning Star: all its Lightning Energy to one of the player's Benched Pokémon.
  'dp1-7': {
    'Lightning Star': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to move all Lightning Energy to' }] : [];
      },
      run(ctx) {
        ctx.hit(80);
        const to = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        const moving = ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'lightning'));
        if (!to || !moving.length || !energyCanMove(ctx, ctx.attacker)) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !moving.includes(e));
        to.energy.push(...moving);
        ctx.log(`Moved ${moving.length} Lightning Energy to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Mismagius – Avenge: a damage counter for each of the player's Pokémon with damage counters on it.
  'dp1-10': { Avenge: { run: (ctx) => putCounters(ctx, ctx.defender, inPlay(ctx.me).filter((p) => p.damage > 0).length) } },
  // Palkia – Spacial Rend: a Stadium card from the deck into the hand; the Stadium in play discarded. Transback: may flip; heads,
  // all its Energy discarded and the Defending Pokémon, with its cards, shuffled into the opponent's deck.
  'dp1-11': {
    'Spacial Rend': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Spacial Rend', filter: 'stadium', reveal: true, optional: true });
        discardStadium(ctx);
      },
    },
    Transback: {
      choices: () => [may('Transback: flip a coin? Heads, all Energy attached to Palkia is discarded and the Defending Pokémon is shuffled into its deck')],
      run(ctx) {
        ctx.hit(40);
        if (!ctx.choices.boost || !ctx.flip()) return;
        discardOwn(ctx, [...ctx.attacker.energy]);
        const defender = ctx.opp.active;
        if (defender && ctx.canAffect(ctx.opp, defender)) shuffleIntoDeck(ctx, ctx.opp, defender);
      },
    },
  },
  // Roserade – Spike Whip: with Budew under it, 30 to one of the opponent's Benched Pokémon.
  'dp1-13': {
    'Spike Whip': {
      choices: (s) => (evolvedFromName(s.cards, s.attacker, 'Budew') ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 30 damage to") : []),
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && evolvedFromName(ctx.state.cards, ctx.attacker, 'Budew')) ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Staraptor – Accelerative Dive: tails, nothing; heads, no attack damage to it, either player's, until the end of the player's next turn.
  'dp1-16': {
    'Accelerative Dive': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Accelerative Dive did nothing.');
        ctx.hit(30);
        const e = (ctx.attacker.effects ??= {});
        e.preventDamage = ctx.turn + 2;
        e.selfProof = ctx.turn + 2;
        ctx.log('All damage done to Staraptor by attacks is prevented until the end of your next turn.');
      },
    },
  },
  // Torterra – Leaf Storm: 2 damage counters off each of the player's Grass Pokémon.
  'dp1-17': {
    'Leaf Storm': {
      run(ctx) {
        ctx.hit(60);
        for (const p of inPlay(ctx.me)) if (hasType(inPlayDef(ctx.state.cards, p), 'grass')) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Azumarill – Bubble Pump: 20 more with 3 or more Energy; with Azurill under it, a flip to Paralyze.
  'dp1-18': {
    'Bubble Pump': {
      run(ctx) {
        ctx.hit(energyAmount(ctx, ctx.attacker) >= 3 ? 60 : 40);
        if (evolvedFromName(ctx.state.cards, ctx.attacker, 'Azurill') && ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Clefable – Metronome: one of the Defending Pokémon's attacks, with what it needs but its Energy cost.
  'dp1-22': { Metronome: copyAttack('Metronome', { needsEnergy: false, flip: false }) },
  // Drifblim – Wind Wave: up to 5 Pokémon and Supporter cards from the discard pile shuffled into the deck, shown.
  'dp1-24': {
    'Wind Wave': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'discardToDeck', source: 'Wind Wave', count: 5, of: 5, filter: 'pokemonOrSupporter' });
      },
    },
  },
  // Gengar – Life Drain: as EX Ruby & Sapphire Kirlia's. Shadow Dance: 4 damage counters on the opponent's Pokémon as the player
  // likes, then Gengar switched with one of the player's Benched Pokémon.
  'dp1-27': {
    'Life Drain': same(() => EX1['ex1-35']?.['Life Drain']),
    'Shadow Dance': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to switch Gengar with' }] : [];
      },
      run(ctx) {
        ctx.pend({ kind: 'placeCounters', source: 'Shadow Dance', count: 4, active: true });
        if (ctx.choices.ownBenchSlot !== undefined && ctx.me.bench[ctx.choices.ownBenchSlot]) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Lopunny – Healing Wish: a damage counter off one of the player's Pokémon for each heads before a tails.
  'dp1-30': {
    'Healing Wish': {
      choices: (s): ChoiceSpec[] => {
        const options = ownTargets(s, (p) => p.damage > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon to remove damage counters from' }] : [];
      },
      run(ctx) {
        const heads = headsUntilTails(ctx);
        const p = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        if (p && heads) healUpTo(ctx, ctx.me, p, 10 * heads);
      },
    },
  },
  // Machamp – Revenge: 50 more if one of the player's Pokémon was Knocked Out by damage from the opponent's attack last turn.
  'dp1-31': { Revenge: { run: (ctx) => void ctx.hit(ctx.me.knockedOutByAttack === ctx.turn - 1 ? 70 : 20) } },
  // Medicham – Force Palm: as many damage counters as Medicham has, on one of the opponent's Pokémon.
  'dp1-32': {
    'Force Palm': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to put damage counters on"),
      run: (ctx) => putCounters(ctx, theirs(ctx, ctx.choices.oppTarget ?? 'active'), Math.floor(ctx.attacker.damage / 10)),
    },
  },
  // Munchlax – Heave: 2 cards from the hand discarded (nothing with fewer), then 30 for each heads of 2.
  'dp1-33': {
    Heave: {
      run(ctx) {
        if (ctx.me.hand.length < 2) return ctx.log('Heave did nothing: there are fewer than 2 cards in your hand.');
        ctx.pend({ kind: 'discardFromHand', source: 'Heave', count: 2 });
        ctx.hit(30 * ctx.flips(2));
      },
    },
  },
  // Noctowl – See Beyond: a card from the hand becomes a face-up Prize card, a face-down one (at random) goes into the hand; nothing with every Prize card face up.
  'dp1-34': {
    'See Beyond': {
      run(ctx) {
        const faceDown = ctx.me.prizes.filter((c) => !ctx.me.faceUpPrizes?.includes(c.uid));
        if (!faceDown.length || !ctx.me.hand.length) return ctx.log('See Beyond did nothing.');
        ctx.pend({ kind: 'handToPrize', source: 'See Beyond' });
      },
    },
  },
  // Snorlax – Ease Up: Asleep; 30 more if it evolved from Munchlax.
  'dp1-37': {
    'Ease Up': {
      run(ctx) {
        ctx.hit(evolvedFromName(ctx.state.cards, ctx.attacker, 'Munchlax') ? 70 : 40);
        ctx.sleepSelf();
      },
    },
  },
  // Vespiquen – Leaf Honey: a Grass Energy discarded, all damage counters off one of the player's Benched Grass Pokémon. Attack
  // Order: 10 for each Grass Pokémon in play, both players'.
  'dp1-39': {
    'Leaf Honey': {
      discard: { count: 1, type: 'grass' },
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => hasType(inPlayDef(s.cards, s.ownBench[i]!), 'grass'));
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Grass Pokémon to remove all damage counters from' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, p.damage);
      },
    },
    'Attack Order': { run: (ctx) => void ctx.hit(10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => hasType(inPlayDef(ctx.state.cards, p), 'grass')).length) },
  },
  // Weavile – Nasty Plot: as EX Deoxys Banette's Seek Out. Dark Pulse: 10 for each Darkness Energy on the player's Pokémon.
  'dp1-40': {
    'Nasty Plot': same(() => EX8['ex8-12']?.['Seek Out']),
    'Dark Pulse': { run: (ctx) => void ctx.hit(10 * inPlay(ctx.me).reduce((n, p) => n + typedAmount(ctx.state.cards, p, 'darkness'), 0)) },
  },
  // Wobbuffet – Countercharge: heads, all its damage counters moved to the Defending Pokémon.
  'dp1-41': {
    Countercharge: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Countercharge did nothing.');
        const n = Math.floor(ctx.attacker.damage / 10);
        if (!n || !ctx.canAffect(ctx.opp, ctx.defender)) return;
        ctx.attacker.damage -= 10 * n;
        countersMoved(ctx.state, ctx.attacker, 10 * n);
        ctx.defender.damage += 10 * n;
        ctx.log(`Moved ${n} damage counter${n === 1 ? '' : 's'} from Wobbuffet to ${ctx.defenderDef.name}.`);
      },
    },
  },
  // Drifloon – Blowing Wind: heads, one of the player's Benched Pokémon and its cards shuffled into the deck.
  'dp1-46': {
    'Blowing Wind': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to shuffle into your deck (if heads)' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!ctx.flip()) return ctx.log('Blowing Wind did nothing.');
        if (p) shuffleIntoDeck(ctx, ctx.me, p);
      },
    },
  },
  // Dusclops – Roam: heads, 2 damage counters on each of the opponent's Pokémon; tails, 2 on one of the player's (asked first).
  // Gravity Wave: 10 to each of the opponent's Benched Pokémon with no Retreat Cost.
  'dp1-47': {
    Roam: {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to put 2 damage counters on (if tails)' }],
      run(ctx) {
        if (ctx.flip()) {
          for (const p of inPlay(ctx.opp)) putCounters(ctx, p, 2);
          return;
        }
        const p = mine(ctx, ctx.choices.ownTarget ?? 'active');
        if (!p) return;
        p.damage += 20;
        ctx.log(`Put 2 damage counters on ${pokemonName(ctx.state, p)}.`);
      },
    },
    'Gravity Wave': {
      run(ctx) {
        ctx.hit(30);
        const sides = [ctx.opp, ctx.me];
        ctx.opp.bench.forEach((p, i) => p && retreatCost(p, ctx.state.cards, sides, ctx.state.stadium?.card) === 0 && ctx.damageBenched(ctx.opp, i, 10));
      },
    },
  },
  // Magneton – Magnetic Ray: first, may switch in one of the opponent's Benched Pokémon with Energy attached.
  'dp1-54': {
    'Magnetic Ray': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.opponentBench).filter((i) => s.opponentBench[i]!.energy.length > 0);
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon with Energy attached to switch in first" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
        ctx.hit(40);
      },
    },
  },
  // Nuzleaf – Dirty Trick: heads, an Energy card attached to one of the opponent's Pokémon discarded.
  'dp1-57': {
    'Dirty Trick': {
      choices(s, c): ChoiceSpec[] {
        const withEnergy = [s.defender, ...s.opponentBench];
        const options: Target[] = withEnergy.flatMap((p, i) => (p && energyCards(p).length ? [i === 0 ? 'active' : i - 1] : []));
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon to discard an Energy card from (if heads)" }];
        const p = c.oppTarget === undefined ? null : c.oppTarget === 'active' ? s.defender : s.opponentBench[c.oppTarget];
        if (p) specs.push({ kind: 'pokemonEnergy', options: energyCards(p), prompt: 'Choose the Energy card to discard' });
        return specs;
      },
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Dirty Trick did nothing.');
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : theirs(ctx, t);
        const card = p?.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!p || !card) return;
        if (t === 'active') return ctx.discardDefenderEnergy(card.uid);
        if (!ctx.canAffect(ctx.opp, p) || !energyCanGo(ctx, p)) return;
        p.energy = p.energy.filter((e) => e !== card);
        discardTheirEnergy(ctx.state, ctx.opp, [card]);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
  // Rapidash – Blaze Up: tails, a Fire Energy discarded and 10 to each of the opponent's Benched Pokémon.
  'dp1-59': {
    'Blaze Up': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip()) return;
        discardOwnEnergy(ctx, 1, 'Blaze Up', ['fire']);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Rhydon – Crash Impact: 10 to itself, then the opponent switches the Defending Pokémon.
  'dp1-60': {
    'Crash Impact': {
      run(ctx) {
        ctx.hit(60);
        ctx.selfDamage(10);
        opponentSwitches(ctx, 'Crash Impact');
      },
    },
  },
  // Azurill – Delivery: as EX Sandstorm Snorunt's Sniff Out.
  'dp1-69': { Delivery: same(() => EX2['ex2-44']?.['Sniff Out']) },
  // Bidoof – Amnesia (a shared wording); Scavenge: a Trainer card from the discard pile, shown.
  'dp1-70': {
    Scavenge: {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'discardToHand', source: 'Scavenge', count: 1, filter: 'trainer', reveal: true });
      },
    },
  },
  // Bonsly – Fake Tears: heads, no Trainer cards from the opponent's hand next turn, and 30 less damage to Bonsly then.
  'dp1-71': {
    'Fake Tears': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fake Tears did nothing.');
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 30, until: ctx.turn + 1 };
        ctx.log("Your opponent can't play Trainer cards next turn, and damage to Bonsly is reduced by 30.");
      },
    },
  },
  // Cherubi – Leech Seed: a damage counter off it if the attack does damage.
  'dp1-75': { 'Leech Seed': leechSeed(20) },
  // Combee – Soliciting Nectar: one of the opponent's Benched Pokémon switched in, and the new Defending Pokémon is Asleep.
  'dp1-79': {
    'Soliciting Nectar': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return ctx.log('Soliciting Nectar did nothing.');
        const before = ctx.opp.active;
        ctx.switchDefender(slot);
        if (ctx.opp.active !== before) ctx.inflict('asleep');
      },
    },
  },
  // Duskull – Disable: heads, one of the Defending Pokémon's attacks can't be used next turn.
  'dp1-80': {
    Disable: {
      choices: (s, c) => amnesia.choices!(s, c),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Disable did nothing.');
        amnesia.run(ctx);
      },
    },
  },
  // Electabuzz – Shock Wave: a flip to Paralyze; evolved from Elekid, 20 to one of the opponent's Benched Pokémon.
  'dp1-81': {
    'Shock Wave': {
      choices: (s) => (evolvedFromName(s.cards, s.attacker, 'Elekid') ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to") : []),
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('paralyzed');
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && evolvedFromName(ctx.state.cards, ctx.attacker, 'Elekid')) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Gastly – Pain Payback: a damage counter moved from Gastly to one of the opponent's Pokémon.
  'dp1-82': {
    'Pain Payback': {
      choices: (s) => (s.attacker.damage >= 10 ? opponentTargets(s, "Choose one of your opponent's Pokémon to move a damage counter to") : []),
      run(ctx) {
        const p = theirs(ctx, ctx.choices.oppTarget ?? 'active');
        if (ctx.attacker.damage < 10 || !p || !ctx.canAffect(ctx.opp, p)) return ctx.log('Pain Payback did nothing.');
        ctx.attacker.damage -= 10;
        countersMoved(ctx.state, ctx.attacker, 10);
        p.damage += 10;
        ctx.log(`Moved a damage counter from Gastly to ${pokemonName(ctx.state, p)}.`);
      },
    },
  },
  // Onix – Tunneling: as EX FireRed & LeafGreen's.
  'dp1-92': { Tunneling: same(() => EX6['ex6-42']?.Tunneling) },
  // Roselia – Toxic Spikes: Poisoned; evolved from Budew, 10 damage too. Sweet Spike: Asleep, and 2 damage counters off one of the player's Pokémon.
  'dp1-96': {
    'Toxic Spikes': {
      run(ctx) {
        if (evolvedFromName(ctx.state.cards, ctx.attacker, 'Budew')) ctx.hit(10);
        ctx.inflict('poisoned');
      },
    },
    'Sweet Spike': {
      choices: (s): ChoiceSpec[] => {
        const options = ownTargets(s, (p) => p.damage > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon to remove 2 damage counters from' }] : [];
      },
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('asleep');
        const p = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        if (p) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Infernape LV.X – Flare Up: 8 Fire Energy cards from the discard pile shuffled into the deck, shown; nothing without 8.
  'dp1-121': {
    'Flare Up': {
      run(ctx) {
        const fire = discardsLocked([ctx.me, ctx.opp], ctx.state.cards) ? [] : fireInDiscard(ctx.state.cards, ctx.me.discard);
        if (fire.length < 8) return ctx.log("Flare Up did nothing: there aren't 8 Fire Energy cards in your discard pile.");
        const back = fire.slice(0, 8);
        ctx.me.discard = ctx.me.discard.filter((c) => !back.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...back], ctx.state.rngState);
        ctx.log('Shuffled 8 Fire Energy cards from the discard pile into the deck.');
        ctx.hit(150);
      },
    },
  },
};

