// Legendary Treasures (bw11) Trainer cards, by card id (its Radiant Collection's too): the ones that aren't word-for-word
// reprints (bw-reprints.ts). Cedric Juniper and Elesa are Supporters.
// From the text: Cedric Juniper is Blaine's Quiz #1's guess (quiz): a Pokémon card from the hand with its height known, named;
// the opponent picks its height among 4; right, they draw 3 cards, wrong, the player does; the card stays in the hand. Only
// Pokémon whose height the catalog has can be chosen (as printed: "You can't choose a Pokémon that doesn't have the height
// printed"); the API's lengths.ts has them for Pokédex 1–649. The CPU always guesses right (the user's, 2026-10-26). Elesa takes up to 3 Pokémon Tool cards, shown.
import { isPokemonCard, lookupCard, type PokemonCardDef } from '../cards.js';
import { shuffle } from '../rng.js';
import { otherHandCards, type TrainerEffect, type TrainerSituation } from '../trainers.js';

/** Pokémon cards in the hand with a known height (Cedric Juniper). */
const heightKnown = (s: TrainerSituation) =>
  otherHandCards(s).filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isPokemonCard(d) && !!d.length;
  });

/** A printed height (`6' 3"`) in inches, and back. */
const toInches = (length: string) => {
  const [feet = 0, inches = 0] = length.match(/\d+/g)!.map(Number);
  return feet * 12 + inches;
};
const fromInches = (n: number) => `${Math.floor(n / 12)}' ${n % 12}"`;

export const BW11_TRAINERS: Record<string, TrainerEffect> = {
  // Cedric Juniper (Supporter): the opponent guesses a Pokémon card's height; right, they draw 3, wrong, the player does.
  'bw11-110': {
    supporter: true,
    blocked: (s) => (heightKnown(s).length ? null : 'You have no Pokémon card with a known height in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: heightKnown(s), prompt: 'Choose a Pokémon card from your hand to put face down' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!;
      const d = lookupCard(ctx.state.cards, card.defId) as PokemonCardDef;
      const inches = toInches(d.length!);
      // The right height and 3 others a few inches to a foot away, in order.
      let others: number[];
      [others, ctx.state.rngState] = shuffle([-12, -6, -3, 3, 6, 12].map((n) => inches + n).filter((n) => n > 0), ctx.state.rngState);
      const heights = [inches, ...others.slice(0, 3)].sort((a, b) => a - b);
      ctx.log(`Put ${d.name} face down.`);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Cedric Juniper', kind: 'quiz', card, lengths: heights.map(fromInches), answer: heights.indexOf(inches), draw: 3 };
    },
  },
  // Elesa (Supporter): up to 3 Pokémon Tool cards from the deck, shown.
  'bw11-RC20': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Elesa', filter: 'tool', reveal: true, optional: true, count: 3 }),
  },
};
