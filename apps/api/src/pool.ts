import { generation, runType, type PoolCard, type Rarity } from '@poke-tcg/campaign';
import { prisma, type Card } from '@poke-tcg/db';
import { cardImplemented, type CardDef } from '@poke-tcg/game-engine';
import { isGalaxyFoil, isHolo, toCardDef } from './cards.js';

/** A catalog card's rarity, holos apart: holo and galaxy-foil cards (the promo Entei and Pichu, which TCGdex lists as Common) are holos. */
export const cardRarity = (card: Pick<Card, 'id' | 'rarity' | 'data'>): Rarity =>
  isHolo(card) || isGalaxyFoil(card) ? 'holo' : card.rarity === 'Rare' ? 'rare' : card.rarity === 'Uncommon' ? 'uncommon' : 'common';

/**
 * A generation's pool: every card of its sets (`poolSets`) the engine can load, only those it plays fully from the sets
 * whose effects are done (`implementedSets`: Gen 1's, Neo Genesis), with Stage 2s' Basics filled in for Pokémon Breeder.
 */
async function loadPool(gen: number): Promise<PoolCard[]> {
  const { poolSets, implementedSets } = generation(gen);
  const rows = await prisma.card.findMany({ where: { setId: { in: poolSets } }, orderBy: { id: 'asc' } });
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
