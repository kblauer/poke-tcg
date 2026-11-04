import { describe, expect, it } from 'vitest';
import { areas, areaIndex, isTown, mapView } from './areas.js';
import { KANTO_MAPS } from './data/gen1/maps.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { wildSpots } from './idle.js';
import { townMapGrid, townMapPlaces, townMapArea, townMapAreas, townMapPlaceAt, townMapPlaceOf } from './town-map.js';

describe('the Town Map', () => {
  it('has a place for every town, route and dungeon, and one for every gym and League room (its town)', () => {
    for (let i = 0; i < areas().length; i++) expect(townMapPlaceOf(i), areas()[i]!.id).not.toBeNull();
    for (const a of areas()) if (a.kind === 'town' || a.kind === 'route' || a.kind === 'dungeon') expect(townMapPlaces().some((p) => p.areas.includes(a.id)), a.id).toBe(true);
  });

  it('keeps its places on the grid, one a cell on each layer', () => {
    const seen = new Set<string>();
    for (const p of townMapPlaces())
      for (const [x, y, layer] of p.cells) {
        expect(x >= 0 && x < townMapGrid().width && y >= 0 && y < townMapGrid().height).toBe(true);
        expect(seen.has(`${x},${y},${layer}`)).toBe(false);
        seen.add(`${x},${y},${layer}`);
      }
  });

  it("finds a dungeon over its route's cell first, and a town's latest visit reached", () => {
    expect(townMapPlaceAt(9, 3)?.name).toBe('MT. MOON');
    expect(townMapPlaceAt(10, 3)?.name).toBe('ROUTE 4');
    expect(townMapPlaceAt(0, 0)).toBeNull();
    const viridian = townMapPlaces().find((p) => p.section === 'viridian_city')!;
    expect(townMapArea(viridian, areaIndex('pewter-city'))).toBe(areaIndex('viridian-city'));
    expect(townMapArea(viridian, areaIndex('viridian-gym'))).toBe(areaIndex('viridian-city-gym'));
    expect(townMapArea(townMapPlaces().find((p) => p.section === 'cerulean_city')!, areaIndex('pewter-city'))).toBeNull();
  });

  it('puts the places off the main road on their cells: a dungeon over its town, Route 21 with its tall grass', () => {
    expect(townMapPlaceAt(18, 6)?.name).toBe('POKéMON TOWER');
    expect(townMapPlaces().find((p) => p.cells.some(([x, y, l]) => x === 18 && y === 6 && l === 'map'))?.name).toBe('LAVENDER TOWN');
    const route21 = townMapPlaces().find((p) => p.section === 'route_21')!;
    expect(townMapArea(route21, areaIndex('route-21'))).toBe(areaIndex('route-21'));
    expect(townMapAreas(route21, areaIndex('route-21'))).toEqual([areaIndex('route-21'), areaIndex('route-21-grass')]);
    expect(townMapAreas(route21, areaIndex('cinnabar-island'))).toEqual([]);
  });

  it("puts the run on its own map's place (Route 17 of Routes 16, 17 and 18), Pallet Town's on Route 1's first leg", () => {
    expect(townMapPlaceOf(areaIndex('route-16'), 'Route17')?.name).toBe('ROUTE 17');
    expect(townMapPlaceOf(areaIndex('route-16'))?.name).toBe('ROUTE 16');
    expect(townMapPlaces().find((p) => p.section === 'pallet_town')?.areas).toEqual(['route-1']);
    expect(mapView('Route17').section).toBe('route_17');
  });

  it("offers every route place its own grass and fishing (the user's: each route's on its own place), but Route 4's fishing (surfed water)", () => {
    const spots = areas().flatMap((a, i) => (isTown(a) ? [] : wildSpots(i)));
    const missing: string[] = [];
    for (const place of townMapPlaces().filter((p) => p.section.startsWith('route_'))) {
      const maps = Object.entries(KANTO_MAPS).filter(([, m]) => m.section === place.section);
      for (const [kind, letter] of [['land', 'l'], ['fishing', 'f']] as const)
        if (maps.some(([, m]) => ENCOUNTERS[m.encounters]?.[kind]) && !spots.some((s) => s.id.endsWith(`:${letter}`) && mapView(s.map).section === place.section)) missing.push(`${place.name} ${kind}`);
    }
    expect(missing).toEqual(['ROUTE 4 fishing']);
  });
});
