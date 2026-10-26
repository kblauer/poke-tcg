// Diamond & Pearl (dp1) Trainer cards, by card id. Professor Rowan and Rival are Supporters; Speed Stadium is a Stadium; the
// rest are Items (the era's name for Trainer cards that aren't Supporters or Stadiums). Most reprint earlier sets' cards and
// play as those.
// From the text: Night Pokémon Center's Pokémon is chosen before the flips; Pokédex HANDY910is puts the other card on the
// bottom; Rival's opponent picks 3 of the 5 cards shown (all of them with 3 or fewer), and the deck is shuffled after.
import { lookupCard } from '../cards.js';
import { addLog, pokemonName } from '../status.js';
import { otherHandCards, rivalHand, RIVAL_PICKS, targetsOf, type TrainerEffect } from '../trainers.js';
import { pokemonAt } from '../powers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { EX2_TRAINERS } from './ex2-trainers.js';
import { EX4_TRAINERS } from './ex4-trainers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';

export const DP1_TRAINERS: Record<string, TrainerEffect> = {
  // Double Full Heal: as EX Sandstorm's. Energy Restore, Energy Search: as Expedition's. Energy Switch: as Aquapolis's.
  'dp1-105': EX2_TRAINERS['ex2-86']!,
  'dp1-106': ECARD1_TRAINERS['ecard1-141']!,
  'dp1-107': ECARD2_TRAINERS['ecard2-120']!,
  'dp1-117': ECARD1_TRAINERS['ecard1-153']!,
  // Night Pokémon Center: one of the player's Pokémon; 2 heads, all its damage counters off; 2 tails, all its Energy cards discarded.
  'dp1-108': {
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me), prompt: 'Choose one of your Pokémon' }],
    play(ctx) {
      const p = ctx.choices.target === undefined ? null : pokemonAt(ctx.me, ctx.choices.target);
      if (!p) return;
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (heads === 2 && p.damage) {
        p.damage = 0;
        ctx.log(`Removed all damage counters from ${pokemonName(ctx.state, p)}.`);
      } else if (heads === 0) {
        const gone = p.energy.map(({ provides: _, ...card }) => card);
        if (!gone.length) return;
        p.energy = [];
        ctx.me.discard.push(...gone);
        ctx.log(`Discarded all Energy cards attached to ${pokemonName(ctx.state, p)}.`);
      }
    },
  },
  // PlusPower: as Base Set's. Poké Ball: as Jungle's.
  'dp1-109': BASE1_TRAINERS['base1-84']!,
  'dp1-110': JUNGLE_TRAINERS['base2-64']!,
  // Pokédex HANDY910is: one of the top 2 cards into the hand, the other on the bottom of the deck.
  'dp1-111': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Pokédex HANDY910is', looked: ctx.me.deck.slice(0, 2).map((c) => c.uid), take: 1, shuffleRest: true, toBottom: true }),
  },
  // Professor Rowan (Supporter): one card kept, the rest of the hand shuffled into the deck, then 4 drawn.
  'dp1-112': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).length ? null : "You can't play Professor Rowan when it's the only card in your hand"),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Professor Rowan: choose the card to keep' }],
    play(ctx) {
      const keep = ctx.choices.handUids?.[0];
      const rest = ctx.me.hand.filter((c) => c.uid !== keep && c.uid !== ctx.card.uid);
      ctx.me.hand = ctx.me.hand.filter((c) => !rest.includes(c));
      ctx.shuffleIntoDeck(ctx.me, rest);
      ctx.log(`Shuffled ${rest.length} card${rest.length === 1 ? '' : 's'} into the deck.`);
      ctx.draw(ctx.me, 4);
    },
  },
  // Rival (Supporter): the top 5 cards shown; the opponent picks 3 of them for the player's hand, and the deck is shuffled.
  'dp1-113': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const looked = ctx.me.deck.slice(0, 5);
      ctx.log(`Rival shows ${looked.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
      if (looked.length <= RIVAL_PICKS) return rivalHand(ctx.state, ctx.me, looked.map((c) => c.uid), 'Rival');
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Rival', kind: 'rival', looked: looked.map((c) => c.uid), picked: [] };
    },
  },
  // Speed Stadium: once during each player's turn, a flip until tails, a card drawn for each heads.
  'dp1-114': {
    stadium: true,
    useStadium({ state, me, flip }) {
      let heads = 0;
      while (flip()) heads++;
      const drawn = me.deck.splice(0, heads);
      me.hand.push(...drawn);
      addLog(state, `Speed Stadium: drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, me.id);
    },
  },
  // Super Scoop Up: as Neo Genesis's. Warp Point: as EX Team Magma vs Team Aqua's. Potion, Switch: as EX Ruby & Sapphire's.
  'dp1-115': NEO1_TRAINERS['neo1-98']!,
  'dp1-116': EX4_TRAINERS['ex4-85']!,
  'dp1-118': EX1_TRAINERS['ex1-91']!,
  'dp1-119': EX1_TRAINERS['ex1-92']!,
};

