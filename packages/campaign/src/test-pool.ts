// Test-only: the card pool built from the TCGdex snapshot, as the API builds it from the catalog
// (a simplified copy of apps/api/src/cards.ts's toCardDef). Not exported from the package.
import { readFileSync } from 'node:fs';
import { attackEffect, cardImplemented, type CardDef, type EnergyType, type Stage } from '@poke-tcg/game-engine';
import type { PackSet } from './packs.js';
import { GEN2_DONE_SETS, GEN2_SETS, POOL_SETS, type PoolCard, type Rarity } from './pool.js';

interface Row {
  id: string;
  name: string;
  category: string;
  rarity: string | null;
  hp: number | null;
  types: string[] | null;
  stage: string | null;
  evolveFrom: string | null;
  retreat: number | null;
  effect: string | null;
  variants?: { holo?: boolean } | null;
  attacks?: { name: string; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
  abilities?: { name: string; effect: string }[] | null;
}

const STAGES: Record<string, Stage> = { Basic: 'basic', Baby: 'basic', Stage1: 'stage1', Stage2: 'stage2' };
const type = (t: string) => t.toLowerCase() as EnergyType;

/**
 * What the card evolves from, as the API has it: Team Rocket's Dark Stage 2 Pokémon from the Dark Stage 1, and an
 * owner's Pokémon (Gym Heroes) from the same owner's.
 */
function evolvesFrom(r: Row, stage: Stage): string | null {
  if (stage === 'stage2' && r.name.startsWith('Dark ') && r.evolveFrom && !r.evolveFrom.startsWith('Dark ')) return `Dark ${r.evolveFrom}`;
  const owner = stage !== 'basic' ? r.name.match(/^((?:Blaine|Brock|Erika|Lt\. Surge|Misty|Sabrina|Giovanni|Koga|Rocket)'s )/)?.[1] : undefined;
  const from = r.evolveFrom ?? (r.name === "Lt. Surge's Magneton" ? 'Magnemite' : null);
  if (owner && from) return (from.startsWith(owner) ? from : `${owner}${from}`).replace(/Nidoran([♀♂])$/, 'Nidoran $1');
  return r.evolveFrom ?? (stage === 'stage1' && ['Omanyte', 'Kabuto', 'Aerodactyl'].includes(r.name) ? 'Mysterious Fossil' : null);
}

function toDef(r: Row): CardDef | null {
  if (r.category === 'Pokemon') {
    const stage = r.stage && STAGES[r.stage];
    if (!stage || !r.types?.[0] || r.hp == null) return null;
    return {
      id: r.id,
      kind: 'pokemon',
      name: r.name,
      imageUrl: null,
      type: type(r.types[0]),
      hp: r.hp,
      stage,
      evolvesFrom: evolvesFrom(r, stage),
      // Printed cost and damage where TCGdex's differ (Dark Magneton), as the API has them.
      attacks: (r.attacks ?? []).map((a) => {
        const effect = attackEffect(r.id, a.name);
        return { name: a.name, cost: effect?.cost ?? (a.cost ?? []).map(type), damage: Number.parseInt(String(effect?.damage ?? a.damage ?? ''), 10) || 0, text: a.effect };
      }),
      power: r.abilities?.[0] ? { name: r.abilities[0].name, text: r.abilities[0].effect } : null,
      retreatCost: r.retreat ?? 0,
    };
  }
  if (r.category === 'Energy') {
    if (r.name === 'Double Colorless Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
    if (r.name === 'Rainbow Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', anyType: true, basic: false };
    if (r.name === 'Full Heal Energy' || r.name === 'Potion Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', basic: false };
    const t = type(r.name.replace(/ Energy$/, ''));
    if (['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting'].includes(t)) return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: t };
    // Special Energy the engine doesn't implement yet, as the API loads it: 1 Energy of its type (Darkness, Metal), otherwise Colorless.
    return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: t === 'darkness' || t === 'metal' ? t : 'colorless', basic: false };
  }
  if (r.name === 'Clefairy Doll' || r.name === 'Mysterious Fossil') {
    return { id: r.id, kind: 'pokemon', name: r.name, imageUrl: null, type: 'colorless', hp: 10, stage: 'basic', evolvesFrom: null, attacks: [], retreatCost: 0, trainerText: r.effect ?? '' };
  }
  return { id: r.id, kind: 'trainer', name: r.name, imageUrl: null, text: r.effect ?? '' };
}

const rarity = (r: Row): Rarity => (r.variants?.holo ? 'holo' : r.rarity === 'Rare' ? 'rare' : r.rarity === 'Uncommon' ? 'uncommon' : 'common');

const raw = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as Row[] | { cards: Row[] };
const rows = Array.isArray(raw) ? raw : raw.cards;

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

/** A set's cards for packs, as the API groups them (basic Energy left out). */
export function testPackSet(setId: string): PackSet {
  const set: PackSet = { common: [], uncommon: [], rare: [], holo: [] };
  for (const r of rows) {
    if (r.id.split('-')[0] !== setId || (r.category === 'Energy' && r.name !== 'Double Colorless Energy')) continue;
    set[rarity(r) === 'holo' ? 'holo' : rarity(r)].push(r.id);
  }
  return set;
}
