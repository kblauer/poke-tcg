// Emerging Powers (bw2) Trainer cards, by card id. Bianca and Cheren are Supporters; the rest are Items. Crushing Hammer,
// Pokémon Catcher and Recycle play as the older cards worded the same (Energy Removal 2, Expedition's Pokémon Reversal, Fossil's
// Recycle: what depends on the flip is chosen before it). From the text: Bianca draws nothing with 6 or more cards in the hand;
// Great Ball takes any Pokémon card among the top 7 (or none); Max Potion heals one of the player's damaged Pokémon, then
// discards every Energy card attached to it, as Expedition's Pokémon Nurse does.
import { pokemonAt } from '../powers.js';
import { pokemonName } from '../status.js';
import { own, targetsOf, type TrainerEffect } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { FOSSIL_TRAINERS } from './fossil-trainers.js';

export const BW2_TRAINERS: Record<string, TrainerEffect> = {
  // Bianca (Supporter): cards drawn until there are 6 in the hand.
  'bw2-90': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.draw(ctx.me, Math.max(0, 6 - ctx.me.hand.length)),
  },
  // Cheren (Supporter): 3 cards drawn.
  'bw2-91': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.draw(ctx.me, 3),
  },
  // Crushing Hammer: as Expedition's Energy Removal 2.
  'bw2-92': ECARD1_TRAINERS['ecard1-140']!,
  // Great Ball: a Basic Pokémon, not a Pokémon-ex or Pokémon-EX (the user's, 2026-10-26), among the top 7 cards of the deck into
  // the hand, or none; the rest shuffled back.
  'bw2-93': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Great Ball', looked: ctx.me.deck.slice(0, 7).map((c) => c.uid), take: 1, master: true, basicNotEx: true }),
  },
  // Max Potion: all damage off one of the player's Pokémon, then every Energy card attached to it discarded.
  'bw2-94': {
    blocked: (s) => (targetsOf(s.me).some((t) => own(s, t)!.damage > 0) ? null : 'None of your Pokémon have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => own(s, t)!.damage > 0), prompt: 'Choose a Pokémon to heal' }],
    play(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.target!)!;
      p.damage = 0;
      const energy = p.energy.map(({ provides: _, converted: _c, windless: _w, ...c }) => c);
      p.energy = [];
      ctx.me.discard.push(...energy);
      ctx.log(`Healed all damage from ${pokemonName(ctx.state, p)}${energy.length ? ` and discarded ${energy.length} Energy card${energy.length === 1 ? '' : 's'}` : ''}.`);
    },
  },
  // Pokémon Catcher: as Expedition's Pokémon Reversal. Recycle: as Fossil's.
  'bw2-95': ECARD1_TRAINERS['ecard1-146']!,
  'bw2-96': FOSSIL_TRAINERS['base3-61']!,
};
