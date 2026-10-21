// Card unlocks: which cards an account may put in its decks. A card is unlocked once (any number of copies,
// up to the usual 4); basic Energy is always unlocked. A holo with a non-holo version of the same card in its set
// (Jungle's holo Clefable and its plain one) is a special addition: it counts its copies (CardUnlock.quantity), and
// gaining it unlocks the non-holo one too. Holo-only cards (Base Set's Alakazam) are ordinary unlocks. Holo Energy
// (found only in packs) counts copies too. A deck holds no more copies of a special holo or a holo Energy than were
// gained. The starter deck's cards are unlocked with the account, and every card gained in a run is unlocked as it's gained. A Base Set 2 card and the earlier card it
// reprints are unlocked together when they look the same (neither is holo).
import { prisma, type Card, type Prisma } from '@poke-tcg/db';
import { BASE4_REPRINTS } from '@poke-tcg/game-engine';
import { cardLabel, holoEnergyStyle, isBasicEnergyCard, isGalaxyFoil, isHolo, isReverseHolo, type CardData } from './cards.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** The cards the user has unlocked, with how many copies (only counted holos have more than 1). Basic Energy isn't listed: it always is. */
export type Unlocked = Map<string, number>;

export async function unlockedIds(userId: string, db: Db = prisma): Promise<Unlocked> {
  const rows = await db.cardUnlock.findMany({ where: { userId }, select: { cardId: true, quantity: true } });
  return new Map(rows.map((r) => [r.cardId, r.quantity]));
}

type FaceCard = Pick<Card, 'id' | 'setId' | 'name' | 'kind' | 'hp' | 'data'>;

/** What makes two prints the same card: kind, HP, attacks, powers and text (art and number aside). */
const face = (c: FaceCard) => {
  const d = c.data as CardData;
  return JSON.stringify([c.kind, c.hp, (d.attacks ?? []).map((a) => a.name), (d.abilities ?? []).map((a) => a.name), d.effect ?? null]);
};

const isFoil = (c: Pick<Card, 'id' | 'data'>) => isHolo(c) || isGalaxyFoil(c);

let twins: Promise<Map<string, string>> | null = null;

/**
 * Each holo with a non-holo version of the same card in its own set, and that version: Jungle's holo Clefable (base2-1)
 * and its plain one (base2-17). These holos are special additions: they count their copies, and gaining one unlocks
 * the plain one (agreed with the user). Holo-only cards aren't here: they're ordinary unlocks. Loaded once (the catalog
 * only changes with the seed).
 */
export function holoTwins(): Promise<Map<string, string>> {
  twins ??= (async () => {
    const rows = await prisma.card.findMany({ select: { id: true, setId: true, name: true, kind: true, hp: true, data: true } });
    const plain = new Map<string, string>();
    for (const r of rows) if (!isFoil(r) && !isBasicEnergyCard(r)) plain.set(`${r.setId}|${face(r)}|${r.name}`, plain.get(`${r.setId}|${face(r)}|${r.name}`) ?? r.id);
    const out = new Map<string, string>();
    for (const r of rows) {
      // A reverse holo's twin is the print it's made from (a holo rare's too).
      const twin = isReverseHolo(r) ? r.id.replace(/-reverse$/, '') : isFoil(r) && !holoEnergyStyle(r) ? plain.get(`${r.setId}|${face(r)}|${r.name}`) : undefined;
      if (twin) out.set(r.id, twin);
    }
    return out;
  })();
  twins.catch(() => (twins = null));
  return twins;
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

/**
 * Unlocks the cards, with the Base Set 2 cards that look the same as them (see base2Reprints) and the non-holo version
 * of a special holo (holoTwins); those already unlocked stay as they are. A special holo or a holo Energy adds a copy
 * each time it's in `cardIds`: twice there, two copies.
 */
export async function unlockCards(userId: string, cardIds: Iterable<string>, db: Db = prisma) {
  const gained = [...cardIds];
  const pairs = await holoTwins();
  const ids = new Set(gained);
  for (const id of gained) if (pairs.has(id)) ids.add(pairs.get(id)!);
  for (const id of await base2Reprints(ids, db)) ids.add(id);
  if (!ids.size) return;
  const rows = await db.card.findMany({ where: { id: { in: [...ids] } }, select: { id: true, data: true } });
  const counted = new Set(rows.filter((c) => pairs.has(c.id) || holoEnergyStyle(c)).map((c) => c.id));
  await db.cardUnlock.createMany({ data: [...ids].filter((id) => !counted.has(id)).map((cardId) => ({ userId, cardId, quantity: 1 })), skipDuplicates: true });
  const copies = gained.filter((id) => counted.has(id)).reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  for (const [cardId, n] of copies) {
    await db.cardUnlock.upsert({ where: { userId_cardId: { userId, cardId } }, create: { userId, cardId, quantity: n }, update: { quantity: { increment: n } } });
  }
}

/** Cards in a deck that aren't unlocked, by name, once each. Holo Energy counts (it isn't always unlocked like basic Energy). */
export function lockedNames(cards: { cardId: string; card: Pick<Card, 'name' | 'kind' | 'data'> }[], unlocked: Unlocked): string[] {
  const locked = cards.filter((c) => (!isBasicEnergyCard(c.card) || holoEnergyStyle(c.card)) && !unlocked.has(c.cardId));
  return [...new Set(locked.map((c) => cardLabel(c.card)))];
}

/**
 * The problem a deck has if it holds cards that aren't unlocked, or more copies than were gained of a holo Energy or a
 * special holo (`limited`: holoTwins, which has every special holo), or null.
 */
export function lockedProblem(
  cards: { cardId: string; quantity?: number; card: Pick<Card, 'name' | 'kind' | 'data'> }[],
  unlocked: Unlocked,
  limited: { has: (cardId: string) => boolean },
): string | null {
  const names = lockedNames(cards, unlocked);
  if (names.length) return `Not unlocked yet: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Win cards in runs to unlock them.`;
  const over = cards.find((c) => (holoEnergyStyle(c.card) || limited.has(c.cardId)) && (c.quantity ?? 1) > (unlocked.get(c.cardId) ?? 0));
  if (!over) return null;
  const label = holoEnergyStyle(over.card) ? cardLabel(over.card) : `${over.card.name} (holo)`;
  return `${label}: ${over.quantity} in the deck, but you've pulled ${unlocked.get(over.cardId) ?? 0}`;
}
