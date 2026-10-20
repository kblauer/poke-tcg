// The e-Card sets' cards checked against the TCGdex snapshot: every card the engine plays fully, except the ones waiting on
// a question asked on the PR (as the game-engine's own tests can't read the snapshot).
import { readFileSync } from 'node:fs';
import { cardImplemented } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { catalogDef, GEN2_TEST_POOL } from './test-pool.js';

const rows: { id: string; name: string }[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;

/** Cards not implemented yet, by set: each waits on a question on the PR. */
const WAITING: Record<string, string[]> = {
  // Bill's Maintenance: can it be played with no other cards in the hand?
  ecard1: ['ecard1-137'],
};

describe.each(Object.keys(WAITING))('%s', (set) => {
  const cards = rows.filter((r) => r.id.startsWith(`${set}-`));

  it('has every card implemented but the ones waiting on a question', () => {
    expect(cards.filter((r) => !cardImplemented(catalogDef(r.id))).map((r) => `${r.id} ${r.name}`)).toEqual(WAITING[set]!.map((id) => `${id} ${cards.find((r) => r.id === id)!.name}`));
  });

  it('is in the Gen 2 run pool, but for those', () => {
    const pooled = new Set(GEN2_TEST_POOL.map((c) => c.def.id));
    expect(cards.filter((r) => !pooled.has(r.id)).map((r) => r.id)).toEqual(WAITING[set]);
  });
});
