import { generation, habitat, IDLE_GENERATIONS, inGeneration, townMapGrid, type IdleGen } from '@poke-tcg/idle';
import { useState } from 'react';

/** How long a flash takes, on and off (FireRed's Pokédex area blinks about once a second). */
const FLASH_MS = 1000;

/**
 * A Pokédex entry's habitat (the user's, 2026-11-06: as the games' Pokédex Area shows it): the region's Town Map with
 * the places its wild Pokémon are found flashing (habitat), each region that has any a tab, the region on screen first.
 * A species found nowhere in the run's places: "Area unknown", as the games say.
 */
export function DexHabitat({ species }: { species: number }) {
  const regions = IDLE_GENERATIONS.flatMap((gen) => inGeneration(gen, () => (habitat(species).length ? [{ gen, region: generation().region, grid: townMapGrid(), places: habitat(species) }] : [])));
  const [picked, setPicked] = useState<IdleGen>(generation().gen);
  const shown = regions.find((r) => r.gen === picked) ?? regions[0];
  if (!shown) return <p className="text-sm text-slate-400">Area unknown</p>;
  const { grid, places } = shown;
  // Each cell once (a dungeon's over its route's), with every place there for its title.
  const cells = new Map<string, { x: number; y: number; names: string[] }>();
  for (const place of places)
    for (const [x, y] of place.cells) {
      const cell = cells.get(`${x},${y}`) ?? cells.set(`${x},${y}`, { x, y, names: [] }).get(`${x},${y}`)!;
      if (!cell.names.includes(place.name)) cell.names.push(place.name);
    }
  const pct = (n: number, of: number) => `${(n * 100) / of}%`;
  return (
    <div className="space-y-2">
      {regions.length > 1 && (
        <div className="flex gap-1">
          {regions.map((r) => (
            <button key={r.gen} className={`rounded px-3 py-1 text-xs transition ${r === shown ? 'bg-slate-600 text-slate-50' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} onClick={() => setPicked(r.gen)}>
              {r.region}
            </button>
          ))}
        </div>
      )}
      <div className="relative w-full max-w-md overflow-hidden rounded bg-black" style={{ aspectRatio: `${grid.imageWidth} / ${grid.imageHeight}` }}>
        <img src={grid.image} alt={`${shown.region} map`} draggable={false} className="absolute inset-0 size-full select-none [image-rendering:pixelated]" />
        {[...cells.values()].map(({ x, y, names }) => (
          <span
            key={`${x},${y}`}
            title={names.join(' / ')}
            className="absolute"
            style={{
              left: pct(grid.x + x * grid.cell, grid.imageWidth),
              top: pct(grid.y + y * grid.cell, grid.imageHeight),
              width: pct(grid.cell, grid.imageWidth),
              height: pct(grid.cell, grid.imageHeight),
              background: 'rgba(248,56,24,0.7)',
              boxShadow: 'inset 0 0 0 1px #f8f8f8',
              animation: `idle-habitat ${FLASH_MS}ms steps(1) infinite`,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-slate-400">{[...new Set(places.map((p) => p.name))].join(', ')}</p>
    </div>
  );
}
