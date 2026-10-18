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

/** Cards of each kind in the deck (Pokémon, Trainers, Energy). */
export const deckRatio = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  Object.fromEntries(DECK_SECTIONS.map(({ kind }) => [kind, withCards(entries, byId).reduce((n, e) => n + (e.card.kind === kind ? e.quantity : 0), 0)])) as Record<(typeof DECK_SECTIONS)[number]['kind'], number>;

const STAGE_RANK: Record<string, number> = { Baby: 0, Basic: 1, Stage1: 2, Stage2: 3 };

/**
 * The deck's headline Pokémon, to show on its button: the highest stages first, preferring an evolved
 * Pokémon whose whole line is in the deck with 2 or more copies of each earlier stage, then the most copies.
 * Each comes from a different evolution line while there are enough lines, and names aren't repeated.
 */
export function featuredPokemon(entries: DeckEntry[], byId: Map<string, CatalogCard>, count = 3): CatalogCard[] {
  const pokemon = withCards(entries, byId).filter((e) => e.card.kind === 'POKEMON');
  const copies = new Map<string, number>();
  const evolvesFrom = new Map<string, string>();
  for (const { card, quantity } of pokemon) {
    copies.set(card.name, (copies.get(card.name) ?? 0) + quantity);
    if (card.evolvesFrom) evolvesFrom.set(card.name, card.evolvesFrom);
  }
  /** The names it evolves from, nearest first (stopping at a loop, should the data have one). */
  const earlier = (name: string) => {
    const names: string[] = [];
    for (let n = evolvesFrom.get(name); n && !names.includes(n) && n !== name; n = evolvesFrom.get(n)) names.push(n);
    return names;
  };
  const supported = (card: CatalogCard) => earlier(card.name).every((n) => (copies.get(n) ?? 0) >= 2) && (!card.evolvesFrom || copies.has(card.evolvesFrom));
  const ranked = pokemon
    .map(({ card }) => ({ card, supported: supported(card), stage: STAGE_RANK[card.stage ?? ''] ?? 1, copies: copies.get(card.name)! }))
    .sort((a, b) => Number(b.supported) - Number(a.supported) || b.stage - a.stage || b.copies - a.copies || a.card.order - b.card.order);
  const sameLine = (a: CatalogCard, b: CatalogCard) => earlier(a.name).includes(b.name) || earlier(b.name).includes(a.name);
  const picked: CatalogCard[] = [];
  for (const distinctLines of [true, false]) {
    for (const { card } of ranked) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.name === card.name || (distinctLines && sameLine(p, card)))) continue;
      picked.push(card);
    }
  }
  return picked;
}
