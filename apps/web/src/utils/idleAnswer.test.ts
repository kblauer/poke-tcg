import { rngFrom } from '@poke-tcg/campaign';
import { areas, createIdleRun, createMon, idleView, type IdleState } from '@poke-tcg/idle';
import { describe, expect, it } from 'vitest';
import { shownAfterAction } from './idleAnswer';

// The playback doesn't jump ahead (#204's test 10): an action's answer is the run after the segment playing.
const run = (state: IdleState) => ({ id: 'run', version: state.version, status: 'ACTIVE', simulatedAt: '', view: idleView(state) });
const base = createIdleRun({ species: 4 }, 3);
const second = { ...createMon(rngFrom(2), { species: 16, level: 4 }), uid: 'b' };
const route = areas().findIndex((a) => a.id === 'route-3');
const town = areas().findIndex((a) => a.id === 'pewter-city');
// On screen: walking Route 3, the segment playing; the server's: past its end, in Pewter City with a badge, more ₱, levels.
const shown = run({ ...base, area: route, phase: 'walking', party: [base.party[0]!, second] });
const after = (party: IdleState['party']) => run({ ...base, area: town, phase: 'town', money: base.money + 900, badges: ['Boulder'], log: [...base.log, 'Reached Pewter City.'], party, version: base.version + 3 });
const levelled = (m: IdleState['party'][number]) => ({ ...m, level: m.level + 5, exp: m.exp + 500 });

describe('shownAfterAction', () => {
  it('shows a party reorder at once, leaving the town, ₱, badges and levels for the segment\'s end', () => {
    const answer = after([levelled(second), levelled(base.party[0]!)]);
    const now = shownAfterAction(shown, answer, { type: 'SET_ORDER', uids: ['b', base.party[0]!.uid] }, true);
    expect(now.view.party.map((m) => m.uid)).toEqual(['b', base.party[0]!.uid]);
    expect(now.view.party.map((m) => m.level)).toEqual([second.level, base.party[0]!.level]);
    for (const k of ['phase', 'area', 'choosing', 'money', 'badges', 'log', 'bag'] as const) expect(now.view[k]).toEqual(shown.view[k]);
    expect([now.status, now.version]).toEqual([shown.status, shown.version]);
  });

  it("orders a Pokémon the segment's catch adds after the shown ones, and shows only that Pokémon's slots", () => {
    const caught = { ...createMon(rngFrom(3), { species: 19, level: 3 }), uid: 'c' };
    const order = shownAfterAction(shown, after([caught, second, base.party[0]!]), { type: 'SET_ORDER', uids: ['c', 'b', base.party[0]!.uid] }, true);
    expect(order.view.party.map((m) => m.uid)).toEqual(['b', base.party[0]!.uid]);
    const set = { ...levelled(second), slots: ['gust'], autoSlots: false };
    const slots = shownAfterAction(shown, after([base.party[0]!, set]), { type: 'SET_SLOTS', uid: 'b', slots: ['gust'] }, true);
    expect(slots.view.party[1]).toEqual({ ...second, slots: ['gust'], autoSlots: false });
    expect(slots.view.party[0]).toBe(shown.view.party[0]);
    expect(slots.view.phase).toBe('walking');
  });

  it('shows a stone used: the species and its moves, the stone gone, its level waiting', () => {
    const withStone = run({ ...base, area: route, phase: 'walking', party: [base.party[0]!, second], bag: { 'fire-stone': 1, 'poke-ball': 5 } });
    const evolved = { ...levelled(second), species: 17, moves: [...second.moves, 'whirlwind'] };
    const answer = run({ ...base, area: town, phase: 'town', party: [base.party[0]!, evolved], bag: { 'poke-ball': 2 } });
    const now = shownAfterAction(withStone, answer, { type: 'USE_STONE', uid: 'b', item: 'fire-stone' }, true);
    expect(now.view.party[1]).toMatchObject({ species: 17, moves: evolved.moves, level: second.level });
    expect(now.view.bag).toEqual({ 'poke-ball': 5 });
  });

  it('takes the whole answer with no segment playing, for a cut and for giving up; holds anything else till the end', () => {
    const answer = after([second, base.party[0]!]);
    expect(shownAfterAction(shown, answer, { type: 'SET_ORDER', uids: [] }, false)).toBe(answer);
    expect(shownAfterAction(shown, answer, { type: 'SET_MODE', mode: 'stop' }, true)).toBe(answer);
    expect(shownAfterAction(shown, answer, { type: 'TRAVEL', area: town }, true)).toBe(answer);
    expect(shownAfterAction(shown, answer, { type: 'GIVE_UP' }, true)).toBe(answer);
    expect(shownAfterAction(shown, answer, { type: 'CAUGHT_CHOICE' }, true)).toBe(shown);
  });
});
