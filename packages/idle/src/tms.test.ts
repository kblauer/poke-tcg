import { describe, expect, it } from 'vitest';
import { AREAS } from './areas.js';
import { applyIdleAction, createIdleRun, type IdleState } from './idle.js';
import { canLearnMachine, HM_PRICE, MACHINES, machineMove, machinePrice, slotMoves, TM_MOVES } from './tms.js';

const index = (id: string) => AREAS.findIndex((a) => a.id === id);

/** A run in a town's store, having reached `reached`, with plenty of money. */
function inStore(town: string, reached: string, species = 4): IdleState {
  const base = createIdleRun({ species }, 3);
  return { ...base, area: index(town), phase: 'town', inStore: true, reached: index(reached), money: 100000 };
}

describe('TMs and HMs', () => {
  it("knows FireRed's machines: TM01 Focus Punch to HM08 Dive, and who learns them", () => {
    expect(Object.keys(TM_MOVES)).toHaveLength(58);
    expect(machineMove('tm01')).toBe('focus-punch');
    expect(machineMove('hm08')).toBe('dive');
    expect(canLearnMachine(1, 'tm22')).toBe(true); // Bulbasaur, Solar Beam
    expect(canLearnMachine(4, 'tm22')).toBe(false); // Charmander
    expect(canLearnMachine(132, 'tm06')).toBe(false); // Ditto learns none
    expect(machinePrice('tm01')).toBe(3000);
    expect(machinePrice('hm01')).toBe(HM_PRICE);
  });

  it('sells every TM and HM in one list, TM01 to TM50 then HM01 to HM08', () => {
    expect(MACHINES).toHaveLength(58);
    expect(MACHINES.slice(0, 3)).toEqual(['tm01', 'tm02', 'tm03']);
    expect(MACHINES[49]).toBe('tm50');
    expect(MACHINES.slice(50)).toEqual(['hm01', 'hm02', 'hm03', 'hm04', 'hm05', 'hm06', 'hm07', 'hm08']);
  });

  it('sells them in every store once the run has reached Celadon City, one of each', () => {
    // Not before Celadon City.
    expect(applyIdleAction(inStore('pewter-city', 'lavender-town'), { type: 'BUY', item: 'tm28', count: 1 }).ok).toBe(false);
    // Then in any store, Pewter City's too.
    const s = inStore('pewter-city', 'celadon-city');
    const r = applyIdleAction(s, { type: 'BUY', item: 'hm03', count: 1 });
    expect(r.ok).toBe(true);
    const bought = (r as { state: IdleState }).state;
    expect(bought.bag.hm03).toBe(1);
    expect(bought.money).toBe(s.money - HM_PRICE);
    expect(applyIdleAction(bought, { type: 'BUY', item: 'hm03', count: 1 }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'BUY', item: 'tm28', count: 2 }).ok).toBe(false);
    // Only in the store.
    expect(applyIdleAction({ ...s, inStore: undefined }, { type: 'BUY', item: 'tm28', count: 1 }).ok).toBe(false);
  });

  it('takes owned machines\' moves in the automatic pick too: at once when bought, and whenever it picks again', () => {
    const s = inStore('celadon-city', 'celadon-city', 7); // Squirtle, on the automatic pick
    expect(s.party[0]!.autoSlots).toBe(true);
    const owned = (applyIdleAction(s, { type: 'BUY', item: 'hm03', count: 1 }) as { state: IdleState }).state;
    expect(owned.party[0]!.slots).toContain('surf');
    // Picked again (Pick the 3 strongest after slots set by hand).
    const manual = (applyIdleAction(owned, { type: 'SET_SLOTS', uid: owned.party[0]!.uid, slots: [] }) as { state: IdleState }).state;
    const auto = applyIdleAction(manual, { type: 'SET_SLOTS', uid: owned.party[0]!.uid, slots: [], auto: true });
    expect(auto.ok && auto.state.party[0]!.slots).toContain('surf');
    // Never a move its species can't learn.
    const fire = (applyIdleAction(inStore('celadon-city', 'celadon-city', 4), { type: 'BUY', item: 'hm03', count: 1 }) as { state: IdleState }).state;
    expect(fire.party[0]!.slots).not.toContain('surf');
  });

  it("puts an owned machine's move in the slots of a Pokémon that can learn it, never one that can't", () => {
    const s = inStore('celadon-city', 'celadon-city', 7); // Squirtle
    const squirtle = s.party[0]!;
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: squirtle.uid, slots: ['surf'] }).ok).toBe(false);
    const owned = (applyIdleAction(s, { type: 'BUY', item: 'hm03', count: 1 }) as { state: IdleState }).state;
    expect(slotMoves(squirtle, owned.bag)).toContain('surf');
    const set = applyIdleAction(owned, { type: 'SET_SLOTS', uid: squirtle.uid, slots: ['surf'] });
    expect(set.ok && set.state.party[0]!.slots).toEqual(['surf']);
    // Charmander can't learn Surf.
    const fire = inStore('celadon-city', 'celadon-city', 4);
    const withSurf = { ...fire, bag: { ...fire.bag, hm03: 1 } };
    expect(slotMoves(fire.party[0]!, withSurf.bag)).not.toContain('surf');
    expect(applyIdleAction(withSurf, { type: 'SET_SLOTS', uid: fire.party[0]!.uid, slots: ['surf'] }).ok).toBe(false);
  });
});
