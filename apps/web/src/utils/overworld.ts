// FireRed overworld sprites for the route map (`public/overworld/<name>.png`, from the pret/pokefirered decompilation's
// people sprites): each a strip of 9 frames, as FireRed's standard animations use them: standing facing down, up and left,
// then two walking frames each for down, up and left (facing right is left, mirrored). Frames are 16px wide (the biker,
// with his bike, 32px) and 32px tall; sheets without walking frames (Nurse Joy) repeat their standing ones, and the item
// ball, a single small frame, is padded to match. Red is the player.

export type Facing = 'down' | 'up' | 'left' | 'right';

/** The standing frame for each facing; right is left, mirrored. */
export const FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };

/**
 * The walk cycle for each facing, as FireRed plays it: a step, standing, the other step, standing, each frame held for 8 of
 * its 60 frames a second (WALK_FRAME_MS); walking one tile takes 16 (STEP_MS).
 */
export const WALK: Record<Facing, number[]> = { down: [3, 0, 4, 0], up: [5, 1, 6, 1], left: [7, 2, 8, 2], right: [7, 2, 8, 2] };
export const WALK_FRAME_MS = 133;
export const STEP_MS = 267;

/** Frames in each strip. */
export const STRIP_FRAMES = 9;

/** Sprites 32px wide: the biker and Red on a bike, with their bikes, and Red surfing, on his Pokémon. */
const WIDE = new Set(['biker', 'red_bike', 'red_surf']);
export const spriteWidth = (name: string) => (WIDE.has(name) ? 32 : 16);

/** The swimming sprite of a trainer standing in water (a Swimmer on Route 20), for their sprite on land. */
const IN_WATER: Record<string, string> = { swimmer_m_land: 'swimmer_m_water', swimmer_f_land: 'swimmer_f_water' };
export const waterSprite = (name: string) => IN_WATER[name];

/**
 * Each trainer class's sprite, by the class in the trainer's name ("Swimmer" in "Swimmer Luis"). Classes FireRed has no
 * sprite for use the ones FireRed itself uses for them: Super Nerds the scientist, Jugglers the man, Gamblers the old man,
 * Psychics the channeler, Burglars the Poké Maniac; Bird Keepers the boy.
 */
const CLASS_SPRITES: Record<string, string> = {
  Youngster: 'youngster',
  Lass: 'lass',
  'Bug Catcher': 'bug_catcher',
  Hiker: 'hiker',
  Picnicker: 'picnicker',
  Camper: 'camper',
  'Super Nerd': 'scientist',
  Scientist: 'scientist',
  Swimmer: 'swimmer_m_land',
  Fisherman: 'fisher',
  Beauty: 'beauty',
  Gentleman: 'gentleman',
  Biker: 'biker',
  Juggler: 'man',
  Rocker: 'rocker',
  Gambler: 'old_man_1',
  Sailor: 'sailor',
  Psychic: 'channeler',
  'Black Belt': 'black_belt',
  'Bird Keeper': 'boy',
  Burglar: 'poke_maniac',
  'Gym Guide': 'gym_guy',
  'Rocket Grunt': 'rocket_m',
};

/**
 * Trainers whose sprite depends on who they are: Cooltrainers, Ace Trainers, Jr. Trainers, Swimmers and Rocket Grunts come
 * as men and women.
 */
const WOMEN = new Set(['Mary', 'Saki', 'Gwen', 'Paige', 'Vera', 'Quinn', 'Shirley', 'Tiffany', 'Nora', 'Melissa', 'Anya', 'Alice', 'Connie', 'Mara', 'Lena', 'Tess', 'Rhea']);

/** The overworld sprite for a trainer met on the map (or at a gym), by their name; the boy for any other. */
export function trainerSprite(trainer: string): string {
  const words = trainer.split(' ');
  const name = words.at(-1)!;
  const trainerClass = words.slice(0, -1).join(' ');
  if (trainerClass === 'Cooltrainer' || trainerClass === 'Ace Trainer') return WOMEN.has(name) ? 'cooltrainer_f' : 'cooltrainer_m';
  if (trainerClass === 'Jr. Trainer') return name === 'Ami' ? 'picnicker' : 'camper';
  if (trainerClass === 'Swimmer' && WOMEN.has(name)) return 'swimmer_f_land';
  if (trainerClass === 'Rocket Grunt' && WOMEN.has(name)) return 'rocket_f';
  return CLASS_SPRITES[trainerClass] ?? 'boy';
}

/**
 * The sprite for a non-battle encounter, on the map: the shop's clerk, Nurse Joy, the collector giving a card, the trader,
 * and for a Mystery an item ball until it's revealed (then whoever its event is about: the festival-goer of a Type Frenzy,
 * the gambler, the Team Rocket dealer, the Fan Club chairman, or the ₱ lying on the ground).
 */
export function encounterSprite(kind: string, event?: string): string | null {
  switch (kind) {
    case 'shop':
      return 'clerk';
    case 'center':
      return 'nurse';
    case 'gift':
      return 'rich_boy';
    case 'trade':
      return 'woman_1';
    case 'event':
      return ({ typeFrenzy: 'woman_2', gamble: 'old_man_1', bargain: 'rocket_m', donation: 'fat_man' } as Record<string, string>)[event ?? ''] ?? 'item_ball';
    default:
      return null;
  }
}
