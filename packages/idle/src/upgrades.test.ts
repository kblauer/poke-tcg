import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { areas, isTown, type TownArea, type WalkArea } from './areas.js';
import { opponentMon, simulateBattle, type BattleSetup } from './battle.js';
import { catchChance, ballTenths, bestBall } from './catch.js';
import { applyIdleAction, createIdleRun, DEFAULT_IDLE_SETTINGS, martPrice, simulateSegment, STEP_MS, storeStock, type IdleSettings, type IdleState, type SegmentEvent } from './idle.js';
import { createMon } from './mon.js';
import type { Mon, Stats } from './types.js';
import { activeUpgrades, randomStarters, sampleStarters, toggledLevel, amuletPrize, buyUpgrade, discounted, momShare, nextPrice, restShare, runEndMiles, shinyFactor, starterSlots, UPGRADE_TUNING, UPGRADES, walkSpeed, type IdleUpgrades } from './upgrades.js';

const MANUAL: IdleSettings = { ...DEFAULT_IDLE_SETTINGS, autoGrind: false };
const ZERO: Stats = [0, 0, 0, 0, 0, 0];
const mon = (id: number, level: number, uid: string): Mon => ({ ...createMon(rngFrom(1), { species: id, level, ivs: ZERO, evs: ZERO, nature: 0 }), uid });

