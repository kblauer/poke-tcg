// Catalog cards in the browser (the whole catalog is loaded once): the `CatalogCard` type, types and stages, and
// the search and unlocked/locked filters the deck builder uses.
import type { AppRouter } from '@poke-tcg/api/router';
import { GENERATIONS } from '@poke-tcg/campaign';
import type { inferRouterOutputs } from '@trpc/server';

export type CatalogCard = inferRouterOutputs<AppRouter>['cards']['list'][number];

/** A card's name, with a holo Energy's style ("Fire Energy · Rainbow") or a reverse holo's ("Aron · Reverse Holo"). */
export const cardTitle = (card: Pick<CatalogCard, 'name' | 'holoEnergy'> & { reverseHolo?: boolean }) =>
  card.holoEnergy ? `${card.name} · ${card.holoEnergy.label}` : card.reverseHolo ? `${card.name} · Reverse Holo` : card.name;

/**
 * A version of another card, found only by gaining it: a holo Energy (of a basic Energy) or a reverse holo (of an EX card).
 * The Collection hides one until it's gained, and the numbers of cards collected leave them out (agreed with the user).
 */
export const isVersion = (card: Pick<CatalogCard, 'holoEnergy' | 'reverseHolo'>) => !!card.holoEnergy || card.reverseHolo;

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

/** A generation's sets for the set filter: "Gen 1 · Kanto" and its set names in release order. */
export interface SetGroup {
  label: string;
  sets: string[];
}

/**
 * The sets by generation (GENERATIONS' `poolSets`), each in release order; sets in no generation
 * (the promos) last, under Other.
 */
export function setGroups(cards: CatalogCard[]): SetGroup[] {
  const ids = new Map(cards.map((c) => [c.setName, c.setId]));
  const groups = Object.entries(GENERATIONS).map(([id, g]) => ({ label: `Gen ${id} · ${g.region}`, sets: setNames(cards).filter((s) => g.poolSets.includes(ids.get(s)!)) }));
  const other = setNames(cards).filter((s) => !groups.some((g) => g.sets.includes(s)));
  return [...groups, ...(other.length ? [{ label: 'Other', sets: other }] : [])].filter((g) => g.sets.length);
}

/** Searching for this (or as much of it as 3 letters or more) finds every Stadium Trainer. */
const STADIUM = 'stadium';

/** Whether the search text (already lower-cased) is in the card's name or one of its attacks' names, or names it a Stadium. */
export const matchesSearch = (card: Pick<CatalogCard, 'name' | 'attacks' | 'stadium'>, search: string) =>
  card.name.toLowerCase().includes(search) ||
  (card.attacks ?? []).some((a) => a?.toLowerCase().includes(search)) ||
  (card.stadium && search.length >= 3 && STADIUM.startsWith(search));

