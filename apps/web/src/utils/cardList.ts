// Catalog cards in the browser (the whole catalog is loaded once): the `CatalogCard` type, types and stages, and
// the search and unlocked/locked filters the deck builder uses.
import type { AppRouter } from '@poke-tcg/api/router';
import type { inferRouterOutputs } from '@trpc/server';

export type CatalogCard = inferRouterOutputs<AppRouter>['cards']['list'][number];

/** A card's name, with a holo Energy's style ("Fire Energy · Rainbow"). */
export const cardTitle = (card: Pick<CatalogCard, 'name' | 'holoEnergy'>) => (card.holoEnergy ? `${card.name} · ${card.holoEnergy.label}` : card.name);

export const CARD_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless'];

/** Stage labels. Trainers and Energy have no stage, so they get their own entries. */
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

/** Searching for this (or as much of it as 3 letters or more) finds every Stadium Trainer. */
const STADIUM = 'stadium';

/** Whether the search text (already lower-cased) is in the card's name or one of its attacks' names, or names it a Stadium. */
export const matchesSearch = (card: Pick<CatalogCard, 'name' | 'attacks' | 'stadium'>, search: string) =>
  card.name.toLowerCase().includes(search) ||
  (card.attacks ?? []).some((a) => a?.toLowerCase().includes(search)) ||
  (card.stadium && search.length >= 3 && STADIUM.startsWith(search));

