import { describe, expect, it } from 'vitest';
import { AREAS } from './areas.js';
import { applyIdleAction, createIdleRun, type IdleState } from './idle.js';
import { canLearnMachine, HM_PRICE, machineMove, machinePrice, slotMoves, TM_GROUPS, TM_MOVES, tmGroupStock } from './tms.js';

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

  it('splits the 50 TMs into 4 groups by their first letter, each once, and the 8 HMs', () => {
    const tms = TM_GROUPS.filter((g) => !g.hm).flatMap((g) => tmGroupStock(g.id));
    expect(tms).toHaveLength(50);
    expect(new Set(tms).size).toBe(50);
    expect(tmGroupStock('hm')).toEqual(['hm01', 'hm02', 'hm03', 'hm04', 'hm05', 'hm06', 'hm07', 'hm08']);
    for (const g of TM_GROUPS) expect(tmGroupStock(g.id).length, g.id).toBeGreaterThan(0);
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
