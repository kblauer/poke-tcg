import { mapView, species, STARTERS } from '@poke-tcg/idle';
import type { Dialogue } from '../DialogueBox';
import { TrimmedSprite } from '../TrimmedSprite';
import { MapScene } from './AreaScene';

/** The starters' Poké Balls on Professor Oak's table, as FireRed sets them (left to right: Bulbasaur, Squirtle, Charmander). */
const BALLS: { id: number; x: number }[] = [
  { id: 1, x: 8 },
  { id: 7, x: 9 },
  { id: 4, x: 10 },
];

/**
 * A new run's start (README: Idle Adventure): Professor Oak's lab, the three starters' balls on his table, the player
 * before it; his question in the text box (DialogueBox), each starter one of its choices, side by side in the box under
 * his line, its sprite (its transparent margin cut off: TrimmedSprite) over its name (at level 5: agreed), or `dialogue`
 * in its place (the catch-up's pages). Later runs pick from the Pokédex too (below it).
 */
export function StarterScene({ gender, busy, onPick, dialogue }: { gender: 'male' | 'female'; busy: boolean; onPick: (species: number) => void; dialogue?: Dialogue | null }) {
  const lab = mapView('PalletTown_ProfessorOaksLab');
  const question: Dialogue = {
    speaker: 'Professor Oak',
    text: 'Now, which Pokémon do you want?',
    inline: true,
    choices: BALLS.map(({ id }) => ({
      label: species(id).name,
      icon: <TrimmedSprite src={`/idle/gen1/pokemon/front/${id}.png`} scale={1.5} />,
      disabled: busy || !STARTERS.includes(id),
    })),
    answer: (i) => onPick(BALLS[i]!.id),
  };
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
      dialogue={dialogue ?? question}
    />
  );
}
