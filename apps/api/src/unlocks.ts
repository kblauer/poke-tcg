// Card unlocks: which cards an account may put in its decks. A card is unlocked once (any number of copies,
// up to the usual 4); basic Energy is always unlocked. The starter deck's cards are unlocked with the
// account, and every card gained in a run is unlocked as it's gained. A Base Set 2 common and the earlier
// common it reprints, whose art it shares, are unlocked together.
import { prisma, type Card, type Prisma } from '@poke-tcg/db';
import { BASE4_REPRINTS } from '@poke-tcg/game-engine';
import { isBasicEnergyCard } from './cards.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** The ids of the cards the user has unlocked (basic Energy isn't listed: it always is). */
export async function unlockedIds(userId: string, db: Db = prisma): Promise<Set<string>> {
  const rows = await db.cardUnlock.findMany({ where: { userId }, select: { cardId: true } });
  return new Set(rows.map((r) => r.cardId));
}

/**
 * The cards unlocked with these: a Base Set 2 common and the earlier common it reprints are the same card with the
 * same art, so unlocking either unlocks both (agreed with the user; only Base Set 2, and only its commons). The
 * migrations `20261018090000_base2_common_unlocks` (reprints) and `20261018100000_base2_common_originals`
 * (originals) did the same for unlocks made before this.
 */
async function base2Commons(ids: Set<string>, db: Db): Promise<string[]> {
  const pairs = Object.entries(BASE4_REPRINTS).filter(([reprint, original]) => ids.has(reprint) || ids.has(original));
  if (!pairs.length) return [];
  // Basic Energy is always unlocked, so it isn't listed.
  const commons = await db.card.findMany({ where: { id: { in: pairs.map(([reprint]) => reprint) }, rarity: 'Common', kind: { not: 'ENERGY' } }, select: { id: true } });
  const common = new Set(commons.map((c) => c.id));
  return pairs.filter(([reprint]) => common.has(reprint)).flat();
}

/** Unlocks the cards, with the Base Set 2 commons reprinting them or reprinted by them (those already unlocked stay as they are). */
export async function unlockCards(userId: string, cardIds: Iterable<string>, db: Db = prisma) {
  const ids = new Set(cardIds);
  for (const id of await base2Commons(ids, db)) ids.add(id);
  if (ids.size) await db.cardUnlock.createMany({ data: [...ids].map((cardId) => ({ userId, cardId, quantity: 1 })), skipDuplicates: true });
}

/** Cards in a deck that aren't unlocked, by name, once each. */
export function lockedNames(cards: { cardId: string; card: Pick<Card, 'name' | 'kind' | 'data'> }[], unlocked: Set<string>): string[] {
  return [...new Set(cards.filter((c) => !isBasicEnergyCard(c.card) && !unlocked.has(c.cardId)).map((c) => c.card.name))];
}

/** The problem a deck has if it holds cards that aren't unlocked, or null. */
export function lockedProblem(cards: { cardId: string; card: Pick<Card, 'name' | 'kind' | 'data'> }[], unlocked: Set<string>): string | null {
  const names = lockedNames(cards, unlocked);
  if (!names.length) return null;
  return `Not unlocked yet: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Win cards in runs to unlock them.`;
}
