import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { areas, badgeList, isTown, mapView, type TownArea, type WalkArea } from './areas.js';
import { HOENN_COLLISION } from './data/gen3/collision.js';
import { generation, inGeneration } from './generation.js';
import { createIdleRun, storeStock, weatherAt, type IdleState } from './idle.js';

// Hoenn's areas (data/gen3/, tools/idle/hoenn_areas.py over Emerald's maps; issue #226, step 4): every step walkable on
// the game's collision (collision.ts) and every trainer's sight line crossed, as Johto's (areas.test.ts); each gym's
// leader, each town's store and grind, the League in order; the weather where Emerald's scripts give it.
const hoenn = inGeneration(3, () => ({ areas: areas(), walks: areas().filter((a): a is WalkArea => !isTown(a)), trainers: generation().trainers, encounters: generation().encounters, maps: generation().maps, marts: generation().marts, badges: badgeList() }));
const at = (list: [number, number][], x: number, y: number) => list.some(([px, py]) => px === x && py === y);
const LEDGE_WAY: Record<string, [number, number]> = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], v: [0, 1] };
const PUBLIC = new URL('../../../apps/web/public/', import.meta.url);

describe('the Hoenn areas', () => {
  it("go from Littleroot Town to Wallace in the game's order, each gym's leader last, the League's rooms in order", () => {
    expect(hoenn.areas[0]!.id).toBe('route-101');
    expect(hoenn.badges).toEqual(['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance', 'Feather', 'Mind', 'Rain']);
    const gyms = hoenn.walks.filter((a) => a.kind === 'gym');
    expect(gyms.map((a) => a.leader)).toEqual(['roxanne-1', 'brawly-1', 'wattson-1', 'flannery-1', 'norman-1', 'winona-1', 'tate-and-liza-1', 'juan-1']);
    for (const a of hoenn.walks.filter((x) => x.kind === 'gym' || x.kind === 'league')) expect(a.trainers.at(-1)!.key, a.id).toBe(a.leader);
    const league = hoenn.areas.slice(hoenn.areas.findIndex((a) => a.id === 'ever-grande-city'));
    expect(league.map((a) => a.id)).toEqual(['ever-grande-city', 'sidney', 'phoebe', 'glacia', 'drake', 'wallace']);
    expect(league.slice(1).map((a) => (a as WalkArea).leader)).toEqual(['sidney', 'phoebe', 'glacia', 'drake', 'wallace']);
    // The places generation.ts names: the League's town, the TM shop's, the rods'.
    inGeneration(3, () => {
      const g = generation();
      for (const id of [g.league.town, g.tmShop, g.champion, ...g.rods.map((r) => r.town)]) expect(hoenn.areas.some((a) => a.id === id), id).toBe(true);
    });
  });

  it('give every town a store (but Dewford Town, which has none) and each gym town a grind loop', () => {
    for (const t of hoenn.areas.filter(isTown)) {
      if (t.id === 'dewford-town') {
        expect(t.marts).toEqual([]);
        expect(t.mart).toBeUndefined();
      } else {
        expect(t.marts.length, t.id).toBeGreaterThan(0);
        for (const m of [...t.marts, ...(t.expanded?.marts ?? [])]) expect(hoenn.marts[m], `${t.id}: ${m}`).toBeDefined();
        const m = t.mart!;
        expect(hoenn.maps[m.map], t.id).toBeDefined();
        // Across the counter (Lilycove's Department Store's clerks are its women behind it).
        const clerk = m.people.find((p) => Math.abs(p.x - m.x) + Math.abs(p.y - m.y) === 2 && (p.x === m.x || p.y === m.y));
        expect(clerk, t.id).toBeDefined();
      }
      if (t.gym && t.gym !== 'sidney') {
        expect(t.grind, t.id).toBeDefined();
        expect(new Set(t.grind!.loop.map((s) => s[4])).size, t.id).toBe(1);
      }
    }
  });

  it("sell Lilycove's stones, and Petalburg's and Rustboro's more from their badge on (Emerald's expanded marts)", () => {
    inGeneration(3, () => {
      const town = (id: string) => hoenn.areas.find((a) => a.id === id) as TownArea;
      const state = (badges: number): Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'> => ({ reached: 0, area: 0, badges: hoenn.badges.slice(0, badges) });
      expect(storeStock(town('lilycove-city'), state(6))).toEqual(expect.arrayContaining(['fire-stone', 'thunder-stone', 'water-stone', 'leaf-stone', 'moon-stone', 'sun-stone']));
      expect(storeStock(town('rustboro-city'), state(0))).not.toContain('repeat-ball');
      expect(storeStock(town('rustboro-city'), state(1))).toContain('repeat-ball');
      expect(storeStock(town('petalburg-city'), state(3))).not.toContain('great-ball');
      expect(storeStock(town('petalburg-city-gym'), state(4))).toContain('great-ball');
      expect(storeStock(town('oldale-town'), state(0))).toContain('poke-ball');
    });
  });

  it('walk tracks one tile at a time (but for fades and ledge jumps)', () => {
    for (const a of hoenn.walks) {
      for (const leg of a.legs) {
        for (let i = 1; i < leg.track.length; i++) {
          const [pm, px, py] = leg.track[i - 1]!;
          const [m, x, y, flags] = leg.track[i]!;
          if (flags & 1) continue;
          expect(m, `${a.id} step ${i}`).toBe(pm);
          expect(Math.abs(x - px) + Math.abs(y - py), `${a.id} step ${i}`).toBe(flags & 2 ? 2 : 1);
          if (flags & 2) {
            // Over a ledge the way it's jumped, from the tile before it to the one after.
            const way = LEDGE_WAY[HOENN_COLLISION[leg.maps[m]!]!.rows[(y + py) / 2]![(x + px) / 2]!];
            expect(way, `${a.id} step ${i}: a ledge`).toEqual([(x - px) / 2, (y - py) / 2]);
          }
        }
      }
    }
  });

  it("stand every step on a walkable tile of the game's collision, water only where the leg surfs, never on someone not yet beaten", () => {
    for (const a of hoenn.walks) {
      a.legs.forEach((leg, li) => {
        // (Surfing as the page draws it: the water's terrain, AreaScene's; the boat trips' tiles have no wild Pokémon.)
        const surfs = leg.track.some(([, , , , tile]) => tile[0] === 'w' || tile[1] === 'w' || tile[1] === 'p');
        const met = new Set<string>();
        leg.track.forEach(([m, x, y, , tile], i) => {
          const c = HOENN_COLLISION[leg.maps[m]!]!;
          const where = `${a.id} ${leg.maps[m]} step ${i} (${x}, ${y})`;
          const ch = c.rows[y]![x]!;
          const fixed = at(c.fixed, x, y);
          expect(ch === '.' || (ch === '~' && (surfs || fixed)) || at(c.warps, x, y) || fixed, `${where}: '${ch}'`).toBe(true);
          if (tile[0] === 'w') expect(ch, where).toBe('~');
          for (const t of a.trainers.filter((t) => t.leg === li && t.map === m && t.sight.some(([sx, sy]) => sx === x && sy === y))) met.add(t.key);
          // Mossdeep Gym's Psychic Blake stands in the only way on to its leaders: walked past once beaten.
          const there = a.trainers.find((t) => t.leg === li && t.map === m && t.x === x && t.y === y);
          if (there) expect(met.has(there.key), `${where}: ${there.key} is there`).toBe(true);
          else expect(at(c.people, x, y), `${where}: someone's there`).toBe(false);
        });
      });
    }
  });

  it("cross every trainer's sight line, and face the tile where the player meets them", () => {
    for (const a of hoenn.walks) {
      a.legs.forEach((leg, li) => {
        const trainers = a.trainers.filter((t) => t.leg === li);
        const met = new Set<string>();
        for (const [m, x, y] of leg.track) {
          for (const t of trainers.filter((t) => !met.has(t.key) && t.map === m && t.sight.some(([sx, sy]) => sx === x && sy === y))) {
            met.add(t.key);
            const dx = x - t.x;
            const dy = y - t.y;
            const face = dx && Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
            expect(t.face, `${a.id}: ${t.key}`).toBe(face);
          }
        }
        for (const t of trainers) expect(met.has(t.key), `${a.id}: ${t.key}'s sight line`).toBe(true);
      });
    }
  });

  it('meet each trainer once a run, leaving out the rival, Wally, Team Aqua and Team Magma', () => {
    const keys = hoenn.walks.flatMap((a) => a.trainers.map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => /^(grunt-|brendan-|may-|wally-|archie|maxie|shelly|tabitha|courtney)/.test(k))).toEqual([]);
    // The way back from Lavaridge to Petalburg and on to Mauville walks cleared ground: no one there but Route 116's and Rusturf Tunnel's.
    expect(hoenn.walks.find((a) => a.id === 'route-104-north')!.trainers).toEqual([]);
  });

  it('only use known maps, trainers, wild tables and sprites', () => {
    for (const a of hoenn.walks) {
      for (const t of a.trainers) {
        expect(hoenn.trainers[t.key], `${a.id}: ${t.key}`).toBeDefined();
        expect(existsSync(new URL(`overworld/${t.sprite}.png`, PUBLIC)), `${a.id}: ${t.sprite}`).toBe(true);
      }
      for (const leg of a.legs) {
        for (const [m, , , , tile] of leg.track) {
          const map = hoenn.maps[leg.maps[m]!]!;
          expect(HOENN_COLLISION[map.name], map.name).toBeDefined();
          const table = hoenn.encounters[map.encounters];
          if (tile[0] === 'l') expect(table?.land, `${a.id} ${map.name}`).toBeDefined();
          if (tile[0] === 'w') expect(table?.water, `${a.id} ${map.name}`).toBeDefined();
        }
      }
      for (const [li, step] of a.fishing ?? []) expect(a.legs[li]!.track[step], a.id).toBeDefined();
    }
    for (const m of Object.values(hoenn.maps)) {
      expect(existsSync(new URL(m.image.slice(1), PUBLIC)), m.image).toBe(true);
      if (m.top) expect(existsSync(new URL(m.top.slice(1), PUBLIC)), m.top).toBe(true);
    }
    expect(hoenn.maps[inGeneration(3, () => generation().lab)]).toBeDefined();
  });
});

