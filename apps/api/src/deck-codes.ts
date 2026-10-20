// Deck share codes: a deck's name and card list, compressed into one line to copy and paste ("PTCG1." and base64url
// of the deflated JSON). Codes and community decks hold the non-holo version of a card that has one (a special holo's
// twin, a holo Energy's basic Energy), so a list doesn't depend on which holos its author pulled; importing one puts
// back as many of the importer's own holos as they have (agreed with the user).
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DECK_NAME_LENGTH, DECK_SIZE } from '@poke-tcg/shared';
import { z } from 'zod';
import type { Unlocked } from './unlocks.js';

export interface DeckList {
  name: string;
  cards: { cardId: string; quantity: number }[];
}

/** The code format's version, the start of every code. */
const PREFIX = 'PTCG1.';

/** What a code holds: `n` the name, `c` [card id, copies] pairs. */
const payload = z.object({
  n: z.string().max(200),
  c: z.array(z.tuple([z.string().min(1).max(64), z.number().int().min(1).max(DECK_SIZE)])).max(DECK_SIZE),
});

/** The deck as a share code. */
export const encodeDeck = (deck: DeckList) =>
  PREFIX + deflateRawSync(Buffer.from(JSON.stringify({ n: deck.name, c: deck.cards.map((c) => [c.cardId, c.quantity]) }))).toString('base64url');

/** The deck a share code holds, or null if it isn't one (spaces and line breaks from pasting are ignored). */
export function decodeDeck(code: string): DeckList | null {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) return null;
  try {
    const json = inflateRawSync(Buffer.from(text.slice(PREFIX.length), 'base64url'), { maxOutputLength: 64 * 1024 }).toString();
    const parsed = payload.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return { name: parsed.data.n.trim().slice(0, DECK_NAME_LENGTH).trimEnd(), cards: parsed.data.c.map(([cardId, quantity]) => ({ cardId, quantity })) };
  } catch {
    return null;
  }
}

/** A holo Energy's id: its basic Energy's, then its style (made by the seed, packages/db/prisma/holo-energy.ts). */
const HOLO_ENERGY = /-holo-[a-z-]+$/;

/** The card's non-holo version: a special holo's twin (holoTwins), a holo Energy's basic Energy, or the card itself. */
export const plainVersion = (cardId: string, twins: Map<string, string>) => twins.get(cardId) ?? cardId.replace(HOLO_ENERGY, '');

/** Adds the copies to the list, merging them into the card's entry if it has one. */
function add(cards: DeckList['cards'], cardId: string, quantity: number) {
  const entry = cards.find((c) => c.cardId === cardId);
  if (entry) entry.quantity += quantity;
  else cards.push({ cardId, quantity });
}

/** The cards with their holos as non-holo versions (see plainVersion), for a share code or a community deck. */
export function plainCards(cards: DeckList['cards'], twins: Map<string, string>): DeckList['cards'] {
  const out: DeckList['cards'] = [];
  for (const c of cards) add(out, plainVersion(c.cardId, twins), c.quantity);
  return out;
}

/**
 * The cards with as many as possible of their copies as the importer's own holo versions (`unlocked`: the copies they
 * have of each special holo and holo Energy), the most-pulled first; the rest stay non-holo.
 */
export function withOwnHolos(cards: DeckList['cards'], unlocked: Unlocked, twins: Map<string, string>): DeckList['cards'] {
  const holosOf = new Map<string, string[]>();
  for (const [holo, plain] of twins) if (unlocked.has(holo)) holosOf.set(plain, [...(holosOf.get(plain) ?? []), holo]);
  for (const id of unlocked.keys()) if (HOLO_ENERGY.test(id)) holosOf.set(plainVersion(id, twins), [...(holosOf.get(plainVersion(id, twins)) ?? []), id]);
  const out: DeckList['cards'] = [];
  for (const c of plainCards(cards, twins)) {
    let left = c.quantity;
    const holos = (holosOf.get(c.cardId) ?? []).sort((a, b) => (unlocked.get(b) ?? 0) - (unlocked.get(a) ?? 0) || a.localeCompare(b));
    for (const holo of holos) {
      const n = Math.min(left, unlocked.get(holo) ?? 0);
      if (n > 0) add(out, holo, n);
      left -= n;
    }
    if (left > 0) add(out, c.cardId, left);
  }
  return out;
}
