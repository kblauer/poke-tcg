// EX Team Magma vs Team Aqua (ex4) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition,
// Poké-Bodies never do.
// Agreed with the user: Overheat's and Auxiliary Light's 2 damage counters may Knock their Pokémon Out (as Psy Shadow);
// Auxiliary Light attaches from the hand (as Water Call), so it sets off "attached from the hand" effects.
// From the text: Power Saver counts both players' Pokémon with its team in their names (attackError); Power Shift moves any
// number of basic Energy cards, one at a time (`shiftEnergy`); Magma Switch moves one Energy card from a Pokémon with Team
// Magma in its name; Dark Lift counts any Energy providing Darkness (Aqua Energy too).
import { isBasicEnergy, lookupCard } from '../cards.js';
import { counts, energyPool, type Target } from '../engine.js';
import { attachBlocked, discardsLocked, energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { pokemonName } from '../status.js';
import { freeRetreat, POKE_BODY } from './ex2-powers.js';

/** The player's Pokémon with `team` in their names that have Energy cards (basic ones, with `basic`) attached. */
const teamWithEnergy = (s: PowerSituation, team: string, basic: boolean): Target[] =>
  ownTargets(s.me).filter((t) => {
    const p = pokemonAt(s.me, t)!;
    return lookupCard(s.cards, p.card.defId).name.includes(team) && p.energy.some((e) => !e.provides && (!basic || isBasicEnergy(lookupCard(s.cards, e.defId))));
  });

/** A basic Energy card. */
const isBasic = (s: Pick<PowerSituation, 'cards'>, uid: { defId: string; provides?: unknown }) => !uid.provides && isBasicEnergy(lookupCard(s.cards, uid.defId));

export const EX4_POWERS: Record<string, PowerEffect> = {
  // Team Aqua's Kyogre, Team Magma's Groudon – Power Saver: it can't attack while 3 or fewer Pokémon in play have its team in their names.
  'ex4-3': { ...POKE_BODY, powerSaver: 'Team Aqua' },
  'ex4-9': { ...POKE_BODY, powerSaver: 'Team Magma' },

  // Team Aqua's Manectric – Power Shift: once a turn, any number of basic Energy cards from a Team Aqua Pokémon to another of the player's Pokémon.
  'ex4-4': {
    oncePerTurn: true,
    blocked: (s) => (teamWithEnergy(s, 'Team Aqua', true).length && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon with Team Aqua in its name has a basic Energy card attached'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: teamWithEnergy(s, 'Team Aqua', true), prompt: 'Choose a Pokémon with Team Aqua in its name to move basic Energy cards from' },
      ...(c.from !== undefined ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move them to' }] : []),
    ],
    use(ctx) {
      if (ctx.choices.from === undefined || ctx.choices.to === undefined) return;
      ctx.pend({ kind: 'shiftEnergy', source: 'Power Shift', from: ctx.choices.from, to: ctx.choices.to });
    },
  },

  // Team Magma's Claydol – Magma Switch: once a turn, an Energy card from a Team Magma Pokémon to another of the player's Pokémon.
  'ex4-8': {
    oncePerTurn: true,
    blocked: (s) => (teamWithEnergy(s, 'Team Magma', false).length && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon with Team Magma in its name has an Energy card attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: teamWithEnergy(s, 'Team Magma', false), prompt: 'Choose a Pokémon with Team Magma in its name to move an Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides), prompt: 'Choose the Energy card to move' }] : []),
        ...(from ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Team Magma's Camerupt – Overheat: once a turn, a basic Energy card from the discard pile to it, then 2 damage counters on it (they may Knock it Out, agreed).
  'ex4-19': {
    oncePerTurn: true,
    blocked(s) {
      if (!s.me.discard.some((c) => isBasic(s, c))) return 'No basic Energy cards in your discard pile';
      return discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : null;
    },
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: s.me.discard.filter((c) => isBasic(s, c)), prompt: 'Choose a basic Energy card from your discard pile' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.source.energy.push(card);
      ctx.source.damage += 20;
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, ctx.source)}, and put 2 damage counters on it.`);
    },
  },

  // Team Aqua's Carvanha – Dark Lift: with any Darkness Energy attached, its Retreat Cost is 0.
  'ex4-25': freeRetreat((pokemon, cards) => energyPool(pokemon, cards).some((e) => counts(e, 'darkness'))),

  // Team Aqua's Lanturn – Auxiliary Light: once a turn, a basic Energy card from the hand to it (attached from the hand), then 2 damage counters on it.
  'ex4-28': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => isBasic(s, c)) ? null : 'No basic Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => isBasic(s, c)), prompt: 'Choose a basic Energy card to attach to Team Aqua\'s Lanturn' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      const blocked = attachBlocked(ctx.state.cards, [ctx.me, ctx.opp], ctx.source, card);
      if (blocked) return ctx.log(blocked);
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.source.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, ctx.source)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.sourceTarget, card);
      ctx.source.damage += 20;
      ctx.log(`Put 2 damage counters on ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },

  // Team Magma's Mightyena – Call for Help: once a turn, as the Active Pokémon, a Pokémon with Team Magma in its name from the deck, shown.
  'ex4-37': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? "Team Magma's Mightyena must be your Active Pokémon" : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Call for Help', filter: 'ownerPokemon', name: 'Team Magma', reveal: true }),
  },

  // Squirtle – Shell Retreat: with any Energy cards attached, 10 less from the opponent's attacks.
  'ex4-46': { ...POKE_BODY, coreGuard: { amount: 10 } },

  // Cradily ex – Primal Vibes: as the Active Pokémon, the opponent can't evolve their Active Pokémon from the hand (as Primal Stare).
  'ex4-90': { ...POKE_BODY, primalStare: true },
};
