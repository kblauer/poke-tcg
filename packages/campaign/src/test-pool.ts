// Test-only: the card pool built from the TCGdex snapshot, as the API builds it from the catalog
// (a simplified copy of apps/api/src/cards.ts's toCardDef). Not exported from the package.
import { readFileSync } from 'node:fs';
import { cardImplemented, type CardDef, type EnergyType, type Stage } from '@poke-tcg/game-engine';
import { POOL_SETS, type PoolCard, type Rarity } from './pool.js';

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

const STAGES: Record<string, Stage> = { Basic: 'basic', Stage1: 'stage1', Stage2: 'stage2' };
const type = (t: string) => t.toLowerCase() as EnergyType;

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
      evolvesFrom: r.evolveFrom ?? (stage === 'stage1' && ['Omanyte', 'Kabuto', 'Aerodactyl'].includes(r.name) ? 'Mysterious Fossil' : null),
      attacks: (r.attacks ?? []).map((a) => ({ name: a.name, cost: (a.cost ?? []).map(type), damage: Number.parseInt(String(a.damage ?? ''), 10) || 0, text: a.effect })),
      power: r.abilities?.[0] ? { name: r.abilities[0].name, text: r.abilities[0].effect } : null,
      retreatCost: r.retreat ?? 0,
    };
  }
  if (r.category === 'Energy') {
    if (r.name === 'Double Colorless Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
    const t = type(r.name.replace(/ Energy$/, ''));
    return ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting'].includes(t) ? { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: t } : null;
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

/** Every card in the snapshot the engine can load (any set), for checking fixed decks like the bosses'. */
const CATALOG = new Map(rows.flatMap((r) => {
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