describe("Hoenn's weather", () => {
  const map = (name: string) => inGeneration(3, () => mapView(name));

  it("is rolled once a run (the weather cycles' day), Hoenn's only", () => {
    const days = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) days.add(createIdleRun({ species: 252 }, seed, 3).weatherDay!);
    expect([...days].sort()).toEqual([0, 1, 2, 3]);
    expect(createIdleRun({ species: 1 }, 1, 1).weatherDay).toBeUndefined();
    expect(createIdleRun({ species: 152 }, 1, 2).weatherDay).toBeUndefined();
  });

  it("has Route 111's sandstorm only in its desert, Route 120's rain only in its parts, Route 119's on its cycle's rainy days", () => {
    const r111 = map('Route111');
    // The desert's middle; its west side, where the main road walks to Route 112, and its south.
    expect(weatherAt({}, r111, 30, 80)).toBe('sandstorm');
    expect(weatherAt({}, r111, 8, 85)).toBeUndefined();
    expect(weatherAt({}, r111, 15, 120)).toBeUndefined();
    const r120 = map('Route120');
    expect(weatherAt({}, r120, 3, 30)).toBe('rain');
    expect(weatherAt({}, r120, 12, 30)).toBeUndefined();
    expect(weatherAt({}, r120, 25, 70)).toBeUndefined();
    const r119 = map('Route119');
    expect([0, 1, 2, 3].map((d) => weatherAt({ weatherDay: d }, r119, 20, 60))).toEqual([undefined, 'rain', 'rain', 'rain']);
    // An older run with no day: none.
    expect(weatherAt({}, r119, 20, 60)).toBeUndefined();
    // Every main-road track step's weather is the map's, or none.
    for (const a of hoenn.walks) for (const leg of a.legs) for (const [m, x, y] of leg.track) expect([undefined, hoenn.maps[leg.maps[m]!]!.weather]).toContain(weatherAt({ weatherDay: 1 }, hoenn.maps[leg.maps[m]!]!, x, y));
  });
});
