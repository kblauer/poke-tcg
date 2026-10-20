// Deck building rules (Pokémon TCG rulebook), shared by the deck builder and the API so both judge a deck the same way.
import { z } from 'zod';

export const DECK_SIZE = 60;
/** Cards with exactly the same name a deck may hold, basic Energy excepted. */
export const MAX_COPIES = 4;
export const DECK_NAME_LENGTH = 40;

/** What the rules need to know about a card. */
export interface DeckRuleCard {
  name: string;
  kind: 'POKEMON' | 'TRAINER' | 'ENERGY';
  /** "Baby" | "Basic" | "Stage1" | "Stage2" for Pokémon, null otherwise. */
  stage: string | null;
  basicEnergy: boolean;
}

/** Baby Pokémon are Basic Pokémon too. Trainers played as Pokémon (Clefairy Doll, Mysterious Fossil) aren't. */
export const isBasicPokemonCard = (card: Pick<DeckRuleCard, 'kind' | 'stage'>) => card.kind === 'POKEMON' && (card.stage === 'Basic' || card.stage === 'Baby');

/**
 * Printed on Shining Pokémon and Miracle Energy: "You can't have more than 1 [this card] in your deck" (by name, as the
 * 4-copy limit counts).
 */
export const onlyOnePerDeck = (card: Pick<DeckRuleCard, 'name' | 'kind'>) => (card.kind === 'POKEMON' && card.name.startsWith('Shining ')) || card.name === 'Miracle Energy';

/** The most cards with this card's name a deck may hold. */
export const maxCopiesOf = (card: Pick<DeckRuleCard, 'name' | 'kind'>) => (onlyOnePerDeck(card) ? 1 : MAX_COPIES);

/** Copies of one card a deck may hold before counting others with the same name. */
export const copiesAllowed = (card: Pick<DeckRuleCard, 'basicEnergy' | 'name' | 'kind'>) => (card.basicEnergy ? DECK_SIZE : maxCopiesOf(card));

/** Cards in a deck with exactly this name (basic Energy has no limit, so it isn't counted). */
export const copiesOfName = (entries: { card: DeckRuleCard; quantity: number }[], name: string) =>
  entries.filter((e) => e.card.name === name && !e.card.basicEnergy).reduce((n, e) => n + e.quantity, 0);

/** Printed on every Unown: "You may have up to 4 Basic Pokémon cards in your deck with Unown in their names." */
export const MAX_UNOWN = 4;

/** A Basic Pokémon card with Unown in its name (Unown [A], Unown [J]…), which MAX_UNOWN limits. */
export const isUnownCard = (card: Pick<DeckRuleCard, 'name' | 'kind' | 'stage'>) => isBasicPokemonCard(card) && card.name.includes('Unown');

/** Basic Pokémon cards with Unown in their names in a deck. */
export const unownCount = (entries: { card: DeckRuleCard; quantity: number }[]) => entries.filter((e) => isUnownCard(e.card)).reduce((n, e) => n + e.quantity, 0);

/** Why the deck can't be played, in plain words; empty when it follows every rule. */
export function deckProblems(entries: { card: DeckRuleCard; quantity: number }[]): string[] {
  const problems: string[] = [];
  const total = entries.reduce((n, e) => n + e.quantity, 0);
  if (total !== DECK_SIZE) problems.push(`The deck has ${total} card${total === 1 ? '' : 's'}; it needs exactly ${DECK_SIZE}.`);
  const names = new Map(entries.filter((e) => !e.card.basicEnergy).map((e) => [e.card.name, e.card] as const));
  for (const [name, card] of names) {
    const copies = copiesOfName(entries, name);
    if (onlyOnePerDeck(card) && copies > 1) problems.push(`${copies} cards named ${name}: at most 1.`);
    else if (copies > MAX_COPIES) problems.push(`${copies} cards named ${name}: at most ${MAX_COPIES} (basic Energy excepted).`);
  }
  const unown = unownCount(entries);
  if (unown > MAX_UNOWN) problems.push(`${unown} Unown: at most ${MAX_UNOWN} Basic Pokémon with Unown in their names.`);
  if (!entries.some((e) => isBasicPokemonCard(e.card))) problems.push('The deck needs at least one Basic Pokémon.');
  return problems;
}

/** A saved deck's card list, as the client sends it. Saving is allowed while the deck is unfinished. */
export const deckSaveInput = z.object({
  /** Missing = a new deck. */
  deckId: z.uuid().optional(),
  name: z.string().trim().min(1).max(DECK_NAME_LENGTH),
  cards: z
    .array(z.object({ cardId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(DECK_SIZE) }))
    .max(DECK_SIZE),
});

export const deckIdInput = z.object({ deckId: z.uuid() });

/** A new name for one of the account's decks. */
export const deckRenameInput = deckIdInput.extend({ name: z.string().trim().min(1).max(DECK_NAME_LENGTH) });

/** The account's decks in their new order (every deck, each once). */
export const deckOrderInput = z.object({ deckIds: z.array(z.uuid()).max(500) });
