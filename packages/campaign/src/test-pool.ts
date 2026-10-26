// Test-only: the card pool built from the TCGdex snapshot, as the API builds it from the catalog, with the conversion
// and fixes the API uses (card-fixes.ts, catalogCardDef) on rows shaped as the seed writes them. Not exported from the package.
import { readFileSync } from 'node:fs';
import { cardImplemented, type CardDef } from '@poke-tcg/game-engine';
import { cardRarity, catalogCardDef, type CatalogCard } from './card-fixes.js';
import type { PackSet } from './packs.js';
import { GEN2_DONE_SETS, GEN2_SETS, GEN3_SETS, POOL_SETS, type PoolCard } from './pool.js';

/** A snapshot card (TcgdexCard, packages/db/prisma/tcgdex.ts): the fields the seed takes out of it, the rest its Card.data. */
export interface Row {
  id: string;
  localId?: string;
  name: string;
  image?: string | null;
  category: 'Pokemon' | 'Trainer' | 'Energy';
  rarity: string | null;
  hp: number | null;
  types: string[] | null;
  stage: string | null;
  evolveFrom: string | null;
  set?: { id: string };
  effect?: string | null;
  variants?: { holo?: boolean; reverse?: boolean } | null;
  attacks?: { name: string | null; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
  abilities?: { name: string; type: string; effect: string }[] | null;
  suffix?: string | null;
  /** Energy: "Normal" for basic Energy. */
  energyType?: string | null;
}

const KIND = { Pokemon: 'POKEMON', Trainer: 'TRAINER', Energy: 'ENERGY' } as const;

/** The seed's `tidy`: TCGdex's "n/a" is no text, its EX text often ends in a stray quote mark and mangles some "é"s. */
const tidy = (text: string | null | undefined) => (text === 'n/a' ? null : (text?.replace(/"$/, '').replace(/Pok�+mon/g, 'Pokémon') ?? null));

/**
 * A snapshot card as the seed writes it to the catalog (toCardRow in packages/db/prisma/seed.ts), as far as the tests need:
 * the printed name (Nidoran♀ without a space: printedName), its texts tidied, and the rest of its fields as Card.data. The
 * seed's other fixes (TCGDEX_FIXES, basic Energy never holo) aren't copied.
 *
 * The stage: TCGdex gives 81 Pokémon-ex (EX FireRed & LeafGreen on) no stage, and calls six of EX Dragon's evolving ones
 * Basic (Ampharos ex, from Flaaffy). The seed's stageOf tells those six apart (`exEvolving`, copied here) and works every
 * one's stage out from the Pokémon it evolves from; the API's catalog, not re-seeded with it yet, has them with no stage,
 * which catalogCardDef takes as Stage 1 (Basic with no "Evolves from"). This leaves the six without a stage too, so they get
 * the same: Stage 1 here, where a re-seeded catalog has Stage 2. It can go when a refreshed snapshot gives every Pokémon-ex
 * its stage.
 */
export function toCatalog(r: Row): CatalogCard {
  const { id, localId: _localId, name, image, category, rarity, hp, types, stage, evolveFrom, set: _set, ...rest } = r;
  const exEvolving = category === 'Pokemon' && stage === 'Basic' && !!evolveFrom && /^ex[0-9]+-/.test(id);
  const data = {
    ...rest,
    effect: tidy(rest.effect),
    attacks: rest.attacks?.map((a) => ({ ...a, effect: tidy(a.effect) })) ?? rest.attacks,
    abilities: rest.abilities?.map((a) => ({ ...a, effect: tidy(a.effect) ?? a.effect })) ?? rest.abilities,
  };
  return {
    id,
    name: name.replace(/^Nidoran ([♀♂])$/, 'Nidoran$1'),
    kind: KIND[category],
    imageUrl: image ?? null,
    rarity,
    hp,
    types: types ?? [],
    stage: category === 'Pokemon' && !exEvolving ? stage : null,
    evolveFrom,
    data,
  };
}

/** The engine's definition of a snapshot card, or null for one it can't take (as the API's loadPool leaves those out). */
function toDef(r: Row): CardDef | null {
  try {
    return catalogCardDef(toCatalog(r));
  } catch {
    return null;
  }
}

const rarity = (r: Row) => cardRarity(toCatalog(r));

const raw = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as Row[] | { cards: Row[] };
const rows = Array.isArray(raw) ? raw : raw.cards;
const sets = (Array.isArray(raw) ? [] : ((raw as { sets?: { id: string; cardCount: { official: number } }[] }).sets ?? []));

export const TEST_POOL: PoolCard[] = rows
  .filter((r) => POOL_SETS.includes(r.id.split('-')[0]!))
  .flatMap((r) => {
    const def = toDef(r);
    return def && cardImplemented(def) ? [{ def, rarity: rarity(r) }] : [];
  });

/** Gen 2's pool as the API builds it: every card of GEN2_SETS it can load, only implemented ones from GEN2_DONE_SETS (the others' effects are still to come). */
export const GEN2_TEST_POOL: PoolCard[] = rows
  .filter((r) => GEN2_SETS.includes(r.id.split('-')[0]!))
  .flatMap((r) => {
    const def = toDef(r);
    return def && (!GEN2_DONE_SETS.includes(r.id.split('-')[0]!) || cardImplemented(def)) ? [{ def, rarity: rarity(r) }] : [];
  });

/** Gen 3's pool as the API builds it: the cards of GEN3_SETS (the EX sets, every one's effects done) the engine plays fully. */
export const GEN3_TEST_POOL: PoolCard[] = rows
  .filter((r) => GEN3_SETS.includes(r.id.split('-')[0]!))
  .flatMap((r) => {
    const def = toDef(r);
    return def && cardImplemented(def) ? [{ def, rarity: rarity(r) }] : [];
  });

/** Cards added by hand to the catalog (packages/db/prisma/data/custom-cards.json), in the snapshot's shape. */
const custom = (JSON.parse(readFileSync(new URL('../../db/prisma/data/custom-cards.json', import.meta.url), 'utf8')) as { cards: Row[] }).cards;

/** Every card in the snapshot and the hand-made ones the engine can load (any set), for checking fixed decks like the bosses'. */
const CATALOG = new Map([...rows, ...custom].flatMap((r) => {
  const def = toDef(r);
  return def ? [[r.id, def] as const] : [];
}));

export const catalogDef = (id: string) => {
  const def = CATALOG.get(id);
  if (!def) throw new Error(`Not in the catalog: ${id}`);
  return def;
};

export const testDef = (id: string) => {
  const c = TEST_POOL.find((p) => p.def.id === id);
  if (!c) throw new Error(`Not in the pool: ${id}`);
  return c.def;
};

/**
 * As the seed's reverseHoloCard: TCGdex's reverse prints up to EX Unseen Forces and in Gen 4's sets, the rule after it in
 * the later EX sets (not Pokémon-ex, Gold Stars or secret rares), and Gen 5's rule (every card numbered in the set but
 * the Pokémon-EX, Ultra and Secret Rares and basic Energy; none in Dragon Vault or the Radiant Collection).
 */
const reverseHolo = (r: Row) => {
  const set = r.id.split('-')[0]!;
  if (/^bw[0-9]+$/.test(set)) {
    const number = r.id.split('-')[1]!;
    const official = sets.find((s) => s.id === set)?.cardCount.official ?? Infinity;
    return /^[0-9]+$/.test(number) && Number(number) <= official && r.suffix !== 'EX' && r.rarity !== 'Ultra Rare' && r.rarity !== 'Secret Rare' && !(r.category === 'Energy' && r.energyType === 'Normal');
  }
  if (!/^(ex|dp|pl|hgss|col)[0-9]+$/.test(set)) return false;
  if (r.variants?.reverse) return true;
  if (!set.startsWith('ex')) return false;
  const official = sets.find((s) => s.id === set)?.cardCount.official ?? Infinity;
  return Number(set.slice(2)) >= 11 && r.suffix !== 'ex' && !r.name.includes('☆') && Number(r.id.split('-')[1]) <= official;
};

/** A set's cards for packs, as the API groups them (basic Energy left out). */
export function testPackSet(setId: string): PackSet {
  const set: PackSet = { common: [], uncommon: [], rare: [], holo: [] };
  for (const r of rows) {
    if (r.id.split('-')[0] !== setId || (r.category === 'Energy' && r.name !== 'Double Colorless Energy')) continue;
    set[rarity(r) === 'holo' ? 'holo' : rarity(r)].push(r.id);
    // The reverse-holo prints the seed makes of the EX, Gen 4 and Gen 5 cards (reverseHoloCard in packages/db/prisma/holo-energy.ts).
    if (reverseHolo(r)) (set.reverse ??= []).push(`${r.id}-reverse`);
  }
  return set;
}
