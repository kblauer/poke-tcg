// EX FireRed & LeafGreen (ex6) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition,
// Poké-Bodies never do.
// Agreed with the user: Fiery Aura makes Burn 4 damage counters, and it, Eerie Aura and (EX Team Rocket Returns') Methane
// Leak hit both players' Pokémon; Retreat Aid and Power Gene add up, one for each Pokémon with it; Form Variation's new
// Pokémon can evolve this turn if Ditto could have and can use its own Poké-Power this turn; Magic Odds and Magic Evens
// look at the final damage; "each Defending Pokémon" (Acid Sampler) is the opponent's Active Pokémon only.
// From the text: Sooth Dust and Acid Sampler work while their Pokémon is its player's Active Pokémon, Rest Up while Snorlax
// stays Asleep through the checkup; Head Trip confuses its own player's Active Pokémon; Energy Rain attaches from the hand
// (setting off "attached from the hand" effects) and its damage counter may Knock Out; Extra Energy Bomb Knocks Out Electrode
// ex (the opponent takes 2 Prize cards) and attaches the Energy cards once it's discarded; Legendary Ascent is its owner's
// choice as it's played onto the Bench.
import { lookupCard } from '../cards.js';
import { afflictBetweenTurns, isEnergyCardOf, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { attachBlocked, discardsLocked, energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { BASE1_POWERS } from './base1-powers.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX2_POWERS, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { EX3_POWERS } from './ex3-powers.js';
import { FOSSIL_POWERS } from './fossil-powers.js';

/** Removes up to `amount` damage from `p` (a body between turns), logged. */
export function healBetween(state: Parameters<NonNullable<PowerEffect['checkup']>>[0], owner: PlayerState, p: InPlayPokemon, amount: number, source: string) {
  const healed = Math.min(amount, p.damage);
  if (!healed) return;
  p.damage -= healed;
  addLog(state, `${source}: removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, p)}.`, owner.id);
}

/** Puts `n` damage counters on `p` (a body between turns), logged. */
export function countersBetween(state: Parameters<NonNullable<PowerEffect['checkup']>>[0], owner: PlayerState, p: InPlayPokemon, n: number, source: string) {
  p.damage += 10 * n;
  addLog(state, `${source} put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(state, p)}.`, owner.id);
}

/** The Water Energy cards in the hand Energy Rain can attach. */
const waterInHand = (s: PowerSituation) => s.me.hand.filter((c) => isEnergyCardOf(c, s.cards, 'water'));

/** Form Variation: the Basic Pokémon (not Pokémon-ex or Ditto) in the discard pile Ditto can be switched with. */
const variations = (s: PowerSituation) =>
  s.me.discard.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' && d.stage === 'basic' && !d.trainerText && !d.ex && d.name !== 'Ditto';
  });

/** Legendary Ascent: as it's put onto the Bench from the hand, its owner may switch it with their Active Pokémon. */
const legendaryAscent: PowerEffect = {
  onPlayFromHand(state, owner, pokemon) {
    const slot = owner.bench.indexOf(pokemon);
    if (slot < 0 || !owner.active) return;
    state.pendingChoice = { player: owner.id, source: 'Legendary Ascent', kind: 'mayUse', power: 'legendaryAscent', target: slot as Target };
  },
};

