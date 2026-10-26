// Plasma Freeze (bw9) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: a Team Plasma Pokémon is one with Team Plasma on its card or Team Plasma Badge attached (isPlasmaPokemon);
// Freeze Zone and Dark Shade add up, one for each Glaceon or Umbreon; Power Connect (each Deoxys-EX's, adding up) is for the
// player's Team Plasma Pokémon but Deoxys-EX, to the Active Pokémon only; Plasma Search is used once a turn whichever
// Metagross (`powerTurns`); Flare Navigate's damage counter goes on the Pokémon the Fire Energy card went to; Six Feet Under
// Knocks Cofagrigus Out first (the opponent takes its Prize card), then its 3 damage counters go on the opponent's Pokémon one
// at a time, as the player likes; Color Change makes Kecleon every type of the opponent's Active Pokémon while Kecleon is its
// player's Active Pokémon; Bench Barrier keeps the damage of every attack, either player's, off its player's Benched Pokémon.
// Not done: Exeggcute's Propagation, an Ability used from the discard pile, which the game has no way to use yet.
import { typesOf } from '../cards.js';
import { opponentOf } from '../engine.js';
import type { PowerEffect } from '../powers.js';
import { inPlayDef, isPlasmaPokemon, pokemonName } from '../status.js';
import { ABILITY, inPlay } from './common.js';

export const BW9_POWERS: Record<string, PowerEffect> = {
  // Chandelure – Flare Navigate: once a turn, a Fire Energy card from the deck onto one of the player's Pokémon, which then
  // takes a damage counter.
  'bw9-16': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Flare Navigate', filter: 'energyType', type: 'fire', attach: true, counters: 1, optional: true }),
  },

  // Quagsire – Laid-Back: attack damage to it 20 less, after Weakness and Resistance.
  'bw9-22': { ...ABILITY, damageReduction: 20 },

  // Glaceon – Freeze Zone: its player's Team Plasma Pokémon retreat for 2 less (retreatBodies).
  'bw9-23': { ...ABILITY, retreatLessFor: { fits: (p, cards) => isPlasmaPokemon(cards, p), amount: 2 } },

  // Electrode – Magnetic Draw: once a turn, cards drawn until the hand has 4.
  'bw9-33': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length >= 4 ? 'You already have 4 or more cards in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, 4 - ctx.me.hand.length);
      ctx.me.hand.push(...drawn);
      ctx.log(`Magnetic Draw: drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },

  // Mr. Mime – Bench Barrier: no attack damage to its player's Benched Pokémon (attacks.ts).
  'bw9-47': { ...ABILITY, benchBarrier: true },

  // Metagross – Plasma Search: once a turn, whichever Metagross, a Team Plasma card from the deck, shown.
  'bw9-52': {
    ...ABILITY,
    blocked: (s) => (s.me.powerTurns?.['Plasma Search'] === s.turn ? 'Plasma Search has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      (ctx.me.powerTurns ??= {})['Plasma Search'] = ctx.state.turn;
      ctx.pend({ kind: 'pickFromDeck', source: 'Plasma Search', filter: 'teamPlasma', reveal: true, optional: true });
    },
  },

  // Deoxys-EX – Power Connect: its player's Team Plasma Pokémon but Deoxys-EX do 10 more to the Active Pokémon (attacks.ts).
  'bw9-53': { ...ABILITY, activeMore: (attacker, cards) => (isPlasmaPokemon(cards, attacker) && inPlayDef(cards, attacker).name !== 'Deoxys-EX' ? 10 : 0) },

  // Cofagrigus – Six Feet Under: Cofagrigus Knocked Out, then 3 damage counters on the opponent's Pokémon as the player likes.
  'bw9-56': {
    ...ABILITY,
    blocked: (s) => (s.opp.active || s.opp.bench.some(Boolean) ? null : 'Your opponent has no Pokémon in play'),
    use(ctx) {
      ctx.source.damage = Math.max(ctx.source.damage, inPlayDef(ctx.state.cards, ctx.source).hp);
      ctx.log(`Six Feet Under: ${pokemonName(ctx.state, ctx.source)} is Knocked Out.`);
      ctx.pend({ kind: 'placeCounters', source: 'Six Feet Under', count: 3, active: true });
    },
  },

  // Umbreon – Dark Shade: 20 more HP for each of its player's Team Plasma Pokémon.
  'bw9-64': {
    ...ABILITY,
    refresh(state, owner) {
      for (const p of inPlay(owner)) if (isPlasmaPokemon(state.cards, p)) p.hpPlus = (p.hpPlus ?? 0) + 20;
    },
  },

  // Latias-EX – Bright Down: nothing from the opponent's Pokémon with Abilities (attacks.ts).
  'bw9-85': { ...ABILITY, guardFrom: 'ability' },

  // Kecleon – Color Change: as its player's Active Pokémon, the types of the opponent's Active Pokémon.
  'bw9-94': {
    ...ABILITY,
    refresh(state, owner, pokemon) {
      const other = state.players[opponentOf(state, owner.id)]!.active;
      if (owner.active === pokemon && other) pokemon.variedTypes = typesOf(inPlayDef(state.cards, other));
    },
  },
};
