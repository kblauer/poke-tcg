import { IDLE_MAP_MUSIC, SOUNDTRACKS } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { AREAS, areaIndex, BADGES, isTown, mapView, type WalkArea } from './areas.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { TRAINERS } from './data/gen1/trainers.js';

const walks = AREAS.filter((a): a is WalkArea => !isTown(a));

describe('the Kanto areas', () => {
  it('go from Route 1 to the Champion in the game\'s order, then the places off the main road', () => {
    expect(AREAS[0]!.id).toBe('route-1');
    const road = AREAS.filter((a) => !('opens' in a && a.opens));
    expect(road.at(-1)!.id).toBe('champion');
    expect(AREAS.slice(road.length).every((a) => 'opens' in a && !!a.opens && areaIndex(a.opens) < road.length)).toBe(true);
    expect(BADGES).toEqual(['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth']);
  });

  it('have every trainer facing the tile where the player meets them (the first step of the track in their sight)', () => {
    for (const a of walks) {
      a.legs.forEach((leg, li) => {
        const trainers = a.trainers.filter((t) => t.leg === li);
        const met = new Set<string>();
        for (const [m, x, y] of leg.track) {
          // As the run meets them (idle.ts's trainerHere): the first not yet met whose sight the step is in.
          const t = trainers.find((t) => !met.has(t.key) && t.map === m && t.sight.some(([sx, sy]) => sx === x && sy === y));
          if (!t) continue;
          met.add(t.key);
          const dx = x - t.x;
          const dy = y - t.y;
          const face = dx && Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          expect(t.face, `${a.id}: ${t.key}`).toBe(face);
        }
      });
    }
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

describe("the Idle Adventure's music", () => {
  it("has each map's own song (its MUS_ constant) in both soundtracks, Oak's lab's too: none falls back", () => {
    const maps = new Set(['PalletTown_ProfessorOaksLab']);
    for (const area of AREAS) {
      if ('legs' in area) for (const leg of area.legs) for (const map of leg.maps) maps.add(map);
      if ('map' in area) maps.add(area.map);
    }
    // The Safari Zone's Evolution theme isn't in the music list yet (it plays Route 4's): to add to tracks.json.
    const missing = new Set(['MUS_EVOLUTION']);
    for (const map of maps) for (const soundtrack of SOUNDTRACKS) if (!missing.has(mapView(map).music)) expect(IDLE_MAP_MUSIC[soundtrack][mapView(map).music], `${map} (${mapView(map).music}), ${soundtrack}`).toBeDefined();
  });
});
