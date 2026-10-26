// Plasma Freeze (bw9) Trainer cards, by card id. Ghetsis and Shadow Triad are Supporters; Frozen City is a Stadium; Float
// Stone, Team Plasma Badge, Life Dew and Rock Guard are Pokémon Tools (their rules where they apply: Float Stone in
// retreatCost, Team Plasma Badge in isPlasmaPokemon, Life Dew in resolveKnockouts, Rock Guard in attacks.ts); Life Dew and
// Rock Guard are ACE SPEC cards (the shared deck rules). Superior Energy Retrieval plays as Neo Genesis's Super Energy
// Retrieval, whose rules are the same (the cards discarded can't be the Energy taken).
// From the text: Frozen City puts its 2 damage counters on any Pokémon but a Team Plasma one (Team Plasma Badge counts) that
// an Energy card is attached to from the hand, by any effect too (energyFromHand); Ghetsis shuffles every Item card in the
// opponent's hand (agreed: any Trainer but a Supporter or a Stadium, isItemCard) into their deck, shown, and draws as many;
// Rock Guard works on the Active Pokémon whenever the opponent's attack damages it, Knocked Out or not.
import { addLog, isPlasmaPokemon, pokemonName } from '../status.js';
import { def, isItemCard, type TrainerEffect } from '../trainers.js';
import { NEO1_TRAINERS, tool } from './neo1-trainers.js';

export const BW9_TRAINERS: Record<string, TrainerEffect> = {
  // Float Stone: no Retreat Cost (retreatCost).
  'bw9-99': tool('Float Stone'),
  // Frozen City: 2 damage counters on any Pokémon but a Team Plasma one an Energy card is attached to from the hand.
  'bw9-100': {
    stadium: true,
    onEnergyFromHand(state, owner, pokemon) {
      if (isPlasmaPokemon(state.cards, pokemon)) return;
      pokemon.damage += 20;
      addLog(state, `Frozen City put 2 damage counters on ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Ghetsis (Supporter): the opponent's hand shown, its Item cards shuffled into their deck; a card drawn for each.
  'bw9-101': {
    supporter: true,
    play(ctx) {
      const items = ctx.opp.hand.filter((c) => isItemCard(ctx.state.cards, c));
      ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => def(ctx.state, c).name).join(', ') || 'no cards'}.`);
      if (items.length) {
        ctx.opp.hand = ctx.opp.hand.filter((c) => !items.includes(c));
        ctx.shuffleIntoDeck(ctx.opp, items);
        ctx.log(`Shuffled ${items.length} Item card${items.length === 1 ? '' : 's'} into the deck.`, ctx.opp.id);
      }
      ctx.draw(ctx.me, items.length);
    },
  },
  // Shadow Triad (Supporter): a Team Plasma card from the discard pile into the hand.
  'bw9-102': {
    supporter: true,
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => !!def(s, c).teamPlasma) ? null : 'No Team Plasma cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Shadow Triad', count: 1, filter: 'teamPlasma', excludeUid: ctx.card.uid }),
  },
  // Superior Energy Retrieval: as Neo Genesis's Super Energy Retrieval.
  'bw9-103': NEO1_TRAINERS['neo1-89']!,
  // Team Plasma Badge: its Pokémon is a Team Plasma Pokémon (isPlasmaPokemon).
  'bw9-104': tool('Team Plasma Badge'),
  // Team Plasma Ball: a Team Plasma Pokémon from the deck, shown.
  'bw9-105': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Team Plasma Ball', filter: 'plasmaPokemon', reveal: true, optional: true }),
  },
  // Life Dew (ACE SPEC): 1 Prize card fewer for its Pokémon (resolveKnockouts). Rock Guard (ACE SPEC): 6 damage counters on
  // the opponent's Pokémon whose attack damages its Active Pokémon (attacks.ts).
  'bw9-107': tool('Life Dew'),
  'bw9-108': tool('Rock Guard'),
};

