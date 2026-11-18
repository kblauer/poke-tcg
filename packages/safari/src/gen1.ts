// Gen 1's draft units for this package's tests and the balance tool (tools/safari/balance.ts), built as the planning tool
// builds them: the campaign's test pool (the snapshot through the card fixes), the engine's reprint lists and the
// snapshot's Pokédex numbers. Not part of the package's index: it reads a file and loads the campaign's test pool. The
// API will build the same units from the catalog (issue #239's step 5).
import { readFileSync } from 'node:fs';
import { TEST_POOL } from '../../campaign/src/test-pool.js';
import { BASE4_REPRINTS, LC_REPRINTS, type PokemonCardDef } from '@poke-tcg/game-engine';
import { unitsFrom, type DerivedUnit } from './units.js';

let units: DerivedUnit[] | undefined;

export function gen1Units(): DerivedUnit[] {
  if (units) return units;
  const snapshot = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as { cards: { id: string; dexId?: number[] | null }[] };
  const dex = new Map(snapshot.cards.map((c) => [c.id, c.dexId ?? []]));
  const reprints = new Set([...Object.keys(BASE4_REPRINTS), ...Object.keys(LC_REPRINTS)]);
  const pokemon = TEST_POOL.map((c) => c.def).filter((d): d is PokemonCardDef => d.kind === 'pokemon');
  return (units = unitsFrom(pokemon, reprints, (id) => dex.get(id)));
}
