// EX Holon Phantoms (ex13) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Deoxys δ's Form Change finds a Deoxys or a Deoxys δ (one Form Change a turn, whichever Deoxys);
// several Delta Reactors add up.
// From the text: Delta Supply's Energy card goes on a δ Pokémon and doesn't count as the turn's attachment; Dual Aura stops
// the Poké-Bodies of each player's Evolved Pokémon (not Pokémon-ex) while its partner is in play, Delta Reserve the
// Poké-Powers of each player's Pokémon without δ while a Holon Energy card is attached to Pidgeot (auraStops); Hydro
// Barrier works while a Holon Energy card is attached to Rayquaza; Fellowship uses the attacks of the player's Benched
// Pokémon it names (usableAttacks); Delta Support needs a Supporter with Holon in its name played this turn; Splash Back's
// Benched Pokémon is the player's pick; Driving Howl's new Active Pokémon is the opponent's pick.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { activeLocked, afflictBetweenTurns, counts, energyPool, type CardInstance } from '../engine.js';
import { attachBlocked, discardsLocked, energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { babyEvolution, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { formChange } from './ex8-powers.js';
import { EX12_POWERS } from './ex12-powers.js';

/** A δ Pokémon (its name ends " δ"). */
const isDelta = (s: Pick<PowerSituation, 'cards'>, p: Parameters<typeof inPlayDef>[1]) => / δ$/.test(inPlayDef(s.cards, p).name);

/** Delta Supply's cards: basic Energy and δ Rainbow Energy cards in the hand. */
const supplies = (s: PowerSituation) =>
  s.me.hand.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isBasicEnergy(d) || d.name === 'δ Rainbow Energy';
  });

/** Delta Support's cards: basic Energy and δ Rainbow Energy cards in the discard pile. */
const supportCards = (s: PowerSituation) =>
  s.me.discard.filter((c: CardInstance) => {
    const d = lookupCard(s.cards, c.defId);
    return isBasicEnergy(d) || d.name === 'δ Rainbow Energy';
  });

