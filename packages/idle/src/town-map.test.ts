import { describe, expect, it } from 'vitest';
import { AREAS, areaIndex } from './areas.js';
import { TOWN_MAP_GRID, TOWN_MAP_PLACES, townMapArea, townMapPlaceAt, townMapPlaceOf } from './town-map.js';

describe('the Town Map', () => {
  it('has a place for every town, route and dungeon, and one for every gym and League room (its town)', () => {
    for (let i = 0; i < AREAS.length; i++) expect(townMapPlaceOf(i), AREAS[i]!.id).not.toBeNull();
    for (const a of AREAS) if (a.kind === 'town' || a.kind === 'route' || a.kind === 'dungeon') expect(TOWN_MAP_PLACES.some((p) => p.areas.includes(a.id)), a.id).toBe(true);
  });

  it('keeps its places on the grid, one a cell on each layer', () => {
    const seen = new Set<string>();
    for (const p of TOWN_MAP_PLACES)
      for (const [x, y, layer] of p.cells) {
        expect(x >= 0 && x < TOWN_MAP_GRID.width && y >= 0 && y < TOWN_MAP_GRID.height).toBe(true);
        expect(seen.has(`${x},${y},${layer}`)).toBe(false);
        seen.add(`${x},${y},${layer}`);
      }
  });

  it("finds a dungeon over its route's cell first, and a town's latest visit reached", () => {
    expect(townMapPlaceAt(9, 3)?.name).toBe('MT. MOON');
    expect(townMapPlaceAt(10, 3)?.name).toBe('ROUTE 4');
    expect(townMapPlaceAt(0, 0)).toBeNull();
    const viridian = TOWN_MAP_PLACES.find((p) => p.section === 'viridian_city')!;
    expect(townMapArea(viridian, areaIndex('pewter-city'))).toBe(areaIndex('viridian-city'));
    expect(townMapArea(viridian, areaIndex('viridian-gym'))).toBe(areaIndex('viridian-city-gym'));
    expect(townMapArea(TOWN_MAP_PLACES.find((p) => p.section === 'cerulean_city')!, areaIndex('pewter-city'))).toBeNull();
  });
});
