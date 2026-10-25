// The catalog (the Card table) as the engine's card definitions. The conversion and TCGdex's fixes are the campaign's
// card-fixes.ts, shared with its test pool so the two can't drift apart; here is what needs the database.
import { catalogCardDef, evolvesFrom, type CardData } from '@poke-tcg/campaign';
import { type Card } from '@poke-tcg/db';
import { type CardDef, type CardLibrary, type PokemonCardDef } from '@poke-tcg/game-engine';
import { TRPCError } from '@trpc/server';
import { catalogCards, catalogInIdOrder, type CatalogRow } from './catalog.js';
import { pokedexLength } from './lengths.js';

export { catalogCards, catalogIndex, type CatalogRow } from './catalog.js';

export { baseDamage, isBasicEnergyCard, isGalaxyFoil, isHolo, isImplemented, type CardData, type HoloEnergyStyle } from '@poke-tcg/campaign';

/**
 * A holo Energy's style, or null for any other card. Holo Energy is basic Energy for the deck rules (no limit by name),
 * but it's only found in packs: locked until pulled, and a deck holds no more copies than were pulled.
 */
export const holoEnergyStyle = (card: Pick<Card, 'data'>) => (card.data as CardData).holoEnergy ?? null;

/**
 * A reverse-holo print (EX sets): a holo of its own, a special addition like the holos with a non-holo twin (holoTwins:
 * its copies count, and it unlocks the card's own print, agreed with the user).
 */
export const isReverseHolo = (card: Pick<Card, 'data'>) => (card.data as CardData).reverseHolo === true;

/** A card's name for messages: a holo Energy's says its style ("Fire Energy (Rainbow holo)"), a reverse holo says so. */
export const cardLabel = (card: Pick<Card, 'name' | 'data'>) => {
  const style = holoEnergyStyle(card);
  return style ? `${card.name} (${style.label} holo)` : isReverseHolo(card) ? `${card.name} (reverse holo)` : card.name;
};

/** Converts a catalog row into the engine's card definition (catalogCardDef), with the Pokédex length for Blaine's Quiz #1. */
export const toCardDef = (card: Card): CardDef => catalogCardDef(card, pokedexLength((card.data as CardData).dexId?.[0]));

let catalog: Promise<CatalogRow[]> | undefined;

/**
 * The whole catalog (about 6,100 rows with their data), in set release order then card number (catalog.ts loads it
 * once per instance, from the build's bundled copy where it's current): every deck builder visit and text import reads it.
 */
export function catalogRows(): Promise<CatalogRow[]> {
  catalog ??= catalogInIdOrder()
    .then((rows) =>
      [...rows].sort(
        (a, b) =>
          (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) ||
          a.set.name.localeCompare(b.set.name) ||
          a.localId.localeCompare(b.localId, undefined, { numeric: true }),
      ),
    );
  catalog.catch(() => (catalog = undefined));
  return catalog;
}

/** Loads the definitions for the given card ids from the catalog. */
export async function loadCardLibrary(ids: Iterable<string>): Promise<CardLibrary> {
  const unique = [...new Set(ids)];
  const rows = await catalogCards(unique);
  const missing = unique.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Cards not found in catalog: ${missing.join(', ')}` });
  const library: CardLibrary = Object.fromEntries(rows.map((r) => [r.id, toCardDef(r)]));
  // Pokémon Breeder needs the Basic at the bottom of each Stage 2 line: look up its Stage 1 by name.
  const stage2 = Object.values(library).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && d.stage === 'stage2' && d.evolvesFrom !== null);
  if (stage2.length) {
    const names = new Set(stage2.map((d) => d.evolvesFrom!));
    const stage1 = (await catalogInIdOrder()).filter((c) => c.kind === 'POKEMON' && c.stage === 'Stage1' && names.has(c.name));
    for (const d of stage2) {
      const line = stage1.find((s) => s.name === d.evolvesFrom && evolvesFrom(s));
      d.evolvesFromBasic = line ? evolvesFrom(line) : null;
    }
  }
  return library;
}
