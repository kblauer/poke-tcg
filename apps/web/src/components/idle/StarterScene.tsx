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
  {
    map: string;
    speaker: string;
    professor: { sprite: string; x: number; y: number; face: Facing };
    player: { x: number; y: number; face?: Facing };
    balls: { id: number; x: number; y: number }[];
    props?: { key: string; sprite: string; x: number; y: number }[];
    /** The starter slots' centre on the map, in its pixels (the user's: on the open floor near the player). */
    slots: { x: number; y: number };
  }
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
    // Below the machine on the lab's left, where the user marked them.
    slots: { x: 88, y: 108 },
  },
  // Professor Elm's lab (HeartGold's MAP_NEW_BARK_ELMS_LAB_1F: Elm where its events have him, the player before him); the
  // starters' balls are in his machine, not drawn.
  2: { map: 'NewBarkElmsLab1f', speaker: 'Professor Elm', professor: { sprite: 'hgss/doctor', x: 6, y: 5, face: 'down' }, player: { x: 6, y: 7 }, balls: [], slots: { x: 152, y: 96 } },
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
    // On the clear ground above the player.
    slots: { x: 112, y: 184 },
  },
};

/**
 * A new run's start (README: Idle Adventure): the region's lab (Oak's, Elm's; Hoenn's Route 101, Birch's bag), its professor and the player before him;
 * his question in the text box (DialogueBox), each starter one of its choices, side by side in the box under his line,
 * its sprite (its transparent margin cut off: TrimmedSprite) over its name (at level 5: agreed), or `dialogue` in its
 * place (the catch-up's pages). Later runs pick from the Pokédex too (below it). The starter slots on the map (`slots`:
 * the Starter slots upgrade's, the user's), each starter picked shown in the next one (`picks`). `options`: the starters
 * offered in place of the region's three (Randomized starters). `confirm`: every slot filled, the professor's "Start the run
 * with …?" with Yes and No in place of the choices (the user's).
 */
export function StarterScene({ gender, busy, onPick, dialogue, slots = 1, picks = [], options, confirm }: { gender: 'male' | 'female'; busy: boolean; onPick: (species: number) => void; dialogue?: Dialogue | null; slots?: number; picks?: { species: number; shiny: boolean }[]; options?: number[]; confirm?: { text: string; onAnswer: (yes: boolean) => void } | null }) {
  const lab = LABS[generation().gen] ?? LABS[1]!;
  const map = mapView(lab.map);
  // In the balls' order on the table, where they're drawn; with Randomized starters (`options`, the user's) those instead.
  const three = options ?? (lab.balls.length ? lab.balls.map((b) => b.id) : starters());
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
      dialogue={dialogue ?? (confirm ? { speaker: lab.speaker, text: confirm.text, choices: [{ label: 'Yes', disabled: busy }, { label: 'No', disabled: busy }], answer: (i) => confirm.onAnswer(i === 0) } : question)}
      onMap={<StarterSlots at={lab.slots} slots={slots} picks={picks} />}
    />
  );
}

/** A starter slot's size and the gap between two, in map pixels. */
const SLOT = 32;
const SLOT_GAP = 4;

/**
 * The new run's starter slots (the user's, 2026-11-23): as many as the account has, in a row centred on `at` (map
 * pixels), each starter picked so far shown in the next one (its front picture, its shiny one for a shiny).
 */
function StarterSlots({ at, slots, picks }: { at: { x: number; y: number }; slots: number; picks: { species: number; shiny: boolean }[] }) {
  const width = slots * SLOT + (slots - 1) * SLOT_GAP;
  return (
    <>
      {Array.from({ length: slots }, (_, i) => {
        const pick = picks[i];
        return (
          <div
            key={i}
            className={`absolute rounded-sm ${pick ? 'bg-white/40 ring-1 ring-white/80' : 'border border-dashed border-white/80 bg-white/15'}`}
            style={{ left: at.x - width / 2 + i * (SLOT + SLOT_GAP), top: at.y - SLOT / 2, width: SLOT, height: SLOT, zIndex: 898 }}
          >
            {pick && <img src={`${pokemonPics()}/${pick.shiny ? 'shiny/' : ''}front/${pick.species}.png`} alt={species(pick.species).name} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" draggable={false} />}
          </div>
        );
      })}
    </>
  );
}
