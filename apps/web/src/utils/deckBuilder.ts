// Deck builder: the search filters and editing a deck's card list. The rules themselves (60 cards, 4 of a
// name, a Basic Pokémon) are in @poke-tcg/shared, where the API checks them too.
import { DECK_SIZE, MAX_COPIES, copiesAllowed, copiesOfName, deckProblems, type DeckRuleCard } from '@poke-tcg/shared';
import { CARD_TYPES, matchesOwnership, matchesSearch, type CatalogCard, type Ownership } from './cardList';

/** Pokémon stages for the stage filter. */
export const POKEMON_STAGES = [
  { value: 'Baby', label: 'Baby' },
  { value: 'Basic', label: 'Basic' },
  { value: 'Stage1', label: 'Stage 1' },
  { value: 'Stage2', label: 'Stage 2' },
];

export interface DeckFilter {
  search: string;
  set: string | null;
  /** Showing only Pokémon, even with no other Pokémon filter set ("Any type" picked after a Trainer or Energy toggle). */
  pokemon: boolean;
  /** Pokémon filters: any of these set shows only Pokémon that match them all (and turns the other toggles off). */
  stage: string | null;
  type: string | null;
  minHp: number | null;
  maxHp: number | null;
  hasAbility: boolean;
  /** Trainer toggle: shows only Trainers (and clears the Pokémon filters and Energy toggles). */
  trainers: boolean;
  /** Energy toggles, by the type of Energy provided: any on shows only those Energy cards (and clears the other filters). */
  energies: string[];
  /** Only cards the engine fully implements. */
  implementedOnly: boolean;
  /** Unlocked cards, locked ones, or both. */
  ownership: Ownership;
}

export const EMPTY_DECK_FILTER: DeckFilter = {
  search: '',
  set: null,
  pokemon: false,
  stage: null,
  type: null,
  minHp: null,
  maxHp: null,
  hasAbility: false,
  trainers: false,
  energies: [],
  implementedOnly: false,
  ownership: 'all',
};

/** The filter with no Pokémon filters set, for when a Trainer toggle goes on. */
export const withoutPokemonFilters = (f: DeckFilter): DeckFilter => ({ ...f, pokemon: false, stage: null, type: null, minHp: null, maxHp: null, hasAbility: false });

/**
 * Cards matching the filters. The search (name or attack), set, "implemented only" and unlocked/locked apply to every card. With no Pokémon
 * filter, Trainer toggle or Energy toggle set, every card shows. Energy toggles show only Energy of those
 * types, the Trainer toggle only Trainers, and Pokémon filters only Pokémon (the controls keep just one of
 * the three groups set).
 */
export function filterForDeck(cards: CatalogCard[], f: DeckFilter, isLocked: (card: CatalogCard) => boolean = () => false): CatalogCard[] {
  const search = f.search.trim().toLowerCase();
  const pokemonFilters = f.pokemon || f.stage !== null || f.type !== null || f.minHp !== null || f.maxHp !== null || f.hasAbility;
  const trainerFilters = f.trainers;
  const energyFilters = f.energies.length > 0;
  return cards.filter((c) => {
    if (search && !matchesSearch(c, search)) return false;
    if (f.set && c.setName !== f.set) return false;
    if (f.implementedOnly && !c.implemented) return false;
    if (!matchesOwnership(c, f.ownership, isLocked)) return false;
    if (!pokemonFilters && !trainerFilters && !energyFilters) return true;
    if (energyFilters) return c.energyType !== null && f.energies.includes(c.energyType);
    if (trainerFilters) return c.kind === 'TRAINER';
    return (
      c.kind === 'POKEMON' &&
      (f.stage === null || c.stage === f.stage) &&
      (f.type === null || c.type === f.type) &&
      (f.minHp === null || (c.hp !== null && c.hp >= f.minHp)) &&
      (f.maxHp === null || (c.hp !== null && c.hp <= f.maxHp)) &&
      (!f.hasAbility || c.hasAbility)
    );
  });
}

export type DeckSort = 'set' | 'dex' | 'type';

export const DECK_SORTS: { value: DeckSort; label: string }[] = [
  { value: 'set', label: 'Set number' },
  { value: 'dex', label: 'Pokédex number' },
  { value: 'type', label: 'Type' },
];

/** What a card sorts by; null sorts last (Trainers and Energy have no Pokédex number). */
const sortValue = (c: CatalogCard, sort: DeckSort): number | null =>
  sort === 'dex' ? c.dexNumber : sort === 'type' ? (c.type ? CARD_TYPES.indexOf(c.type) : null) : c.order;

/**
 * Sorted copy. "Set number" is release order, then the number within the set; ties in the others keep
 * that order too.
 */
export function sortForDeck(cards: CatalogCard[], sort: DeckSort): CatalogCard[] {
  return [...cards].sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === null || vb === null) return va === vb ? a.order - b.order : va === null ? 1 : -1;
    return va - vb || a.order - b.order;
  });
}

/** A card in a deck being built. */
export interface DeckEntry {
  cardId: string;
  quantity: number;
}

const ruleCard = (c: CatalogCard): DeckRuleCard => ({ name: c.name, kind: c.kind, stage: c.stage, basicEnergy: c.basicEnergy });

/** The deck's entries with their catalog cards (entries missing from the catalog are left out). */
export const withCards = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  entries.flatMap((e) => {
    const card = byId.get(e.cardId);
    return card ? [{ ...e, card }] : [];
  });

export const deckSize = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.quantity, 0);

/** Why the deck can't be played yet; empty when it's ready. */
export const problemsOf = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  deckProblems(withCards(entries, byId).map((e) => ({ card: ruleCard(e.card), quantity: e.quantity })));

/** Why another copy of `card` can't go in the deck, or null if it can. */
export function cantAdd(entries: DeckEntry[], card: CatalogCard, byId: Map<string, CatalogCard>): string | null {
  if (deckSize(entries) >= DECK_SIZE) return `The deck already has ${DECK_SIZE} cards`;
  const rules = withCards(entries, byId).map((e) => ({ card: ruleCard(e.card), quantity: e.quantity }));
  if (!card.basicEnergy && copiesOfName(rules, card.name) >= MAX_COPIES) return `Already ${MAX_COPIES} cards named ${card.name}`;
  const own = entries.find((e) => e.cardId === card.id)?.quantity ?? 0;
  return own >= copiesAllowed(ruleCard(card)) ? `Already ${own} of this card` : null;
}

/** The deck with one more (`by` = 1) or one fewer (`by` = −1) copy of the card. */
export function changeCount(entries: DeckEntry[], cardId: string, by: 1 | -1): DeckEntry[] {
  const existing = entries.find((e) => e.cardId === cardId);
  if (!existing) return by > 0 ? [...entries, { cardId, quantity: 1 }] : entries;
  const quantity = existing.quantity + by;
  return quantity > 0 ? entries.map((e) => (e === existing ? { ...e, quantity } : e)) : entries.filter((e) => e !== existing);
}

/** Sections of the deck list, in this order. */
export const DECK_SECTIONS = [
  { kind: 'POKEMON', label: 'Pokémon' },
  { kind: 'TRAINER', label: 'Trainers' },
  { kind: 'ENERGY', label: 'Energy' },
] as const;
