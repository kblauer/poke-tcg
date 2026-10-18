import { POOL_SETS, type PoolCard, type Rarity } from '@poke-tcg/campaign';
import { prisma, type Card } from '@poke-tcg/db';
import { cardImplemented, type CardDef } from '@poke-tcg/game-engine';
import { isGalaxyFoil, isHolo, toCardDef } from './cards.js';

/** A catalog card's rarity, holos apart: holo and galaxy-foil cards (the promo Entei and Pichu, which TCGdex lists as Common) are holos. */
export const cardRarity = (card: Pick<Card, 'id' | 'rarity' | 'data'>): Rarity =>
  isHolo(card) || isGalaxyFoil(card) ? 'holo' : card.rarity === 'Rare' ? 'rare' : card.rarity === 'Uncommon' ? 'uncommon' : 'common';

/** Every card in POOL_SETS the engine plays fully, with Stage 2s' Basics filled in for Pokémon Breeder. */
async function loadPool(): Promise<PoolCard[]> {
  const rows = await prisma.card.findMany({ where: { setId: { in: POOL_SETS } }, orderBy: { id: 'asc' } });
  const pool = rows.flatMap((row) => {
    let def: CardDef;
    try {
      def = toCardDef(row);
    } catch {
      return []; // A Trainer or Energy the engine doesn't support.
    }
    return cardImplemented(def) ? [{ def, rarity: cardRarity(row) }] : [];
  });
  for (const { def } of pool) {
    if (def.kind !== 'pokemon' || def.stage !== 'stage2') continue;
    const stage1 = pool.find((c) => c.def.kind === 'pokemon' && c.def.stage === 'stage1' && c.def.name === def.evolvesFrom);
    def.evolvesFromBasic = stage1?.def.kind === 'pokemon' ? stage1.def.evolvesFrom : null;
  }
  return pool;
}

let cached: Promise<PoolCard[]> | undefined;

/** The card pool runs use (see @poke-tcg/campaign's pool.ts). The catalog doesn't change at runtime, so it's loaded once. */
export function cardPool(): Promise<PoolCard[]> {
  cached ??= loadPool().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
