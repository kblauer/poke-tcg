import { generation, mapView, species, starters } from '@poke-tcg/idle';
import { playerSprites, pokemonPics } from '../../utils/idleLook';
import type { Facing } from '../../utils/overworld';
import type { Dialogue } from '../DialogueBox';
import { TrimmedSprite } from '../TrimmedSprite';
import { MapScene } from './AreaScene';

/** Each region's lab (issue #170, step 5): its map, its professor and where the player stands, and the starters' balls on its table. */
const LABS: Record<1 | 2, { map: string; speaker: string; professor: { sprite: string; x: number; y: number; face: Facing }; player: { x: number; y: number }; balls: { id: number; x: number; y: number }[] }> = {
  // Professor Oak's lab, the starters' Poké Balls on his table, as FireRed sets them (left to right: Bulbasaur, Squirtle, Charmander).
  1: {
    map: 'PalletTown_ProfessorOaksLab',
    speaker: 'Professor Oak',
    professor: { sprite: 'prof_oak', x: 6, y: 3, face: 'down' },
    player: { x: 9, y: 6 },
    balls: [
      { id: 1, x: 8, y: 4 },
      { id: 7, x: 9, y: 4 },
      { id: 4, x: 10, y: 4 },
    ],
  },
  // Professor Elm's lab (HeartGold's MAP_NEW_BARK_ELMS_LAB_1F: Elm where its events have him, the player before him); the
  // starters' balls are in his machine, not drawn.
  2: { map: 'NewBarkElmsLab1f', speaker: 'Professor Elm', professor: { sprite: 'hgss/doctor', x: 6, y: 5, face: 'down' }, player: { x: 6, y: 7 }, balls: [] },
};

/**
 * A new run's start (README: Idle Adventure): the region's lab (Oak's, Elm's), its professor and the player before him;
 * his question in the text box (DialogueBox), each starter one of its choices, side by side in the box under his line,
 * its sprite (its transparent margin cut off: TrimmedSprite) over its name (at level 5: agreed), or `dialogue` in its
 * place (the catch-up's pages). Later runs pick from the Pokédex too (below it).
 */
export function StarterScene({ gender, busy, onPick, dialogue }: { gender: 'male' | 'female'; busy: boolean; onPick: (species: number) => void; dialogue?: Dialogue | null }) {
  const lab = LABS[generation().gen];
  const map = mapView(lab.map);
  // In the balls' order on the table, where they're drawn.
  const three = lab.balls.length ? lab.balls.map((b) => b.id) : starters();
  const question: Dialogue = {
    speaker: lab.speaker,
    text: 'Now, which Pokémon do you want?',
    inline: true,
    choices: three.map((id) => ({
      label: species(id).name,
      icon: <TrimmedSprite src={`${pokemonPics()}/front/${id}.png`} scale={1.5} />,
      disabled: busy,
    })),
    answer: (i) => onPick(three[i]!),
  };
  return (
    <MapScene
      image={map.image}
      width={map.width}
      height={map.height}
      tile={lab.player}
      player={playerSprites(gender).walk}
      face="up"
      moveMs={0}
      people={[{ key: 'professor', ...lab.professor }, ...lab.balls.map((b) => ({ key: `ball${b.id}`, sprite: 'item_ball', x: b.x, y: b.y, face: 'down' as const }))]}
      dialogue={dialogue ?? question}
    />
  );
}
