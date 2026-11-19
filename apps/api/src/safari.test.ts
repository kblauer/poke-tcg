// Safari Draft's server side (apps/api/src/safari.ts, routers/safari.ts): the units the API builds from the catalog are
// the safari package's own, the inputs are bounded, a won run banks once, and the response holds nothing the player
// shouldn't know yet (the package's view.test.ts plays whole runs for that; here the API's own wrapper).
import { readFileSync } from 'node:fs';
import { POOL_SETS } from '@poke-tcg/campaign';
import type { Card } from '@poke-tcg/db';
import { cardImplemented } from '@poke-tcg/game-engine';
import { applySafariAction, createSafari } from '@poke-tcg/safari';
import { safariActInput } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { toCatalog, type Row } from '../../../packages/campaign/src/test-pool.js';
import { gen1Units } from '../../../packages/safari/src/gen1.js';
import { toCardDef } from './cards.js';
import { clientSafari, safariStatus, toBank, unitsFromDefs, type LoadedSafari } from './safari.js';

const rows = (JSON.parse(readFileSync(new URL('../../../packages/db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as { cards: (Row & { dexId?: number[] | null })[] }).cards;

describe("Safari Draft's units on the server", () => {
  it('are the package\'s: Gen 1\'s pool through the API\'s card definitions and the catalog\'s Pokédex numbers', () => {
    // The API's cardPool(1), as loadPool builds it, from rows shaped as the seed writes them.
    const defs = rows
      .filter((r) => POOL_SETS.includes(r.id.split('-')[0]!))
      .flatMap((r) => {
        try {
          const def = toCardDef({ ...toCatalog(r), setId: r.id.split('-')[0]!, localId: r.localId ?? r.id.split('-')[1]! } as unknown as Card);
          return cardImplemented(def) ? [def] : [];
        } catch {
          return [];
        }
      });
    const dex = new Map(rows.map((r) => [r.id, r.dexId ?? []]));
    const fields = (u: { id: string; attack: number; hp: number; tier: number; keyword?: string }) => [u.id, u.attack, u.hp, u.tier, u.keyword];
    expect(unitsFromDefs(defs, (id) => dex.get(id)).map(fields)).toEqual(gen1Units().map(fields));
  });
});

describe("Safari Draft's inputs", () => {
  const act = (action: unknown) => safariActInput.safeParse({ runId: '00000000-0000-4000-8000-000000000000', expectedVersion: 3, action }).success;

  it('take every action the player has, bounded', () => {
    for (const action of [
      { type: 'PICK_STARTER', unit: 'base1-58' },
      { type: 'BUY', index: 4 },
      { type: 'SELL', place: { zone: 'inventory', at: 5 } },
      { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'inventory', at: 2 } },
      { type: 'REROLL' },
      { type: 'FREEZE' },
      { type: 'TIER_UP' },
      { type: 'PICK', unit: 'base1-24' },
      { type: 'SET_TRAINER', key: null },
      { type: 'CHOOSE', index: 2 },
      { type: 'BATTLE' },
      { type: 'ENCOUNTER', index: 1 },
      { type: 'TAKE', index: 6 },
      { type: 'LEAVE' },
      { type: 'CONCEDE' },
    ]) expect(act(action), action.type).toBe(true);
    for (const action of [
      { type: 'BUY', index: 16 },
      { type: 'BUY', index: -1 },
      { type: 'BUY', index: 1.5 },
      { type: 'SELL', place: { zone: 'deck', at: 0 } },
      { type: 'SELL', place: { zone: 'board', at: 6 } },
      { type: 'PICK', unit: '' },
      { type: 'PICK', unit: 'x'.repeat(65) },
      { type: 'SET_TRAINER', key: -1 },
      // The server's own actions are never the player's.
      { type: 'GIFT', unit: 'base1-4' },
      { type: 'FIGHT' },
    ]) expect(act(action), JSON.stringify(action)).toBe(false);
    expect(safariActInput.safeParse({ runId: 'not-a-uuid', expectedVersion: 0, action: { type: 'REROLL' } }).success).toBe(false);
    expect(safariActInput.safeParse({ runId: '00000000-0000-4000-8000-000000000000', expectedVersion: -1, action: { type: 'REROLL' } }).success).toBe(false);
  });
});

describe('a Safari Draft run on the server', () => {
  const units = gen1Units();
  const start = createSafari(7, units);

  it('banks a won run\'s ₱ once, and nothing for a run under way, lost or conceded', () => {
    expect(toBank(false, start)).toBe(0);
    expect(toBank(false, { ...start, phase: 'won', pokedollars: 3210 })).toBe(3210);
    expect(toBank(true, { ...start, phase: 'won', pokedollars: 3210 })).toBe(0);
    expect(toBank(false, { ...start, phase: 'lost', pokedollars: 900 })).toBe(0);
    expect([safariStatus(start), safariStatus({ ...start, phase: 'won' }), safariStatus({ ...start, phase: 'lost' })]).toEqual(['ACTIVE', 'WON', 'LOST']);
  });

  it('sends its view, never its state', () => {
    const picked = applySafariAction(start, { type: 'PICK_STARTER', unit: start.starters[0]! }, units);
    if (!picked.ok) throw new Error(picked.error);
    const run = { id: 'r', ownerId: 'o', status: 'ACTIVE', version: 1, seed: 7, banked: false, createdAt: new Date(), updatedAt: new Date(), state: picked.state } as LoadedSafari;
    const sent = clientSafari(run, units);
    expect(Object.keys(sent).sort()).toEqual(['banked', 'id', 'status', 'version', 'view']);
    const json = JSON.stringify(sent);
    for (const secret of ['rngState', 'encounterSteps', '"champion"', '"seed":7']) expect(json.includes(secret), secret).toBe(false);
    for (const o of picked.state.opponents) expect(json.includes(JSON.stringify(o.board))).toBe(false);
  });
});
