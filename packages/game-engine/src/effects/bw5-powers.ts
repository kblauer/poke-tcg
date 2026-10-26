// Dark Explorers (bw5) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY), stopped only by effects
// that name Abilities (Garbotoxin).
// From the text: Ancient Scream adds 10 for each Aerodactyl, to any of its player's Pokémon's attacks on the Active Pokémon,
// before Weakness and Resistance (as Battle Aura's do: they add up); Scorching Scales makes Burn 4 damage counters for the
// opponent's Burned Pokémon (4 however many Volcarona); Solar Revelation keeps everything but damage from the opponent's
// attacks off the player's Defending Pokémon while it has any Energy attached (effects that reach the Bench, such as damage
// counters put there, aren't stopped: a question for the user); Dark Cloak's "any Darkness Energy" is Energy provided (Blend
// Energy too); Airhead counts the Prize cards its player has left as the attack is chosen; Softboiled can be used only when
// the Active Pokémon has damage counters, and Diving Draw only with a card in the hand to discard.
import { lookupCard } from '../cards.js';
import type { PowerEffect } from '../powers.js';
import { inPlayDef, pokemonName } from '../status.js';
import { ABILITY } from './common.js';

export const BW5_POWERS: Record<string, PowerEffect> = {
  // Venusaur – Floral Scent: once during the player's turn, a Pokémon from the deck into the hand, shown.
  'bw5-3': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Floral Scent', filter: 'pokemon', reveal: true }),
  },

  // Volcarona – Scorching Scales: the opponent's Burned Pokémon take 4 damage counters between turns (betweenTurns).
  'bw5-22': { ...ABILITY, scorchingScales: true },

  // Slowbro – Airhead: no attacks while its player has 2, 4 or 6 Prize cards left.
  'bw5-24': {
    ...ABILITY,
    attackBlocked: (s) => ([2, 4, 6].includes(s.ownPrizes ?? -1) ? `Airhead: ${inPlayDef(s.cards, s.attacker).name} can't attack while you have ${s.ownPrizes} Prize cards left` : null),
  },

  // Empoleon – Diving Draw: once during the player's turn, a card from the hand discarded, then 2 cards drawn.
  'bw5-29': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'You have no cards in your hand to discard'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card from your hand to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      const drawn = ctx.me.deck.splice(0, 2);
      ctx.me.hand.push(...drawn);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} and drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },

  // Espeon – Solar Revelation: the opponent's attacks do nothing but damage to the player's Pokémon with Energy attached (attacks.ts).
  'bw5-48': { ...ABILITY, solarRevelation: true },

  // Aerodactyl – Ancient Scream: 10 more for the player's Pokémon's attacks to the Active Pokémon, before Weakness and Resistance.
  'bw5-53': { ...ABILITY, allyMore: { amount: 10 } },

  // Darkrai-EX – Dark Cloak: the player's Pokémon with any Darkness Energy attached have no Retreat Cost (retreatBodies).
  'bw5-63': { ...ABILITY, freeRetreatWith: 'darkness' },

  // Blissey – Softboiled: once during the player's turn, a flip; heads, 30 damage off the Active Pokémon.
  'bw5-82': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.me.active?.damage ? null : 'Your Active Pokémon has no damage counters'),
    use(ctx) {
      const active = ctx.me.active;
      if (!active || !ctx.flip()) return;
      const healed = Math.min(30, active.damage);
      active.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${pokemonName(ctx.state, active)}.`);
    },
  },
};
