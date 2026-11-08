import { cardRarity, generation, runType, type PoolCard, type RunState } from '@poke-tcg/campaign';
import { cardImplemented, type CardDef } from '@poke-tcg/game-engine';
import { toCardDef } from './cards.js';
import { catalogCards, catalogInIdOrder } from './catalog.js';

/** A catalog card's rarity, holos apart (the campaign's card-fixes.ts, shared with its test pool). */
export { cardRarity };

/**
 * A generation's pool: every card of its sets (`poolSets`) the engine can load, only those it plays fully from the sets
 * whose effects are done (`implementedSets`: Gen 1's, Neo Genesis), with Stage 2s' Basics filled in for Pokémon Breeder.
 */
async function loadPool(gen: number): Promise<PoolCard[]> {
  const { poolSets, implementedSets } = generation(gen);
  const rows = (await catalogInIdOrder()).filter((row) => poolSets.includes(row.setId));
  const pool = rows.flatMap((row) => {
    let def: CardDef;
    try {
      def = toCardDef(row);
    } catch {
      return []; // A Trainer or Energy the engine doesn't support.
    }
    return !implementedSets.includes(row.setId) || cardImplemented(def) ? [{ def, rarity: cardRarity(row) }] : [];
  });
  for (const { def } of pool) {
    if (def.kind !== 'pokemon' || def.stage !== 'stage2') continue;
    const stage1 = pool.find((c) => c.def.kind === 'pokemon' && c.def.stage === 'stage1' && c.def.name === def.evolvesFrom);
    def.evolvesFromBasic = stage1?.def.kind === 'pokemon' ? stage1.def.evolvesFrom : null;
  }
  return pool;
}

const cached = new Map<number, Promise<PoolCard[]>>();

/**
 * The card pool a generation's runs use (see @poke-tcg/campaign's pool.ts and GENERATIONS): Gen 1's by default (single
 * battles too). The catalog doesn't change at runtime, so each is loaded once.
 */
export function cardPool(gen = 1): Promise<PoolCard[]> {
  let pool = cached.get(gen);
  if (!pool) {
    pool = loadPool(gen).catch((error) => {
      cached.delete(gen);
      throw error;
    });
    cached.set(gen, pool);
  }
  return pool;
}

/** The pool of a run's generation (by its run type). */
export const runPool = (type: string) => cardPool(runType(type).generation);

/**
 * The cards a run's view can show: its pool, and the catalog's for the cards the run holds that its pool lacks (a deck of
 * another generation's cards, which any playable deck may be: a trade's card to give showed as unknown otherwise).
 */
export async function runViewPool(state: RunState): Promise<PoolCard[]> {
  const pool = await runPool(state.type);
  const have = new Set(pool.map((c) => c.def.id));
  const e = state.encounter;
  const missing = new Set([...state.deck, ...state.gained, ...(e?.kind === 'trade' ? [e.give, e.get] : [])].filter((id) => !have.has(id)));
  if (!missing.size) return pool;
  const extra = (await catalogCards(missing)).flatMap((row) => {
    try {
      return [{ def: toCardDef(row), rarity: cardRarity(row) }];
    } catch {
      return [];
    }
  });
  return [...pool, ...extra];
}
