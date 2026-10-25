// Legends Awakened (dp6) Trainer cards, by card id. Buck's Training and Cynthia's Feelings are Supporters (Buck's Training's
// 10 more in attacks.ts, while it's the Supporter in play); Bubble Coat is a Pokémon Tool (no Weakness in attacks.ts, discarded
// in betweenTurns); Snowpoint Temple (refreshHideout) and Stark Mountain are Stadiums; Claw Fossil and Root Fossil play as
// Basic Pokémon, as EX Legend Maker's Mysterious Fossil does. The Technical Machines stay attached; their attacks (from the
// printed cards) are in dp6.ts.
// From the text: Stark Mountain moves one basic Fire or Fighting Energy card; Energy Pickup's card goes to the Pokémon clicked.
import { isBasicEnergy, lookupCard, type Attack } from '../cards.js';
import { discardsLocked } from '../powers.js';
import { pokemonName } from '../status.js';
import { targetsOf, type TrainerEffect } from '../trainers.js';
import { DP2_TRAINERS } from './dp2-trainers.js';
import { tool } from './neo1-trainers.js';

/** A Technical Machine that stays attached to one of the player's Pokémon, with its attack. */
const machine = (name: string, technicalMachine: Attack): TrainerEffect => ({
  technicalMachine,
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me), prompt: `Choose one of your Pokémon to attach ${name} to` }],
  play(ctx) {
    const t = ctx.choices.target!;
    const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
    ctx.attachTo(p, Number.MAX_SAFE_INTEGER);
    ctx.log(`Attached ${name} to ${pokemonName(ctx.state, p)}.`);
  },
});

export const DP6_TRAINERS: Record<string, TrainerEffect> = {
  // Bubble Coat: a Pokémon Tool.
  'dp6-129': tool('Bubble Coat'),
  // Buck's Training (Supporter): 2 cards drawn; the Active Pokémon's attacks do 10 more this turn (attacks.ts).
  'dp6-130': { supporter: true, play: (ctx) => ctx.draw(ctx.me, 2) },
  // Cynthia's Feelings (Supporter): the hand shuffled into the deck, 4 cards drawn, 8 if one of the player's Pokémon was Knocked Out last turn.
  'dp6-131': {
    supporter: true,
    play(ctx) {
      const hand = ctx.me.hand.filter((c) => c.uid !== ctx.card.uid);
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.shuffleIntoDeck(ctx.me, hand);
      ctx.draw(ctx.me, ctx.me.knockedOutTurn === ctx.turn - 1 ? 8 : 4);
    },
  },
  // Energy Pickup: heads, a basic Energy card from the discard pile attached to one of the player's Pokémon.
  'dp6-132': {
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'There are no basic Energy cards in your discard pile'),
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Energy Pickup did nothing.');
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Pickup', count: 1 });
    },
  },
  // Poké Radar: any Pokémon among the top 5 cards into the hand, shown; the rest shuffled back.
  'dp6-133': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Poké Radar', looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: 5, master: true }),
  },
  // Snowpoint Temple: a Stadium (refreshHideout: 20 more HP for Pokémon that aren't Evolved Pokémon).
  'dp6-134': { stadium: true },
  // Stark Mountain: once a turn for each player, a basic Fire or Fighting Energy card moved from one of their Pokémon to another.
  'dp6-135': {
    stadium: true,
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Stark Mountain', kind: 'deltaSwitch', exclude: '', types: ['fire', 'fighting'], once: true };
    },
  },
  // Technical Machine TS-1 – Evoluter; TS-2 – Devoluter.
  'dp6-136': machine('Technical Machine TS-1', { name: 'Evoluter', cost: ['colorless'], damage: 0, damageText: null, text: 'Search your deck for a card that evolves from 1 of your Pokémon and put it onto that Pokémon. (This counts as evolving that Pokémon.) Shuffle your deck afterward.' }),
  'dp6-137': machine('Technical Machine TS-2', { name: 'Devoluter', cost: ['colorless'], damage: 0, damageText: null, text: "Choose 1 of your opponent's Evolved Pokémon (excluding Pokémon LV.X). Remove the highest Stage Evolution card from that Pokémon and put that card back into your opponent's hand." }),
  // Claw Fossil, Root Fossil: as Mysterious Treasures' Armor Fossil.
  'dp6-138': DP2_TRAINERS['dp2-116']!,
  'dp6-139': DP2_TRAINERS['dp2-116']!,
};
