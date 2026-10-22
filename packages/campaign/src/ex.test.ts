// The EX sets' cards checked against the TCGdex snapshot: every card of the sets whose effects are done
// (DONE) is implemented, as the game-engine's own tests can't read the snapshot.
import { readFileSync } from 'node:fs';
import { cardImplemented } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { catalogDef } from './test-pool.js';

const rows: { id: string; name: string }[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;

/** The EX sets whose card effects are done. */
const DONE = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8', 'ex9', 'ex10', 'ex11', 'ex12', 'ex13'];

describe.each(DONE)('%s', (set) => {
  it('has every card implemented', () => {
    const cards = rows.filter((r) => r.id.startsWith(`${set}-`));
    expect(cards.length).toBeGreaterThan(90);
    expect(cards.filter((r) => !cardImplemented(catalogDef(r.id))).map((r) => `${r.id} ${r.name}`)).toEqual([]);
  });
});
