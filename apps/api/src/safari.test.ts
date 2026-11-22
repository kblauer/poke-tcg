// Safari Draft's server side (apps/api/src/safari.ts, routers/safari.ts): the units are the safari package's own with a
// picture each from the catalog, the inputs are bounded, a won run banks once, a run of older rules is never played on,
// and the response holds nothing the player shouldn't know yet (the package's view.test.ts plays whole runs for that;
// here the API's own wrapper).
import { RULES, allUnits, applySafariAction, createSafari } from '@poke-tcg/safari';
import { safariActInput } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { clientSafari, currentRules, safariStatus, toBank, unitPictures, unitsWithPictures, type LoadedSafari } from './safari.js';

describe("Safari Draft's units on the server", () => {
  const row = (id: string, name: string, dexId: number[] | null, extra: object = {}) => ({ id, setId: id.split('-')[0]!, name, kind: 'POKEMON' as const, imageUrl: 'https://example.test/card', data: { dexId }, ...extra });
  const rows = [
    row('ex6-113', 'Charmander', [4]),
    row('base5-50', 'Charmander', [4]),
    row('base1-46', 'Charmander', [4]),
    row('gym1-61', "Blaine's Charmander", [4]),
    row('base1-46-reverse', 'Charmander', [4]),
    row('base5-32', 'Dark Charmeleon', [5]),
    row('ex6-31', 'Charmeleon', [5]),
    row('base1-4', 'Charizard', [6], { imageUrl: null }),
    row('ex3-100', 'Charizard', [6]),
    row('dp1-1', 'Bulbasaur', [1]),
    row('neo1-99', 'Two Pokémon', [2, 3]),
    row('base3-33', 'Nidoran ♀', [29]),
    row('base1-91', 'Bill', null, { kind: 'TRAINER' as const }),
  ];

  it("are the package's, one a Pokémon, each with a print of it for its picture", () => {
    const pictures = unitPictures(rows, allUnits());
    // The plain name first, then the earliest set: Base Set's Charmander, not Team Rocket's, the owner's or a reverse print.
    expect(pictures.get(4)).toBe('base1-46');
    // A plain-named print of a later set before a Dark one of an earlier.
    expect(pictures.get(5)).toBe('ex6-31');
    // No image, no picture; a set outside Gen 1–3, a card of two Pokémon and a Trainer card are never one.
    expect(pictures.get(6)).toBe('ex3-100');
    expect([pictures.get(1), pictures.get(2), pictures.get(3)]).toEqual([undefined, undefined, undefined]);
    expect(pictures.get(29)).toBe('base3-33');
    const units = unitsWithPictures(rows);
    expect(units.map((u) => [u.id, u.attack, u.hp, u.tier, u.abilities])).toEqual(allUnits().map((u) => [u.id, u.attack, u.hp, u.tier, u.abilities]));
    expect(units.find((u) => u.name === 'Charmeleon')).toMatchObject({ card: 'ex6-31', fromCard: 'base1-46' });
    expect(units.find((u) => u.name === 'Bulbasaur')!.card).toBeUndefined();
  });
});

describe("Safari Draft's inputs", () => {
  const act = (action: unknown) => safariActInput.safeParse({ runId: '00000000-0000-4000-8000-000000000000', expectedVersion: 3, action }).success;

  it('take every action the player has, bounded', () => {
    for (const action of [
      { type: 'PICK_STARTER', unit: '58' },
      { type: 'BUY', index: 4 },
      { type: 'SELL', place: { zone: 'inventory', at: 5 } },
      { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'inventory', at: 2 } },
      { type: 'REROLL' },
      { type: 'FREEZE' },
      { type: 'TIER_UP' },
      { type: 'PICK', unit: '5' },
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
      { type: 'GIFT', unit: '6' },
      { type: 'FIGHT' },
    ]) expect(act(action), JSON.stringify(action)).toBe(false);
    expect(safariActInput.safeParse({ runId: 'not-a-uuid', expectedVersion: 0, action: { type: 'REROLL' } }).success).toBe(false);
    expect(safariActInput.safeParse({ runId: '00000000-0000-4000-8000-000000000000', expectedVersion: -1, action: { type: 'REROLL' } }).success).toBe(false);
  });
});

describe('a Safari Draft run on the server', () => {
  const units = allUnits();
  const start = createSafari(7, units);

  it('banks a won run\'s ₱ once, and nothing for a run under way, lost or conceded', () => {
    expect(toBank(false, start)).toBe(0);
    expect(toBank(false, { ...start, phase: 'won', pokedollars: 3210 })).toBe(3210);
    expect(toBank(true, { ...start, phase: 'won', pokedollars: 3210 })).toBe(0);
    expect(toBank(false, { ...start, phase: 'lost', pokedollars: 900 })).toBe(0);
    expect([safariStatus(start), safariStatus({ ...start, phase: 'won' }), safariStatus({ ...start, phase: 'lost' })]).toEqual(['ACTIVE', 'WON', 'LOST']);
  });

  it('knows a run of older rules, whose units no longer exist', () => {
    expect(start.rules).toBe(RULES);
    expect(currentRules(start)).toBe(true);
    // A run saved before the rules had a number has none.
    expect(currentRules({} as { rules: number })).toBe(false);
    expect(currentRules({ rules: RULES - 1 })).toBe(false);
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
