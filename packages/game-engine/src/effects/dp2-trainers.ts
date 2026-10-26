// Mysterious Treasures (dp2) Trainer cards and Special Energy, by card id. Bebe's Search, Fossil Excavator and Team Galactic's
// Wager are Supporters; Lake Boundary is a Stadium (attacks.ts: every Weakness ×2); Armor Fossil and Skull Fossil play as
// Basic Pokémon, as EX Legend Maker's Mysterious Fossil does.
// From the text: Bebe's Search's card goes on top before the search shuffles the deck; Fossil Excavator asks which pile first;
// Quick Ball takes the first Pokémon from the top; Team Galactic's Wager plays Rock-Paper-Scissors with each hand shuffled away
// first (rps: the player first, a tie played again; the CPU's hand from the game's random state); Time-Space Distortion takes
// as many Pokémon as heads, one at a time.
import { isPokemonCard, lookupCard } from '../cards.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog } from '../status.js';
import { otherHandCards, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { EX1_ENERGY } from './ex1-trainers.js';
import { EX12_TRAINERS } from './ex12-trainers.js';
import { EX6_ENERGY } from './ex6-trainers.js';

export const DP2_TRAINERS: Record<string, TrainerEffect> = {
  // Bebe's Search (Supporter): a card from the hand on top of the deck, then a Pokémon from the deck, shown.
  'dp2-109': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).length ? null : "You can't play Bebe's Search when it's the only card in your hand"),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: "Bebe's Search: choose a card to put on top of your deck" }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids?.[0]);
      if (card) {
        ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
        ctx.me.deck.unshift(card);
        ctx.log('Put a card from the hand on top of the deck.');
      }
      ctx.pend({ kind: 'pickFromDeck', source: "Bebe's Search", filter: 'pokemon', reveal: true, optional: true });
    },
  },
  // Dusk Ball: a Pokémon from the bottom 7 cards, shown; the deck shuffled.
  'dp2-110': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'bottomPick', source: 'Dusk Ball', looked: ctx.me.deck.slice(-7).map((c) => c.uid), take: 1, pokemon: true }),
  },
  // Fossil Excavator (Supporter): from the deck or the discard pile, a Trainer card with Fossil in its name or an Evolution card that evolves from a Fossil.
  'dp2-111': {
    supporter: true,
    choices: () => [{ kind: 'pick', field: 'pick', options: [0, 1], labels: ['Search your deck', 'Search your discard pile'], prompt: 'Fossil Excavator: where do you search?' }],
    play(ctx) {
      if (ctx.choices.pick === 1) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        return ctx.pend({ kind: 'discardToHand', source: 'Fossil Excavator', count: 1, filter: 'fossil', reveal: true });
      }
      ctx.pend({ kind: 'pickFromDeck', source: 'Fossil Excavator', filter: 'fossil', reveal: true, optional: true });
    },
  },
  // Lake Boundary: a Stadium (attacks.ts: every Weakness ×2).
  'dp2-112': { stadium: true },
  // Night Maintenance: up to 3 Pokémon and basic Energy cards from the discard pile shuffled into the deck, shown.
  'dp2-113': {
    blocked: (s) => (s.me.discard.length ? null : 'Your discard pile is empty'),
    play(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'discardToDeck', source: 'Night Maintenance', count: 3, of: 3, filter: 'pokemonOrBasicEnergy' });
    },
  },
  // Quick Ball: cards revealed from the top until a Pokémon, which goes into the hand; the rest shuffled back.
  'dp2-114': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const at = ctx.me.deck.findIndex((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
      if (at < 0) {
        ctx.log(`Revealed the whole deck: no Pokémon.`);
      } else {
        const [found] = ctx.me.deck.splice(at, 1);
        ctx.me.hand.push(found!);
        ctx.log(`Revealed ${at + 1} card${at === 0 ? '' : 's'}: ${lookupCard(ctx.state.cards, found!.defId).name} goes into the hand.`);
      }
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    },
  },
  // Team Galactic's Wager (Supporter): both hands shuffled into the decks, then Rock-Paper-Scissors (rps).
  'dp2-115': {
    supporter: true,
    play(ctx) {
      for (const p of [ctx.me, ctx.opp]) {
        const hand = p.hand.filter((c) => c.uid !== ctx.card.uid);
        p.hand = p.hand.filter((c) => c.uid === ctx.card.uid);
        ctx.shuffleIntoDeck(p, hand);
        addLog(ctx.state, 'Shuffled the hand into the deck.', p.id);
      }
      ctx.pend({ kind: 'rps', source: "Team Galactic's Wager" });
    },
  },
  // Armor Fossil, Skull Fossil: as EX Legend Maker's Mysterious Fossil.
  'dp2-116': EX12_TRAINERS['ex12-79']!,
  'dp2-117': EX12_TRAINERS['ex12-79']!,
  // Time-Space Distortion: 3 coins; a Pokémon from the discard pile into the hand for each heads, shown.
  'dp2-124': {
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(lookupCard(s.cards, c.defId))) ? null : 'There are no Pokémon in your discard pile'),
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!heads) return ctx.log('Time-Space Distortion found nothing.');
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'discardToHand', source: 'Time-Space Distortion', count: heads, reveal: true });
    },
  },
};

export const DP2_ENERGY: Record<string, EnergyEffect> = {
  // Multi Energy: as EX FireRed & LeafGreen's. Darkness Energy, Metal Energy: as EX Ruby & Sapphire's.
  'dp2-118': EX6_ENERGY['ex6-103']!,
  'dp2-119': EX1_ENERGY['ex1-93']!,
  'dp2-120': EX1_ENERGY['ex1-94']!,
};
