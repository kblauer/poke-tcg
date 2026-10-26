// Call of Legends (col1) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies
// never do. Many reprint earlier cards' powers and play as those. Self-Generation (as Pachirisu is benched) is asked then
// (mayUse).
// From the text: Roast Reveal's Fire Energy card is basic or Special; Trick Reveal shows each player the other's hand;
// Second Sight's deck is picked as it's used; Ultra-Thick Skin works with any Energy attached; Extreme Speed counts the Energy
// of the type the Pokémon provides.
import { counts, energyPool } from '../engine.js';
import type { PowerEffect } from '../powers.js';
import { lookupCard } from '../cards.js';
import { POKE_BODY } from './common.js';
import { onBench } from './dp5-powers.js';
import { energyCardOf } from './ex2.js';
import { HGSS1_POWERS } from './hgss1-powers.js';
import { HGSS2_POWERS } from './hgss2-powers.js';
import { HGSS3_POWERS } from './hgss3-powers.js';

type Type = 'fire' | 'water' | 'lightning';
/** Extreme Speed: 1 less to retreat for each Energy of its type on it. */
const extremeSpeed = (type: Type): PowerEffect => ({ ...POKE_BODY, retreatChange: (p, cards) => -energyPool(p, cards).filter((e) => counts(e, type)).length });

export const COL1_POWERS: Record<string, PowerEffect> = {
  // Jirachi – Stardust Song: as Unleashed's. Smeargle – Portrait: as Undaunted's.
  'col1-11': HGSS2_POWERS['hgss2-1']!,
  'col1-21': HGSS3_POWERS['hgss3-8']!,
  // Ninetales – Roast Reveal: a Fire Energy card discarded from the hand, then 3 cards drawn.
  'col1-17': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => energyCardOf(s.cards, c, 'fire')) ? null : 'You have no Fire Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => energyCardOf(s.cards, c, 'fire')), prompt: 'Roast Reveal: choose a Fire Energy card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      const drawn = ctx.me.deck.splice(0, 3);
      ctx.me.hand.push(...drawn);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} and drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },
  // Pachirisu – Self-Generation: as it's benched from the hand, up to 2 Lightning Energy cards from the hand attached to it.
  'col1-18': onBench('selfGeneration', 'Self-Generation'),
  // Cleffa, Tyrogue, Magby, Mime Jr. – Sweet Sleeping Face: as HeartGold & SoulSilver's.
  'col1-24': HGSS1_POWERS['hgss1-17']!,
  'col1-36': HGSS1_POWERS['hgss1-17']!,
  'col1-46': HGSS1_POWERS['hgss1-17']!,
  'col1-47': HGSS1_POWERS['hgss1-17']!,
  // Mr. Mime – Trick Reveal: both players' hands shown.
  'col1-29': {
    oncePerTurn: true,
    use(ctx) {
      ctx.log(`Trick Reveal shows the hand: ${ctx.me.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
      ctx.pend({ kind: 'lookOppHand', source: 'Trick Reveal' });
    },
  },
  // Slowking – Second Sight: the top 3 cards of either player's deck put back in any order.
  'col1-32': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck || s.counts.oppDeck ? null : 'Both decks are empty'),
    choices: (s) => [{ kind: 'peek', field: 'peek', options: [...(s.counts.deck ? ['deck' as const] : []), ...(s.counts.oppDeck ? ['oppDeck' as const] : [])], prompt: 'Second Sight: look at the top 3 cards of which deck?' }],
    use(ctx) {
      const owner = ctx.choices.peek === 'oppDeck' ? ctx.opp : ctx.me;
      if (owner.deck.length) ctx.pend({ kind: 'arrangeTop', source: 'Second Sight', count: Math.min(3, owner.deck.length), deckOwner: owner.id });
    },
  },
  // Phanpy – Ultra-Thick Skin: with any Energy attached, 10 less damage from attacks.
  'col1-66': { ...POKE_BODY, damageReductionWith: { amount: 10 } },
  // Suicune, Entei, Raikou – Extreme Speed.
  'col1-SL11': extremeSpeed('water'),
  'col1-SL3': extremeSpeed('fire'),
  'col1-SL9': extremeSpeed('lightning'),
};
