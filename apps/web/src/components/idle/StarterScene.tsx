import { generation, mapView, species, starters } from '@poke-tcg/idle';
import { playerSprites, pokemonPics } from '../../utils/idleLook';
import type { Facing } from '../../utils/overworld';
import type { Dialogue } from '../DialogueBox';
import { TrimmedSprite } from '../TrimmedSprite';
import { MapScene } from './AreaScene';

/**
 * Each region's lab (issue #170, step 5): its map, its professor and where the player stands (facing up unless said),
 * the starters' balls on its table, and anything else the scene shows (`props`: Birch's bag).
 */
const LABS: Record<
  number,
  { map: string; speaker: string; professor: { sprite: string; x: number; y: number; face: Facing }; player: { x: number; y: number; face?: Facing }; balls: { id: number; x: number; y: number }[]; props?: { key: string; sprite: string; x: number; y: number }[] }
> = {
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
  // Emerald gives the starter from Birch's bag on Route 101 (issue #226, step 5; Route101_EventScript_BirchsBag): the
  // moment it opens, ChooseStarter, as its script leaves them: the player set at (6, 13) facing left, Birch at (4, 13)
  // facing right where his run in circles ends (Route101_Movement_BirchRunInCircles, from (0, 15)), the Zigzagoon
  // between them gone (removeobject), the bag where it lies (7, 14).
  3: {
    map: 'Route101',
    speaker: 'Professor Birch',
    professor: { sprite: 'rse/prof_birch', x: 4, y: 13, face: 'right' },
    player: { x: 6, y: 13, face: 'left' },
    balls: [],
    props: [{ key: 'bag', sprite: 'rse/birchs_bag', x: 7, y: 14 }],
  },
};

/**
 * A new run's start (README: Idle Adventure): the region's lab (Oak's, Elm's; Hoenn's Route 101, Birch's bag), its professor and the player before him;
 * his question in the text box (DialogueBox), each starter one of its choices, side by side in the box under his line,
 * its sprite (its transparent margin cut off: TrimmedSprite) over its name (at level 5: agreed), or `dialogue` in its
 * place (the catch-up's pages). Later runs pick from the Pokédex too (below it).
 */
export function StarterScene({ gender, busy, onPick, dialogue }: { gender: 'male' | 'female'; busy: boolean; onPick: (species: number) => void; dialogue?: Dialogue | null }) {
  const lab = LABS[generation().gen] ?? LABS[1]!;
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
      top={map.top}
      heights={map.heights}
      width={map.width}
      height={map.height}
      tile={lab.player}
      player={playerSprites(gender).walk}
      face={lab.player.face ?? 'up'}
      moveMs={0}
      people={[
        { key: 'professor', ...lab.professor },
        ...lab.balls.map((b) => ({ key: `ball${b.id}`, sprite: 'item_ball', x: b.x, y: b.y, face: 'down' as const })),
        ...(lab.props ?? []).map((p) => ({ ...p, face: 'down' as const })),
      ]}
      dialogue={dialogue ?? question}
    />
  );
}
