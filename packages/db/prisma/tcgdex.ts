// Shapes of the TCGdex snapshot written by scripts/fetch-tcgdex.ts.

/** Relative to packages/db. */
import type { HoloEnergyStyle } from './holo-energy.js';

export const SNAPSHOT_PATH = 'prisma/data/tcgdex-wotc.json';

/** Hand-made cards TCGdex doesn't have (same shape, `source: 'custom'`), seeded after the snapshot. Relative to packages/db. */
export const CUSTOM_PATH = 'prisma/data/custom-cards.json';

export interface TcgdexSet {
  id: string;
  name: string;
  series: string;
  releaseDate: string | null;
  cardCount: { total: number; official: number };
  logo: string | null;
  symbol: string | null;
}

export interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image: string | null;
  category: 'Pokemon' | 'Trainer' | 'Energy';
  rarity: string | null;
  illustrator: string | null;
  hp: number | null;
  types: string[] | null;
  stage: string | null;
  evolveFrom: string | null;
  dexId: number[] | null;
  retreat: number | null;
  suffix: string | null;
  effect: string | null;
  trainerType: string | null;
  energyType: string | null;
  set: { id: string };
  variants: { firstEdition: boolean; holo: boolean; normal: boolean; reverse: boolean } | null;
  /** `damage` is a string because of values like "30+" or "10×". */
  attacks: { name: string; cost: string[] | null; damage: string | null; effect: string | null }[] | null;
  /** WOTC era: "Pokemon Power"; e-Card era: "Poke-POWER" / "Poke-BODY". */
  abilities: { name: string; type: string; effect: string }[] | null;
  weaknesses: { type: string; value: string | null }[] | null;
  resistances: { type: string; value: string | null }[] | null;
  item: { name: string; effect: string } | null;
  /** Holo Energy only (made by the seed, not from TCGdex): the holo style it's shown in (holo-energy.ts). */
  holoEnergy?: HoloEnergyStyle;
}

export interface CardSnapshot {
  source: 'tcgdex' | 'custom';
  fetchedAt: string;
  sets: TcgdexSet[];
  cards: TcgdexCard[];
}
