import { mapView, species, STARTERS } from '@poke-tcg/idle';
import { MapScene } from './AreaScene';

/** The starters' Poké Balls on Professor Oak's table, as FireRed sets them (left to right: Bulbasaur, Squirtle, Charmander). */
const BALLS: { id: number; x: number }[] = [
  { id: 1, x: 8 },
  { id: 7, x: 9 },
  { id: 4, x: 10 },
];

/**
 * A new run's start (README: Idle Adventure): Professor Oak's lab, the three starters' balls on his table, the player
 * before it; each starter picked with its button (at level 5: agreed). Later runs pick from the Pokédex too (below it).
 */
export function StarterScene({ gender, busy, onPick }: { gender: 'male' | 'female'; busy: boolean; onPick: (species: number) => void }) {
  const lab = mapView('PalletTown_ProfessorOaksLab');
  return (
    <MapScene
      image={lab.image}
      width={lab.width}
      height={lab.height}
      tile={{ x: 9, y: 6 }}
      player={gender === 'female' ? 'leaf' : 'red'}
      face="up"
      moveMs={0}
      people={[{ key: 'oak', sprite: 'prof_oak', x: 6, y: 3, face: 'down' }, ...BALLS.map((b) => ({ key: `ball${b.id}`, sprite: 'item_ball', x: b.x, y: 4, face: 'down' as const }))]}
    >
      <div className="absolute inset-x-3 bottom-3 rounded-lg bg-slate-900/90 p-3 ring-1 ring-slate-600">
        <p className="mb-2 text-sm text-slate-200">Professor Oak: Now, which Pokémon do you want?</p>
        <div className="flex flex-wrap gap-2">
          {BALLS.map(({ id }) => (
            <button key={id} className="flex items-center gap-1 rounded bg-slate-600 py-1 pl-1 pr-3 text-sm transition hover:bg-slate-500 active:scale-95 disabled:opacity-40" disabled={busy || !STARTERS.includes(id)} onClick={() => onPick(id)}>
              <img src={`/idle/gen1/pokemon/front/${id}.png`} alt="" className="size-10 [image-rendering:pixelated]" draggable={false} />
              {species(id).name}
            </button>
          ))}
        </div>
      </div>
    </MapScene>
  );
}