export const EX6_POWERS: Record<string, PowerEffect> = {
  // Butterfree – Sooth Dust: as its player's Active Pokémon, a damage counter off each of their Pokémon between turns.
  'ex6-2': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (owner.active !== pokemon) return;
      for (const p of [owner.active, ...owner.bench]) if (p) healBetween(state, owner, p, 10, 'Sooth Dust');
    },
  },
  // Dewgong – Safeguard.
  'ex6-3': EX2_POWERS['ex2-26']!,
  // Ditto – Form Variation: once a turn, a Basic Pokémon (not a Pokémon-ex or Ditto) from the discard pile takes Ditto's place,
  // with everything on it; Ditto is discarded. Not `oncePerTurn`: the new Pokémon can use its own Poké-Power this turn (agreed).
  'ex6-4': {
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : variations(s).length ? null : 'No Basic Pokémon (but Pokémon-ex and Ditto) in your discard pile'),
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: variations(s), prompt: 'Choose a Basic Pokémon from your discard pile to switch with Ditto' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      const ditto = ctx.source.card;
      ctx.me.discard = [...ctx.me.discard.filter((c) => c !== card), ditto];
      ctx.source.card = card;
      delete ctx.source.powerUsedTurn;
      ctx.log(`Form Variation: switched Ditto with ${lookupCard(ctx.state.cards, card.defId).name}, and discarded Ditto.`);
    },
  },
  // Nidoking – Power Gene: the Nidoran line's attacks do 10 more to the Defending Pokémon, for each Nidoking (attacks.ts).
  'ex6-8': { ...POKE_BODY, powerGene: { names: ['Nidoran♀', 'Nidorina', 'Nidoqueen', 'Nidoran♂', 'Nidorino'], amount: 10 } },
  // Nidoqueen – Family Bonds: the Nidoran line retreats for free (retreatBodies).
  'ex6-9': { ...POKE_BODY, familyBonds: ['Nidoran♀', 'Nidorina', 'Nidoran♂', 'Nidorino', 'Nidoking'] },
  // Pidgeot – Quick Search: once a turn, any card from the deck into the hand; one Quick Search a turn, whichever Pidgeot.
  'ex6-10': {
    blocked: (s) => (s.me.quickSearchTurn === s.turn ? 'Quick Search has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      ctx.me.quickSearchTurn = ctx.state.turn;
      ctx.pend({ kind: 'pickFromDeck', source: 'Quick Search', filter: 'any' });
    },
  },
  // Poliwrath – Spiral: as its player's Active Pokémon, the opponent's Confused Active Pokémon can't retreat (retreatError).
  'ex6-11': { ...POKE_BODY, spiral: true },
  // Rapidash – Fiery Aura (betweenTurns).
  'ex6-13': { ...POKE_BODY, fieryAura: true },
  // Slowbro – Strange Behavior: as Fossil's.
  'ex6-14': FOSSIL_POWERS['base3-43']!,
  // Snorlax – Rest Up: still Asleep after the checkup, 2 damage counters off it.
  'ex6-15': {
    ...POKE_BODY,
    checkup: (state, owner, pokemon) => void (pokemon.condition === 'asleep' && owner.active === pokemon && healBetween(state, owner, pokemon, 20, 'Rest Up')),
  },
  // Victreebel – Acid Sampler: as its player's Active Pokémon, a damage counter on the opponent's Active Pokémon between turns.
  'ex6-17': {
    ...POKE_BODY,
    checkup: (state, owner, pokemon, opp) => void (owner.active === pokemon && opp.active && countersBetween(state, opp, opp.active, 1, 'Acid Sampler')),
  },
  // Cloyster – Exoskeleton: 20 less attack damage.
  'ex6-20': { ...POKE_BODY, damageReduction: 20 },
  // Dodrio – Retreat Aid: on the Bench, the Active Pokémon (not Pokémon-ex or Baby) retreats for 2 less (retreatAid).
  'ex6-21': { ...POKE_BODY, retreatAidCost: 2 },
  // Fearow – Free Flight: with no Energy attached, its Retreat Cost is 0.
  'ex6-24': freeRetreat((pokemon) => pokemon.energy.length === 0),
  // Hypno – Eerie Aura: as its player's Active Pokémon, 2 damage counters on each Pokémon still Asleep after the checkup (both players').
  'ex6-25': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) if (side.active?.condition === 'asleep') countersBetween(state, side, side.active, 2, 'Eerie Aura');
    },
  },
  // Scyther – Leaf Ride, Voltorb – Floating Electrons: with any Energy attached, its Retreat Cost is 0.
  'ex6-29': freeRetreat((pokemon) => pokemon.energy.length > 0),
  'ex6-85': freeRetreat((pokemon) => pokemon.energy.length > 0),
  // Haunter – Head Trip: once a turn, on the Bench, its player's Active Pokémon is now Confused.
  'ex6-34': {
    oncePerTurn: true,
    blocked: (s) => (s.source === 'active' ? 'Haunter must be on your Bench' : s.me.active ? null : 'You have no Active Pokémon'),
    use: (ctx) => void (ctx.me.active && afflictBetweenTurns(ctx.state, ctx.me.id, ctx.me.active, 'confused')),
  },
  // Kakuna – Poison Payback.
  'ex6-36': EX2_POWERS['ex2-2']!,
  // Metapod – Energy Protection: 10 less attack damage for each Energy card attached, at most 30.
  'ex6-39': { ...POKE_BODY, energyProtection: { max: 30 } },
  // Persian, Raticate – Thick Skin.
  'ex6-44': EX3_POWERS['ex3-9']!,
  'ex6-48': EX3_POWERS['ex3-9']!,
  // Venomoth – Protective Dust.
  'ex6-49': EX1_POWERS['ex1-6']!,
  // Wigglytuff – Assistance: once a turn, on the Bench, a Special Condition (its player's pick) off their Active Pokémon.
  'ex6-52': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source === 'active') return 'Wigglytuff must be on your Bench';
      const a = s.me.active;
      return a && (a.condition || a.poison || a.burned) ? null : 'Your Active Pokémon has no Special Conditions';
    },
    use(ctx) {
      const a = ctx.me.active!;
      const count = (a.condition ? 1 : 0) + (a.poison ? 1 : 0) + (a.burned ? 1 : 0);
      if (count > 1) return ctx.pend({ kind: 'removeCondition', source: 'Assistance', target: 'active' });
      const label = a.condition ? null : a.poison ? 'Poisoned' : 'Burned';
      if (a.condition) a.condition = null;
      else if (a.poison) a.poison = 0;
      else a.burned = false;
      delete a.paralyzedTurn;
      ctx.log(`${pokemonName(ctx.state, a)} is no longer ${label ?? 'affected by that Special Condition'}.`);
    },
  },
  // Blastoise ex – Energy Rain: any number of times, a Water Energy card from the hand to one of the player's Pokémon, then a
  // damage counter on that Pokémon.
  'ex6-104': {
    blocked: (s) => (waterInHand(s).length ? null : 'No Water Energy cards in your hand'),
    choices: (s, c) => [
      { kind: 'handCard', field: 'cardUid', options: waterInHand(s), prompt: 'Choose a Water Energy card from your hand' },
      ...(c.cardUid ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me), prompt: 'Choose one of your Pokémon to attach it to' }] : []),
    ],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!card || !p) return;
      const blocked = attachBlocked(ctx.state.cards, [ctx.me, ctx.opp], p, card);
      if (blocked) return ctx.log(blocked);
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      p.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, p)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, card);
      p.damage += 10;
      ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Charizard ex – Energy Flame: all its Energy is Fire Energy (energyPool).
  'ex6-105': { ...POKE_BODY, energyAs: 'fire' },
  // Electrode ex – Extra Energy Bomb: once a turn, Electrode ex Knocks itself Out (the opponent takes its Prize cards); then 5
  // Energy cards from the discard pile go to the player's Pokémon (not Pokémon-ex), each where they like.
  'ex6-107': {
    oncePerTurn: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : null),
    use(ctx) {
      ctx.source.damage = Math.max(ctx.source.damage, inPlayDef(ctx.state.cards, ctx.source).hp);
      ctx.log('Extra Energy Bomb: Electrode ex is Knocked Out.');
      // Once the Knock Out has discarded Electrode ex and its cards (afterOwnMove), the Energy cards are attached.
      ctx.pend({ kind: 'attachFromDiscard', source: 'Extra Energy Bomb', count: 5, anyEnergy: true, notEx: true });
    },
  },
  // Mr. Mime ex – Magic Odds, Magic Evens: an attack's final damage of an odd (even) number of tens to it is prevented (attacks.ts).
  'ex6-110': { ...POKE_BODY, magicNumbers: 'odd' },
  'ex6-111': { ...POKE_BODY, magicNumbers: 'even' },
  // Venusaur ex – Energy Trans: as Base Set Venusaur's.
  'ex6-112': BASE1_POWERS['base1-15']!,
  // Articuno ex, Moltres ex, Zapdos ex – Legendary Ascent.
  'ex6-114': legendaryAscent,
  'ex6-115': legendaryAscent,
  'ex6-116': legendaryAscent,
};
