// Filtering and sorting for the card browser. The whole catalog is loaded once, so this all runs in the browser.
import type { AppRouter } from '@poke-tcg/api/router';
import type { inferRouterOutputs } from '@trpc/server';

export type CatalogCard = inferRouterOutputs<AppRouter>['cards']['list'][number];

export const CARD_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless'];

/** Stage filter options. Trainers and Energy have no stage, so they get their own entries. */
export const STAGES = [
  { value: 'Baby', label: 'Baby' },
  { value: 'Basic', label: 'Basic' },
  { value: 'Stage1', label: 'Stage 1' },
  { value: 'Stage2', label: 'Stage 2' },
  { value: 'Trainer', label: 'Trainer' },
  { value: 'Energy', label: 'Energy' },
];

/** The card's entry in STAGES. */
export const stageOf = (card: CatalogCard) => (card.kind === 'POKEMON' ? card.stage : card.kind === 'TRAINER' ? 'Trainer' : 'Energy');

export const stageLabel = (card: CatalogCard) => STAGES.find((s) => s.value === stageOf(card))?.label ?? null;

/** Set names in release order, for the set filter. */
export const setNames = (cards: CatalogCard[]) => [...new Set([...cards].sort((a, b) => a.order - b.order).map((c) => c.setName))];

/** Whether the search text is in the card's name or one of its attacks' names (already lower-cased). */
export const matchesSearch = (card: Pick<CatalogCard, 'name' | 'attacks'>, search: string) =>
  card.name.toLowerCase().includes(search) || (card.attacks ?? []).some((a) => a?.toLowerCase().includes(search));

/** Cards to show by whether the account has unlocked them. */
export type Ownership = 'all' | 'unlocked' | 'locked';

export const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'all', label: 'Locked and unlocked' },
  { value: 'unlocked', label: 'Unlocked only' },
  { value: 'locked', label: 'Locked only' },
];

/** Whether the card passes the unlocked/locked filter. */
export const matchesOwnership = (card: CatalogCard, ownership: Ownership, isLocked: (card: CatalogCard) => boolean) =>
  ownership === 'all' || (ownership === 'locked') === isLocked(card);

export interface CardFilter {
  search: string;
  set: string | null;
  type: string | null;
  stage: string | null;
  /** Range for the card's highest attack damage. Setting either bound hides cards without attacks. */
  minAttack: number | null;
  maxAttack: number | null;
  ownership: Ownership;
}

export const EMPTY_FILTER: CardFilter = { search: '', set: null, type: null, stage: null, minAttack: null, maxAttack: null, ownership: 'all' };

/** Cards matching the filter; `isLocked` says which the account hasn't unlocked, for the ownership filter. */
export function filterCards(cards: CatalogCard[], filter: CardFilter, isLocked: (card: CatalogCard) => boolean = () => false): CatalogCard[] {
  const search = filter.search.trim().toLowerCase();
  const { minAttack, maxAttack } = filter;
  return cards.filter((c) => {
    if (search && !matchesSearch(c, search)) return false;
    if (!matchesOwnership(c, filter.ownership, isLocked)) return false;
    if (filter.set && c.setName !== filter.set) return false;
    if (filter.type && c.type !== filter.type) return false;
    if (filter.stage && stageOf(c) !== filter.stage) return false;
    if (minAttack !== null || maxAttack !== null) {
      if (c.maxDamage === null) return false;
      if (minAttack !== null && c.maxDamage < minAttack) return false;
      if (maxAttack !== null && c.maxDamage > maxAttack) return false;
    }
    return true;
  });
}

export type SortKey = 'set' | 'name' | 'type' | 'stage' | 'hp' | 'attack';

export interface CardSort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'set', label: 'Set' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'stage', label: 'Stage' },
  { value: 'hp', label: 'HP' },
  { value: 'attack', label: 'Max attack' },
];

/** The value a card is sorted by; null always sorts last. */
function sortValue(card: CatalogCard, key: SortKey): string | number | null {
  switch (key) {
    case 'set':
      return card.order;
    case 'name':
      return card.name;
    case 'type':
      return card.type ? CARD_TYPES.indexOf(card.type) : null;
    case 'stage':
      return STAGES.findIndex((s) => s.value === stageOf(card));
    case 'hp':
      return card.hp;
    case 'attack':
      return card.maxDamage;
  }
}

/** Sorted copy. Ties keep set order. */
export function sortCards(cards: CatalogCard[], { key, dir }: CardSort): CatalogCard[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return va === vb ? a.order - b.order : va === null ? 1 : -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return sign * cmp || a.order - b.order;
  });
}
