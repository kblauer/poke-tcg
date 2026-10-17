// Card unlocks: which cards an account may put in its decks. A card is unlocked once (any number of copies,
// up to the usual 4); basic Energy is always unlocked. The starter deck's cards are unlocked with the
// account, and every card gained in a run is unlocked as it's gained.
import { prisma, type Card, type Prisma } from '@poke-tcg/db';
import { isBasicEnergyCard } from './cards.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** The ids of the cards the user has unlocked (basic Energy isn't listed: it always is). */
export async function unlockedIds(userId: string, db: Db = prisma): Promise<Set<string>> {
  const rows = await db.cardUnlock.findMany({ where: { userId }, select: { cardId: true } });
  return new Set(rows.map((r) => r.cardId));
}

/** Unlocks the cards (those already unlocked stay as they are). */
export async function unlockCards(userId: string, cardIds: Iterable<string>, db: Db = prisma) {
  const ids = [...new Set(cardIds)];
  if (ids.length) await db.cardUnlock.createMany({ data: ids.map((cardId) => ({ userId, cardId, quantity: 1 })), skipDuplicates: true });
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
