// Test-only: the card pool built from the TCGdex snapshot, as the API builds it from the catalog
// (a simplified copy of apps/api/src/cards.ts's toCardDef). Not exported from the package.
import { readFileSync } from 'node:fs';
import { attackEffect, cardImplemented, trainerEffect, type CardDef, type EnergyType, type Stage } from '@poke-tcg/game-engine';
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
  variants?: { holo?: boolean; reverse?: boolean } | null;
  attacks?: { name: string; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
  abilities?: { name: string; effect: string }[] | null;
  suffix?: string | null;
}

const STAGES: Record<string, Stage> = { Basic: 'basic', Baby: 'basic', Stage1: 'stage1', Stage2: 'stage2' };
const type = (t: string) => t.toLowerCase() as EnergyType;

/**
 * What the card evolves from, as the API has it: Team Rocket's Dark Stage 2 Pokémon from the Dark Stage 1, and an
 * owner's Pokémon (Gym Heroes) from the same owner's.
 */
function evolvesFrom(r: Row, stage: Stage): string | null {
  if (stage === 'stage2' && r.name.startsWith('Dark ') && r.evolveFrom && !r.evolveFrom.startsWith('Dark ')) return `Dark ${r.evolveFrom}`;
  if (stage === 'stage2' && r.name.startsWith('Light ') && r.evolveFrom && !r.evolveFrom.startsWith('Light ')) return `Light ${r.evolveFrom}`;
  const owner = stage !== 'basic' ? r.name.match(/^((?:Blaine|Brock|Erika|Lt\. Surge|Misty|Sabrina|Giovanni|Koga|Rocket)'s )/)?.[1] : undefined;
  const from = r.evolveFrom ?? (r.name === "Lt. Surge's Magneton" ? 'Magnemite' : null);
  if (owner && from) return (from.startsWith(owner) ? from : `${owner}${from}`).replace(/Nidoran([♀♂])$/, 'Nidoran $1');
  return r.evolveFrom ?? { 'ecard1-35': 'Ekans', 'ecard1-37': 'Wartortle' }[r.id] ?? (stage === 'stage1' && ['Omanyte', 'Kabuto', 'Aerodactyl', 'Dark Omanyte'].includes(r.name) ? 'Mysterious Fossil' : null);
}

function toDef(r: Row): CardDef | null {
  if (r.category === 'Pokemon') {
    // A Pokémon-ex TCGdex has no stage for, as the API has it before a re-seed (seed.ts works it out exactly).
    // An evolving EX Pokémon-ex TCGdex calls Basic (EX Dragon's Ampharos ex) counts as one with no stage, as the seed has it.
    const exEvolving = r.stage === 'Basic' && !!r.evolveFrom && /^ex[0-9]+-/.test(r.id);
    const stage = r.stage && !exEvolving ? STAGES[r.stage] : r.evolveFrom ? 'stage1' : 'basic';
    if (!stage || !r.types?.[0] || r.hp == null) return null;
    return {
      id: r.id,
      kind: 'pokemon',
      name: r.name.replace(/^Nidoran ([♀♂])$/, 'Nidoran$1'),
      imageUrl: null,
      type: type(r.types[0]),
      ...(r.types.length > 1 && { types: r.types.map(type) }),
      hp: r.hp,
      stage,
      evolvesFrom: evolvesFrom(r, stage),
      // Printed cost and damage where TCGdex's differ (Dark Magneton), as the API has them.
      // Each name once: TCGdex lists some attacks twice (Southern Islands Tentacruel), as the API has them.
      attacks: (r.attacks ?? []).filter((a, i, all) => all.findIndex((b) => b.name === a.name) === i).map((a) => {
        const effect = attackEffect(r.id, a.name);
        // TCGdex's "n/a" is no text, as the seed has it (EX Unseen Forces Hitmonlee's Mega Kick).
        return { name: a.name, cost: effect?.cost ?? (a.cost ?? []).map(type), damage: Number.parseInt(String(effect?.damage ?? a.damage ?? ''), 10) || 0, text: a.effect === 'n/a' ? null : a.effect };
      }),
      power: r.abilities?.[0] ? { name: r.abilities[0].name, text: r.abilities[0].effect } : null,
      retreatCost: r.retreat ?? 0,
      ...(r.suffix === 'ex' && { ex: true }),
    };
  }
  if (r.category === 'Energy') {
    if (r.name === 'Double Colorless Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
    if (r.name === 'Rainbow Energy' || r.name === 'Multi Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', anyType: true, basic: false };
    if (r.name === 'Miracle Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', anyType: true, amount: 2, basic: false };
    if (r.name === 'Double Rainbow Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', anyType: true, amount: 2, basic: false };
    if (r.name === 'Aqua Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'water', amount: 2, basic: false };
    if (r.name === 'Magma Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'fighting', amount: 2, basic: false };
    if (r.name === 'R Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'darkness', amount: 2, basic: false };
    if (r.name === 'Dark Metal Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'darkness', basic: false };
    if (r.name === 'Boost Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', amount: 3, basic: false };
    if (r.name === 'Bounce Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
    if (r.name === 'Full Heal Energy' || r.name === 'Potion Energy') return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: 'colorless', basic: false };
    const t = type(r.name.replace(/ Energy$/, ''));
    if (['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting'].includes(t)) return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: t };
    // Special Energy the engine doesn't implement yet, as the API loads it: 1 Energy of its type (Darkness, Metal), otherwise Colorless.
    return { id: r.id, kind: 'energy', name: r.name, imageUrl: null, energyType: t === 'darkness' || t === 'metal' ? t : 'colorless', basic: false };
  }
  if (['Clefairy Doll', 'Mysterious Fossil', 'Claw Fossil', 'Root Fossil'].includes(r.name)) {
    // As the API has it: a Fossil's Poké-Body comes from its Trainer effect.
    const power = trainerEffect(r.id)?.asPokemon?.power;
    return { id: r.id, kind: 'pokemon', name: r.name, imageUrl: null, type: 'colorless', hp: r.hp ?? 10, stage: 'basic', evolvesFrom: null, attacks: [], retreatCost: 0, trainerText: r.effect ?? '', ...(power && { power }) };
  }
  return { id: r.id, kind: 'trainer', name: r.name, imageUrl: null, text: r.effect ?? '' };
}

const rarity = (r: Row): Rarity => (r.variants?.holo ? 'holo' : r.rarity === 'Rare' ? 'rare' : r.rarity === 'Uncommon' ? 'uncommon' : 'common');

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
/** As the seed's reverseHoloCard: TCGdex's reverse prints up to EX Unseen Forces, the rule after it (not Pokémon-ex, Gold Stars or secret rares). */
const reverseHolo = (r: Row) => {
  const set = r.id.split('-')[0]!;
  if (!/^ex[0-9]+$/.test(set)) return false;
  if (r.variants?.reverse) return true;
  const official = sets.find((s) => s.id === set)?.cardCount.official ?? Infinity;
  return Number(set.slice(2)) >= 11 && r.suffix !== 'ex' && !r.name.includes('☆') && Number(r.id.split('-')[1]) <= official;
};

export function testPackSet(setId: string): PackSet {
  const set: PackSet = { common: [], uncommon: [], rare: [], holo: [] };
  for (const r of rows) {
    if (r.id.split('-')[0] !== setId || (r.category === 'Energy' && r.name !== 'Double Colorless Energy')) continue;
    set[rarity(r) === 'holo' ? 'holo' : rarity(r)].push(r.id);
    // The reverse-holo prints the seed makes of the EX cards (reverseHoloCard in packages/db/prisma/holo-energy.ts).
    if (reverseHolo(r)) (set.reverse ??= []).push(`${r.id}-reverse`);
  }
  return set;
}
