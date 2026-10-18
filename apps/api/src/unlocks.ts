// Card unlocks: which cards an account may put in its decks. A card is unlocked once (any number of copies,
// up to the usual 4); basic Energy is always unlocked. Holo Energy is the exception: found only in packs, each pull
// adds one copy (CardUnlock.quantity), and a deck can hold only as many as were pulled. The starter deck's cards are unlocked with the
// account, and every card gained in a run is unlocked as it's gained. A Base Set 2 card and the earlier card it
// reprints are unlocked together when they look the same (neither is holo).
import { prisma, type Card, type Prisma } from '@poke-tcg/db';
import { BASE4_REPRINTS } from '@poke-tcg/game-engine';
import { cardLabel, holoEnergyStyle, isBasicEnergyCard, isHolo } from './cards.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** The cards the user has unlocked, with how many copies (only holo Energy has more than 1). Basic Energy isn't listed: it always is. */
export type Unlocked = Map<string, number>;

export async function unlockedIds(userId: string, db: Db = prisma): Promise<Unlocked> {
  const rows = await db.cardUnlock.findMany({ where: { userId }, select: { cardId: true, quantity: true } });
  return new Map(rows.map((r) => [r.cardId, r.quantity]));
}

/** Adds a copy of each holo Energy pulled (an id twice: two copies). */
export async function addHoloEnergy(userId: string, cardIds: string[], db: Db = prisma) {
  const counts = cardIds.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  for (const [cardId, n] of counts) {
    await db.cardUnlock.upsert({ where: { userId_cardId: { userId, cardId } }, create: { userId, cardId, quantity: n }, update: { quantity: { increment: n } } });
  }
}

/**
 * Base Set 2's non-holo rares reprinting a Jungle holo (BASE4_REPRINTS points at the holo, whose effects they share)
 * look the same as Jungle's own non-holo print of it.
 */
const NON_HOLO_ORIGINALS: Record<string, string> = {
  'base4-26': 'base2-21', // Kangaskhan
  'base4-27': 'base2-22', // Mr. Mime
  'base4-29': 'base2-25', // Pinsir
  'base4-30': 'base2-27', // Snorlax
  'base4-31': 'base2-29', // Venomoth
  'base4-32': 'base2-30', // Victreebel
};

/** Each Base Set 2 card and the earlier print with its look: [reprint, original]. */
export const BASE2_PAIRS = Object.entries(BASE4_REPRINTS).map(([reprint, original]) => [reprint, NON_HOLO_ORIGINALS[reprint] ?? original] as const);

/**
 * The cards unlocked with these: a Base Set 2 card and the earlier card it reprints have the same art, so when
 * neither is holo they look the same, and unlocking either unlocks both, whatever the rarity (agreed with the
 * user; only Base Set 2). Holo rares look different (Base Set 2's have the galaxy foil), so they're unlocked
 * separately. The migration `20261019090000_base2_reprint_unlocks` (after the commons-only
 * `20261018090000_base2_common_unlocks` and `20261018100000_base2_common_originals`) did the same for unlocks
 * made before this.
 */
async function base2Reprints(ids: Set<string>, db: Db): Promise<string[]> {
  const pairs = BASE2_PAIRS.filter(([reprint, original]) => ids.has(reprint) || ids.has(original));
  if (!pairs.length) return [];
  const rows = await db.card.findMany({ where: { id: { in: pairs.flat() } }, select: { id: true, kind: true, data: true } });
  // Basic Energy is always unlocked, so it isn't listed.
  const plain = new Set(rows.filter((c) => !isHolo(c) && !isBasicEnergyCard(c)).map((c) => c.id));
  return pairs.filter(([reprint, original]) => plain.has(reprint) && plain.has(original)).flat();
}

/** Unlocks the cards, with the Base Set 2 cards that look the same as them (see base2Reprints; those already unlocked stay as they are). */
export async function unlockCards(userId: string, cardIds: Iterable<string>, db: Db = prisma) {
  const ids = new Set(cardIds);
  for (const id of await base2Reprints(ids, db)) ids.add(id);
  if (ids.size) await db.cardUnlock.createMany({ data: [...ids].map((cardId) => ({ userId, cardId, quantity: 1 })), skipDuplicates: true });
}

/** Cards in a deck that aren't unlocked, by name, once each. Holo Energy counts (it isn't always unlocked like basic Energy). */
export function lockedNames(cards: { cardId: string; card: Pick<Card, 'name' | 'kind' | 'data'> }[], unlocked: Unlocked): string[] {
  const locked = cards.filter((c) => (!isBasicEnergyCard(c.card) || holoEnergyStyle(c.card)) && !unlocked.has(c.cardId));
  return [...new Set(locked.map((c) => cardLabel(c.card)))];
}

/** The problem a deck has if it holds cards that aren't unlocked, or more holo Energy than were pulled, or null. */
export function lockedProblem(cards: { cardId: string; quantity?: number; card: Pick<Card, 'name' | 'kind' | 'data'> }[], unlocked: Unlocked): string | null {
  const names = lockedNames(cards, unlocked);
  if (names.length) return `Not unlocked yet: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Win cards in runs to unlock them.`;
  const over = cards.find((c) => holoEnergyStyle(c.card) && (c.quantity ?? 1) > (unlocked.get(c.cardId) ?? 0));
  return over ? `${cardLabel(over.card)}: ${over.quantity} in the deck, but you've pulled ${unlocked.get(over.cardId) ?? 0}` : null;
}
