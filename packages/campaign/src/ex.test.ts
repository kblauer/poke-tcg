// The EX sets' cards checked against the TCGdex snapshot: every card of the sets whose effects are done
// (DONE) is implemented, as the game-engine's own tests can't read the snapshot, and their holos' galaxy foil.
import { existsSync, readFileSync } from 'node:fs';
import { cardImplemented } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { isGalaxyFoil, isHolo } from './card-fixes.js';
import { catalogDef } from './test-pool.js';

const rows: { id: string; name: string; category: string }[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;

/** The EX sets whose card effects are done. */
const DONE = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8', 'ex9', 'ex10', 'ex11', 'ex12', 'ex13', 'ex14', 'ex15', 'ex16'];

describe.each(DONE)('%s', (set) => {
  it('has every card implemented', () => {
    const cards = rows.filter((r) => r.id.startsWith(`${set}-`));
    expect(cards.length).toBeGreaterThan(90);
    expect(cards.filter((r) => !cardImplemented(catalogDef(r.id))).map((r) => `${r.id} ${r.name}`)).toEqual([]);
  });
});

// Their holo Pokémon are shown with the galaxy foil in the art window, as Gen 1's and Gen 2's (isGalaxyFoil), each with a
// mask keeping it off the Pokémon (tools/holo-masks); reverse holos and holo Trainers keep their own foil.
describe('EX holos', () => {
  const ex = rows.filter((r) => DONE.includes(r.id.split('-')[0]!)).map((r) => ({ ...r, data: r }));
  const holos = ex.filter((r) => r.category === 'Pokemon' && isHolo(r));

  it('are galaxy foil, each with its mask', () => {
    expect(holos.length).toBeGreaterThan(400);
    expect(holos.filter((r) => !isGalaxyFoil(r)).map((r) => r.id)).toEqual([]);
    const masks = new URL('../../../apps/web/public/holo-masks/', import.meta.url);
    expect(holos.filter((r) => !existsSync(new URL(`${r.id}.png`, masks))).map((r) => r.id)).toEqual([]);
  });

  it('leave reverse holos, Trainers and non-holos as they are', () => {
    expect(holos.some((r) => isGalaxyFoil({ id: `${r.id}-reverse`, data: r.data }))).toBe(false);
    expect(ex.filter((r) => isGalaxyFoil(r) && !holos.includes(r)).map((r) => r.id)).toEqual([]);
  });
});