describe('the upgrade tree (issue #270)', () => {
  it('sells each upgrade tier by tier, each tier unlocking the next, at its price', () => {
    for (const u of UPGRADES) expect(UPGRADE_TUNING.prices[u.id], u.id).toHaveLength(u.tiers.length);
    let owned: IdleUpgrades = {};
    expect(buyUpgrade(owned, 'discount', 99)).toEqual({ error: `Not enough ${UPGRADE_TUNING.currency}` });
    for (const price of UPGRADE_TUNING.prices.discount) {
      expect(nextPrice(owned, 'discount')).toBe(price);
      const r = buyUpgrade(owned, 'discount', 10_000);
      expect(r).toMatchObject({ price });
      owned = (r as { upgrades: IdleUpgrades }).upgrades;
    }
    expect(owned.discount).toBe(3);
    expect(buyUpgrade(owned, 'discount', 10_000)).toEqual({ error: 'Every tier is bought' });
  });

  it("uses a bought tier only while it's switched on, and switches it and those after it off with a click (the user's)", () => {
    const owned: IdleUpgrades = { discount: 3, shoes: 2 };
    expect(activeUpgrades(owned, {})).toEqual(owned);
    // Switched to 1: only the first tier works; never more than bought.
    expect(activeUpgrades(owned, { discount: 1, shoes: 3 })).toEqual({ discount: 1, shoes: 2 });
    expect(activeUpgrades(owned, { discount: 0 })).toEqual({ shoes: 2 });
    // A click on the 2nd tier (index 1) while it's on leaves the 1st on; on the 1st, nothing; on an off tier, on up to it.
    expect(toggledLevel({ discount: 3 }, 'discount', 1)).toBe(1);
    expect(toggledLevel({ discount: 1 }, 'discount', 0)).toBe(0);
    expect(toggledLevel({ discount: 1 }, 'discount', 2)).toBe(3);
  });

  it('offers three of the starters at random with Randomized starters', () => {
    expect([randomStarters({}), randomStarters({ randomStarters: 1 })]).toEqual([false, true]);
    const options = [1, 4, 7, 16, 19, 25, 133];
    for (let seed = 0; seed < 20; seed++) {
      let n = seed;
      const three = sampleStarters(options, 3, () => ((n = (n * 9301 + 49297) % 233280) / 233280));
      expect(three).toHaveLength(3);
      expect(new Set(three).size).toBe(3);
      expect(three.every((id) => options.includes(id))).toBe(true);
    }
    expect(sampleStarters([1, 4]).sort()).toEqual([1, 4]);
  });

  it("works out each upgrade's strength by its tier", () => {
    expect([restShare({}, 1), restShare({ expShare: 1 }, 1), restShare({ expShare: 1 }, 2), restShare({ expShare: 2 }, 5)]).toEqual([0.5, 0.75, 0.5, 0.75]);
    expect([starterSlots({}), starterSlots({ starters: 2 })]).toEqual([1, 3]);
    expect([walkSpeed({}), walkSpeed({ shoes: 1 }), walkSpeed({ shoes: 2 })]).toEqual([1, 1.1, 1.25]);
    expect([shinyFactor({ premier: 1 }), shinyFactor({ premier: 2 })]).toEqual([1, 3]);
    expect([discounted({}, 200), discounted({ discount: 1 }, 200), discounted({ discount: 3 }, 200)]).toEqual([200, 180, 100]);
    expect([amuletPrize({}, 1000), amuletPrize({ amuletCoin: 3 }, 1000)]).toEqual([1000, 1200]);
    expect([momShare({}, 5000), momShare({ mom: 1 }, 5000), momShare({ mom: 3 }, -10)]).toEqual([0, 500, 0]);
    expect(runEndMiles({ badges: ['a', 'b'], reached: 30, won: false })).toBe(2 * UPGRADE_TUNING.perBadge + 30 * UPGRADE_TUNING.perArea);
    expect(runEndMiles({ badges: [], reached: 0, won: true })).toBe(UPGRADE_TUNING.champion);
  });

  it('gives the party more EXP with EXP Share, EXP All and the Lucky Egg', () => {
    const gained = (upgrades: IdleUpgrades) => {
      const party = [mon(4, 40, 'lead'), mon(1, 10, 'second'), mon(7, 10, 'third')];
      const setup: BattleSetup = { kind: 'wild', party, foes: [opponentMon(mon(16, 5, 'foe'))], bag: {}, settings: { autoHeal: false, tryCatch: false, upgrades }, badges: 0, terrain: 'grass' };
      const out = simulateBattle(setup, rngFrom(1));
      const exp = (uid: string) => out.events.filter((e) => e.t === 'exp' && e.uid === uid).reduce((n, e) => n + (e as { gained: number }).gained, 0);
      return [exp('lead'), exp('second'), exp('third')];
    };
    const [lead, second, third] = gained({});
    expect(second).toBe(Math.floor(lead! / 2));
    expect(gained({ expShare: 1 })).toEqual([lead, Math.floor(lead! * 0.75), third]);
    expect(gained({ expShare: 2 })).toEqual([lead, Math.floor(lead! * 0.75), Math.floor(lead! * 0.75)]);
    expect(gained({ luckyEgg: 3 })[0]).toBeGreaterThan(lead!);
  });

  it('starts a run with every starter chosen and the money given', () => {
    const run = createIdleRun([{ species: 1 }, { species: 4 }, { species: 7 }], 3, 1, { money: 3500 });
    expect(run.party.map((m) => m.species)).toEqual([1, 4, 7]);
    expect(run.money).toBe(3500);
    expect(createIdleRun({ species: 1 }, 3).party).toHaveLength(1);
  });

  it('walks faster with the Running Shoes and the Bike, the steps carrying their time', () => {
    const walks = (upgrades: IdleUpgrades) => {
      const s: IdleState = { ...createIdleRun({ species: 4 }, 7), upgrades };
      const seg = simulateSegment(s, MANUAL, new Set())!.segment;
      return seg.events.filter((e): e is Extract<SegmentEvent, { t: 'walk' }> => e.t === 'walk');
    };
    expect(walks({})[0]!.ms).toBeUndefined();
    expect(walks({ shoes: 1 })[0]!.ms).toBe(Math.round(STEP_MS / 1.1));
    expect(walks({ shoes: 2 })[0]!.ms).toBe(Math.round(STEP_MS / 1.25));
  });

  it('sells the Premier Ball in every Mart, sure on a shiny, at the discounted prices', () => {
    const town = areas().find((a): a is TownArea => isTown(a) && a.marts.length > 0)!;
    const run = createIdleRun({ species: 4 }, 7);
    expect(storeStock(town, run)).not.toContain('premier-ball');
    expect(storeStock(town, { ...run, upgrades: { premier: 1 } })).toContain('premier-ball');
    // A Poké Ball, but sure on a shiny (Mewtwo's catch rate of 3, at full HP); the best ball for a shiny only.
    const situation = { types: [], level: 70, turn: 0 } as const;
    expect(ballTenths('premier-ball', situation)).toBe(10);
    expect(catchChance({ catchRate: 3, maxHp: 200, hp: 200, status: null, ball: 'premier-ball', tenths: ballTenths('premier-ball', { ...situation, shiny: true }) })).toBe(1);
    expect(bestBall({ 'ultra-ball': 5, 'premier-ball': 5 }, { ...situation, shiny: true }, true)).toBe('premier-ball');
    expect(bestBall({ 'ultra-ball': 5, 'premier-ball': 5 }, situation, true)).toBe('ultra-ball');
    expect([martPrice(run, 'poke-ball'), martPrice({ upgrades: { discount: 2 } }, 'poke-ball')]).toEqual([200, 150]);
  });

  it('finds items after won battles with Pickup, never without it', () => {
    // Viridian Forest's wild grind.
    const area = areas().findIndex((a) => a.id === 'route-2');
    const leg = (areas()[area] as WalkArea).legs[0]!;
    const forest = leg.maps.indexOf('ViridianForest');
    const step = leg.track.findIndex(([m, , , , t]) => m === forest && t[0] === 'l');
    const base = createIdleRun({ species: 4 }, 7);
    const start = (applyIdleAction({ ...base, area, step, reached: area, beaten: (areas()[area] as WalkArea).trainers.map((t) => t.key), party: [{ ...base.party[0]!, level: 30 }] }, { type: 'WILD_GRIND' }) as { state: IdleState }).state;
    const found = (upgrades: IdleUpgrades) => {
      let s: IdleState = { ...start, upgrades };
      const items: string[] = [];
      for (let i = 0; i < 60; i++) {
        const next = simulateSegment(s, { ...MANUAL, autoCatch: 'off' }, new Set())!;
        for (const e of next.segment.events) if (e.t === 'found') items.push(e.item);
        s = next.state;
      }
      return { items, bag: s.bag };
    };
    expect(found({}).items).toEqual([]);
    const picked = found({ itemfinder: 2 });
    expect(picked.items.length).toBeGreaterThan(0);
    // Each from the latest town reached's store.
    const town = areas().filter((a, i): a is TownArea => isTown(a) && i <= area && a.marts.length > 0).at(-1)!;
    const stock = storeStock(town, start);
    expect(picked.items.every((item) => stock.includes(item))).toBe(true);
  });
});
