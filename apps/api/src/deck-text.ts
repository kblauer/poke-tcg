// Deck lists as text, the way decklist sites and the online game write them: a line per card, "<copies> <name> <set
// code> <number>" ("4 Lickitung JU 38"), under optional section headers ("Pokémon: 15"). The set code and number are
// optional ("4 Lickitung" takes the earliest print of the name). Imported like a share code (decks.importCode).
import { DECK_SIZE } from '@poke-tcg/shared';
import { catalogRows } from './cards.js';
import type { DeckList } from './deck-codes.js';

/** Set codes used by decklist sites (Limitless, the online game) and our own TCGdex ids, by TCGdex set id. */
const SET_CODES: Record<string, string[]> = {
  base1: ['BS', 'BS1', 'BASE'],
  base2: ['JU', 'JUN'],
  base3: ['FO', 'FOS'],
  base4: ['BS2', 'B2'],
  base5: ['TR', 'RO'],
  basep: ['WP', 'PR', 'PROMO', 'WBSP'],
  gym1: ['G1', 'GH'],
  gym2: ['G2', 'GC'],
  neo1: ['N1', 'NG'],
  neo2: ['N2'],
  si1: ['SI'],
  neo3: ['N3', 'NR'],
  neo4: ['N4'],
  lc: ['LC'],
  ecard1: ['EX', 'EXP'],
  ecard2: ['AQ'],
  ecard3: ['SK'],
};

/** A set code (any case) to its TCGdex set id. */
const SET_IDS = new Map(Object.entries(SET_CODES).flatMap(([id, codes]) => [id, ...codes].map((code) => [code.toUpperCase(), id] as const)));

/** One card line: copies, name, and the set and number when given. */
export interface DeckTextLine {
  line: string;
  quantity: number;
  name: string;
  setId?: string;
  number?: string;
}

/** "4 Lickitung JU 38", "4x Lickitung", "* 4 Lickitung JU 38" (the online game's export). */
const CARD_LINE = /^\*?\s*(\d{1,2})x?\s+(.+?)\s*$/i;
/** A set code and number at the end of a card's name ("JU 38", "AQ H1"). */
const SET_AND_NUMBER = /^(.+?)\s+([A-Za-z][A-Za-z0-9]{0,4})\s+([A-Za-z]{0,2}\d{1,3}[a-z]?)$/;

/**
 * The card lines of a text deck list, or null if it isn't one. Headers ("Pokémon: 15", "Total Cards: 60") and blank
 * lines are skipped; any other line that isn't a card is an error, given as the line.
 */
export function parseDeckText(text: string): { lines: DeckTextLine[] } | { error: string } | null {
  const lines: DeckTextLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[^\d*].*:\s*\d*$/.test(line) || line.startsWith('#')) continue;
    const card = CARD_LINE.exec(line);
    if (!card) return lines.length ? { error: `Not a card line: "${line}"` } : null;
    const [, copies = '', name = ''] = card;
    const quantity = Number(copies);
    if (quantity < 1 || quantity > DECK_SIZE) return { error: `Not a card line: "${line}"` };
    const [, setName = '', code = '', number = ''] = SET_AND_NUMBER.exec(name) ?? [];
    const setId = SET_IDS.get(code.toUpperCase());
    lines.push(setId ? { line, quantity, name: setName, setId, number: number.toUpperCase() } : { line, quantity, name });
  }
  return lines.length ? { lines } : null;
}

/** A card name to compare by: no accents, case, punctuation or spaces ("Pokémon Center" = "pokemoncenter"). */
const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** A card number to compare by: no leading zeros ("038" = "38"). */
const numberKey = (number: string) => number.toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1');

/**
 * The deck a text list holds, its lines matched to the catalog: by set and number when the name there matches, otherwise
 * by name in that set, otherwise (no set given) the name's earliest print. `missing` lists the lines that match no card.
 */
export async function resolveDeckText(lines: DeckTextLine[]): Promise<{ deck: DeckList; missing: string[] }> {
  const keys = new Set(lines.map((l) => nameKey(l.name)));
  // The catalog as loaded once for the deck builder (catalogRows), not a query of every card per import.
  const rows = (await catalogRows())
    .filter((r) => keys.has(nameKey(r.name)))
    .sort((a, b) => (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) || Number.parseInt(a.localId) - Number.parseInt(b.localId) || a.id.localeCompare(b.id));
  const cards: DeckList['cards'] = [];
  const missing: string[] = [];
  for (const l of lines) {
    const named = rows.filter((r) => nameKey(r.name) === nameKey(l.name));
    const inSet = l.setId ? named.filter((r) => r.setId === l.setId) : named;
    const card = inSet.find((r) => l.number && numberKey(r.localId) === numberKey(l.number)) ?? inSet[0];
    if (!card) {
      missing.push(l.line);
      continue;
    }
    const entry = cards.find((c) => c.cardId === card.id);
    if (entry) entry.quantity += l.quantity;
    else cards.push({ cardId: card.id, quantity: l.quantity });
  }
  return { deck: { name: '', cards }, missing };
}
