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

// Every other set of the snapshot but the e-Card sets (ecard.test.ts), whose effects are all done too (#204: only the
// e-Card and EX sets were checked, so an attack renamed in the snapshot could drop a Base Set card from the pool with
// no test failing). A set added to the snapshot is checked from the day it's fetched: until its effects are done, its
// cards go in NOT_DONE.
const OTHER_SETS = [...new Set(rows.map((r) => r.id.split('-')[0]!))].filter((set) => !DONE.includes(set) && !/^ecard/.test(set));

/** Cards knowingly not implemented, each with why; one that is implemented must come out. */
const NOT_DONE: Record<string, string> = {
  'bw10-41': "Sigilyph's Toolbox (several Pokémon Tools on one Pokémon): to do last, from the user's notes",
};

describe('every other set', () => {
  it('is all of Gen 1, Gen 2, Gen 4 and Gen 5', () => {
    expect(OTHER_SETS).toEqual(expect.arrayContaining(['base1', 'base2', 'base3', 'base4', 'base5', 'basep', 'gym1', 'gym2', 'lc', 'neo1', 'neo2', 'neo3', 'neo4', 'si1', 'dp1', 'pl1', 'hgss1', 'col1', 'bw1', 'bw11', 'dv1']));
  });

  it.each(OTHER_SETS)('%s has every card implemented', (set) => {
    const cards = rows.filter((r) => r.id.startsWith(`${set}-`) && !(r.id in NOT_DONE));
    expect(cards.length).toBeGreaterThan(10);
    expect(cards.filter((r) => !cardImplemented(catalogDef(r.id))).map((r) => `${r.id} ${r.name}`)).toEqual([]);
  });

  it('the cards listed as not done still are not', () => {
    expect(Object.keys(NOT_DONE).filter((id) => cardImplemented(catalogDef(id)))).toEqual([]);
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
