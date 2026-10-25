import { describe, expect, it } from 'vitest';
import { AREAS, BADGES, isTown, mapView, type WalkArea } from './areas.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { TRAINERS } from './data/gen1/trainers.js';

const walks = AREAS.filter((a): a is WalkArea => !isTown(a));

describe('the Kanto areas', () => {
  it('go from Route 1 to the Champion in the game\'s order', () => {
    expect(AREAS[0]!.id).toBe('route-1');
    expect(AREAS.at(-1)!.id).toBe('champion');
    expect(BADGES).toEqual(['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth']);
  });

  it('only use known maps, trainers, marts and wild tables', () => {
    for (const a of AREAS) {
      if (isTown(a)) {
        mapView(a.map);
        for (const m of a.marts) expect(MARTS[m], m).toBeDefined();
        continue;
      }
      for (const leg of a.legs) for (const m of leg.maps) mapView(m);
      for (const t of a.trainers) if (t.key !== 'champion') expect(TRAINERS[t.key], `${a.id}: ${t.key}`).toBeDefined();
      for (const leg of a.legs) {
        for (const [m, , , , tile] of leg.track) {
          const table = ENCOUNTERS[mapView(leg.maps[m]!).encounters];
          if (tile[0] === 'l') expect(table?.land, `${a.id} ${leg.maps[m]}`).toBeDefined();
        }
      }
    }
  });

  it('walk tracks one tile at a time (but for fades and ledge jumps)', () => {
    for (const a of walks) {
      for (const leg of a.legs) {
        for (let i = 1; i < leg.track.length; i++) {
          const [pm, px, py] = leg.track[i - 1]!;
          const [m, x, y, flags] = leg.track[i]!;
          const d = Math.abs(x - px) + Math.abs(y - py);
          if (flags & 1) continue;
          expect(m, `${a.id} step ${i}`).toBe(pm);
          expect(d, `${a.id} step ${i}`).toBe(flags & 2 ? 2 : 1);
        }
      }
    }
  });

  it('cross every trainer\'s sight line', () => {
    for (const a of walks) {
      for (const t of a.trainers) {
        const track = a.legs[t.leg]!.track;
        expect(track.some(([m, x, y]) => m === t.map && t.sight.some(([sx, sy]) => sx === x && sy === y)), `${a.id}: ${t.key}`).toBe(true);
      }
    }
  });

  it('end gyms and League rooms with their leader', () => {
    for (const a of walks.filter((x) => x.kind === 'gym' || x.kind === 'league')) expect(a.trainers.at(-1)!.key).toBe(a.leader);
  });
});