export const EX13_POWERS: Record<string, PowerEffect> = {
  // Deoxys δ – Form Change.
  'ex13-3': formChange('Deoxys'),
  'ex13-4': formChange('Deoxys'),
  'ex13-5': formChange('Deoxys'),
  'ex13-6': formChange('Deoxys'),
  // Flygon δ – Delta Supply: once a turn, a basic Energy or δ Rainbow Energy card from the hand to one of the player's δ Pokémon.
  'ex13-7': {
    oncePerTurn: true,
    blocked: (s) => (!supplies(s).length ? 'No basic Energy or δ Rainbow Energy cards in your hand' : ownTargets(s.me).some((t) => isDelta(s, pokemonAt(s.me, t)!)) ? null : 'You have no δ Pokémon in play'),
    choices: (s, c) => [
      { kind: 'handCard', field: 'cardUid', options: supplies(s), prompt: 'Choose a basic Energy or δ Rainbow Energy card from your hand' },
      ...(c.cardUid ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => isDelta(s, pokemonAt(s.me, t)!)), prompt: 'Choose one of your δ Pokémon to attach it to' }] : []),
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
    },
  },
  // Gyarados δ – Delta Reactor (attacks.ts).
  'ex13-8': { ...POKE_BODY, deltaReactor: true },
  // Kingdra δ – Dragon Curse: once a turn, as the Active Pokémon, 2 damage counters on one of the opponent's δ Pokémon.
  'ex13-10': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Kingdra must be your Active Pokémon' : ownTargets(s.opp).some((t) => isDelta(s, pokemonAt(s.opp, t)!)) ? null : 'Your opponent has no δ Pokémon in play'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: ownTargets(s.opp).filter((t) => isDelta(s, pokemonAt(s.opp, t)!)), prompt: "Choose one of your opponent's δ Pokémon to put 2 damage counters on" }],
    use(ctx) {
      const p = ctx.choices.oppTo === undefined ? null : pokemonAt(ctx.opp, ctx.choices.oppTo);
      if (!p) return;
      p.damage += 20;
      ctx.log(`Dragon Curse put 2 damage counters on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Latias δ, Latios δ – Dual Aura (auraStops).
  'ex13-11': { ...POKE_BODY, dualAura: 'Latios' },
  'ex13-12': { ...POKE_BODY, name: 'Dual Aura', dualAura: 'Latias' },
  // Pidgeot δ – Delta Reserve (auraStops).
  'ex13-14': { ...POKE_BODY, deltaReserve: true },
  // Rayquaza δ – Hydro Barrier (attacks.ts).
  'ex13-16': { ...POKE_BODY, hydroBarrier: true },
  // Vileplume δ – Poison Pollen: once a turn, heads, the opponent's Active Pokémon is Poisoned.
  'ex13-17': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Poison Pollen did nothing.');
      if (ctx.opp.active) afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active, 'poisoned');
    },
  },
  // Bellossom δ – Fellowship (usableAttacks).
  'ex13-19': { ...POKE_BODY, fellowship: ['Oddish', 'Gloom', 'Vileplume', 'Vileplume ex', 'Bellossom'] },
  // Regice, Regirock, Registeel – Clear Body: no Special Conditions.
  'ex13-27': { ...POKE_BODY, noConditions: true },
  'ex13-28': { ...POKE_BODY, noConditions: true },
  'ex13-29': { ...POKE_BODY, noConditions: true },
  // Relicanth – Aqua Lift: with Water Energy attached, its Retreat Cost is 0.
  'ex13-30': freeRetreat((pokemon, cards) => energyPool(pokemon, cards).some((e) => counts(e, 'water'))),
  // Aerodactyl δ – Primal Light: once a turn, a basic Energy card from the deck, shown.
  'ex13-35': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Primal Light', filter: 'basicEnergy', reveal: true }),
  },
  // Chimecho δ – Delta Support: once a turn, with a Holon Supporter played this turn, a basic Energy or δ Rainbow Energy card from the discard pile, shown.
  'ex13-37': {
    oncePerTurn: true,
    blocked(s) {
      const supporter = s.me.supporterTurn === s.turn && s.me.discard.find((c) => c.uid === s.me.supporterUid);
      if (!supporter || !lookupCard(s.cards, supporter.defId).name.includes('Holon')) return 'You have no Supporter card with Holon in its name in play';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return supportCards(s).length ? null : 'No basic Energy or δ Rainbow Energy cards in your discard pile';
    },
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: supportCards(s), prompt: 'Choose a basic Energy or δ Rainbow Energy card to put into your hand' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.hand.push(card);
      ctx.log(`Delta Support: put ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile into the hand.`);
    },
  },
  // Golduck δ – Delta Block (trainerError).
  'ex13-43': { ...POKE_BODY, deltaBlock: true },
  // Pichu δ – Baby Evolution.
  'ex13-76': babyEvolution('Pikachu'),
  // Claw Fossil – Jagged Stone; Root Fossil – Spongy Stone: as EX Legend Maker's.
  'ex13-91': EX12_POWERS['ex12-78']!,
  'ex13-93': EX12_POWERS['ex12-80']!,
  // Crawdaunt ex – Splash Back: once a turn, with 4 or more of the opponent's Benched Pokémon, one of them goes back to their hand with its cards.
  'ex13-99': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.filter(Boolean).length >= 4 ? null : 'Your opponent has fewer than 4 Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: s.opp.bench.flatMap((p, i) => (p ? [i] : [])), prompt: "Choose one of your opponent's Benched Pokémon to return to their hand" }],
    use(ctx) {
      const slot = ctx.choices.oppTo;
      const p = typeof slot === 'number' ? ctx.opp.bench[slot] : null;
      if (!p || typeof slot !== 'number') return;
      ctx.opp.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      ctx.opp.bench[slot] = null;
      ctx.log(`Splash Back: ${pokemonName(ctx.state, p)} and all cards attached to it returned to your opponent's hand.`);
    },
  },
  // Mew ex – Psychic Vision: once a turn, on the Bench, a look at the opponent's hand.
  'ex13-100': {
    oncePerTurn: true,
    blocked: (s) => (s.source === 'active' ? 'Mew ex must be on your Bench' : null),
    use: (ctx) => ctx.pend({ kind: 'lookOppHand', source: 'Psychic Vision' }),
  },
  // Mightyena ex – Driving Howl: once a turn, the opponent switches their Active Pokémon with one of their Benched Pokémon.
  'ex13-101': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (slots.length === 1) swapActive(ctx.state, ctx.opp, slots[0]!);
      else ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Driving Howl', kind: 'switchIn' };
    },
  },
};
