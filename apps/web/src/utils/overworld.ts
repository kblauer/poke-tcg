// FireRed overworld sprites for the route map (`public/overworld/<name>.png`, from the pret/pokefirered decompilation's
// people sprites): each a strip of 9 frames, as FireRed's standard animations use them: standing facing down, up and left,
// then two walking frames each for down, up and left (facing right is left, mirrored). Frames are 16px wide (the biker,
// with his bike, 32px) and 32px tall; sheets without walking frames (Nurse Joy) repeat their standing ones, and the item
// ball, a single small frame, is padded to match. Red is the player.
//
// The Johto maps use HeartGold/SoulSilver's sprites instead (`public/overworld/hgss/<name>.png`, named `hgss/<name>` here,
// made by tools/routes/hgss/hgss_sprites.py from the pret/pokeheartgold decompilation): strips of 12 frames, 32x32 each,
// standing facing down, up, left and right, then two walking frames each for down, up, left and right (HGSS draws facing
// right itself). Ethan is the player.

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Which game's sprites a map uses: FireRed's (Kanto) or HeartGold/SoulSilver's (Johto). */
export type SpriteSet = 'frlg' | 'hgss';

const isHgss = (name: string) => name.startsWith('hgss/');

/** The standing frame for each facing; right is left, mirrored. */
export const FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };

/**
 * The walk cycle for each facing, as FireRed plays it: a step, standing, the other step, standing, each frame held for 8 of
 * its 60 frames a second (WALK_FRAME_MS); walking one tile takes 16 (STEP_MS).
 */
export const WALK: Record<Facing, number[]> = { down: [3, 0, 4, 0], up: [5, 1, 6, 1], left: [7, 2, 8, 2], right: [7, 2, 8, 2] };
export const WALK_FRAME_MS = 133;
export const STEP_MS = 267;

/** HGSS's standing frames and walk cycles (the same timing), right with its own frames. */
const HGSS_FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
const HGSS_WALK: Record<Facing, number[]> = { down: [4, 0, 5, 0], up: [6, 1, 7, 1], left: [8, 2, 9, 2], right: [10, 3, 11, 3] };

/** A sprite's standing frame, and its frame `tick` frames into its walk cycle. */
export const standFrame = (name: string, face: Facing) => (isHgss(name) ? HGSS_FRAME : FRAME)[face];
export const walkFrame = (name: string, face: Facing, tick: number) =>
  // A sprite that bobs (Ethan surfing) moves on its two walking frames only, so its foam (on those) never flickers off.
  bobs(name) ? HGSS_WALK[face][(tick % 2) * 2]! : (isHgss(name) ? HGSS_WALK : WALK)[face][tick % 4]!;
/** Whether a sprite facing `face` is its left frames, mirrored (FireRed's facing right). */
export const mirrored = (name: string, face: Facing) => face === 'right' && !isHgss(name);

/**
 * Sprites that bob on the spot (Ethan surfing): 4 more frames after their 12, standing a pixel lower, which the map
 * alternates with the standing ones while they're still (BOB_MS); moving, they show only their walking frames, which
 * have the surf foam under them.
 */
const BOBBING = new Set(['hgss/swimhero']);
export const bobs = (name: string) => BOBBING.has(name);
export const bobFrame = (name: string, face: Facing) => 12 + HGSS_FRAME[face];
export const BOB_MS = 450;

/** Frames in each strip. */
export const STRIP_FRAMES = 9;
export const stripFrames = (name: string) => (bobs(name) ? 16 : isHgss(name) ? 12 : STRIP_FRAMES);

/** Sprites 32px wide: the biker and Red on a bike, with their bikes, and Red surfing, on his Pokémon; every HGSS sprite. */
const WIDE = new Set(['biker', 'red_bike', 'red_surf']);
export const spriteWidth = (name: string) => (WIDE.has(name) || isHgss(name) ? 32 : 16);

/** The player's sprite: Red or Ethan, walking, on a bike (`travel`) or surfing (in water). */
export const playerSprite = (set: SpriteSet, travel: 'bike' | 'surf' | undefined, inWater: boolean) =>
  set === 'hgss'
    ? travel === 'bike' ? 'hgss/cyclehero' : travel === 'surf' && inWater ? 'hgss/swimhero' : 'hgss/hero'
    : travel === 'bike' ? 'red_bike' : travel === 'surf' && inWater ? 'red_surf' : 'red';

/** The swimming sprite of a trainer standing in water (a Swimmer on Route 20), for their sprite on land. */
const IN_WATER: Record<string, string> = { swimmer_m_land: 'swimmer_m_water', swimmer_f_land: 'swimmer_f_water' };
export const waterSprite = (name: string) => IN_WATER[name];
/** Whether a sprite is a swimmer's (they stand in water where they can): HGSS's swimmers are only ever in it. */
export const swims = (name: string) => !!IN_WATER[name] || name === 'hgss/swimmer_m' || name === 'hgss/swimmer_f';
/** The item ball (a Mystery not yet revealed, a Lucky Find), which stays put and is one tile tall. */
export const isItemBall = (name: string | undefined) => name === 'item_ball' || name === 'hgss/item_ball';

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
  // Kanto's Gym Trainers' classes, as FireRed draws them in their gyms.
  Tamer: 'man',
  Channeler: 'channeler',
  Engineer: 'balding_man',
};

/**
 * Trainers whose sprite depends on who they are: Cooltrainers, Ace Trainers, Jr. Trainers, Swimmers and Rocket Grunts come
 * as men and women.
 */
const WOMEN = new Set(['Mary', 'Saki', 'Gwen', 'Paige', 'Vera', 'Quinn', 'Shirley', 'Tiffany', 'Nora', 'Melissa', 'Anya', 'Alice', 'Connie', 'Mara', 'Lena', 'Tess', 'Rhea', 'Lola', 'Fran']);

/** Kanto's Gym Trainers (bosses.ts) whose class FireRed draws differently in their gym (pret's gym maps): Fuchsia's Jugglers as Rockers, Saffron's Psychics as Cooltrainers. */
const GYM_SPRITES: Record<string, string> = {
  'Juggler Kayden': 'rocker',
  'Juggler Shawn': 'rocker',
  'Juggler Kirk': 'rocker',
  'Juggler Nate': 'rocker',
  'Psychic Cameron': 'cooltrainer_m',
  'Psychic Johan': 'cooltrainer_m',
  'Psychic Preston': 'cooltrainer_m',
  'Psychic Tyron': 'cooltrainer_m',
};

/**
 * Each trainer class's HGSS sprite where its name differs from FireRed's (the others have HGSS sprites of the same name):
 * HGSS's own Johto trainers' sprites, Super Nerds the lab assistant, Gamblers the middle-aged man, Psychics the mystic,
 * Bird Keepers the Johto man, Burglars the thief, Swimmers in the water.
 */
const HGSS_CLASS_SPRITES: Record<string, string> = {
  'Super Nerd': 'super_nerd',
  Swimmer: 'swimmer_m',
  Juggler: 'juggler',
  Gambler: 'gambler',
  Psychic: 'psychic',
  'Bird Keeper': 'bird_keeper',
  Burglar: 'burglar',
  'Gym Guide': 'boy',
  // The Johto gyms' trainers (johto-bosses.ts), with HGSS's sprites for them.
  Medium: 'medium',
  Skier: 'skier',
  Boarder: 'boarder',
};

/**
 * The overworld sprite for a trainer met on the map (or at a gym), by their name; the boy for any other. Kanto's Gym
 * Trainers' own sprites (GYM_SPRITES) are FireRed's, on its maps.
 */
export function trainerSprite(trainer: string, set: SpriteSet = 'frlg'): string {
  if (set === 'frlg' && GYM_SPRITES[trainer]) return GYM_SPRITES[trainer];
  const words = trainer.split(' ');
  const name = words.at(-1)!;
  const trainerClass = words.slice(0, -1).join(' ');
  const pick = (): string => {
    if (trainerClass === 'Cooltrainer' || trainerClass === 'Ace Trainer') return WOMEN.has(name) ? 'cooltrainer_f' : 'cooltrainer_m';
    if (trainerClass === 'Jr. Trainer') return name === 'Ami' ? 'picnicker' : 'camper';
    if (trainerClass === 'Swimmer' && WOMEN.has(name)) return set === 'hgss' ? 'swimmer_f' : 'swimmer_f_land';
    if (trainerClass === 'Rocket Grunt' && WOMEN.has(name)) return 'rocket_f';
    if (set === 'hgss' && HGSS_CLASS_SPRITES[trainerClass]) return HGSS_CLASS_SPRITES[trainerClass]!;
    return CLASS_SPRITES[trainerClass] ?? 'boy';
  };
  return set === 'hgss' ? `hgss/${pick()}` : pick();
}

/**
 * The sprite for a non-battle encounter, on the map: the shop's clerk, Nurse Joy, the collector giving a card, the trader,
 * and for a Mystery an item ball until it's revealed (then whoever its event is about: the festival-goer of a Type Frenzy,
 * the gambler, the Team Rocket dealer, the Fan Club chairman, or the ₱ lying on the ground).
 */
export function encounterSprite(kind: string, event?: string, set: SpriteSet = 'frlg'): string | null {
  const name = (() => {
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
  })();
  // HGSS has a sprite of each of these names.
  return name && set === 'hgss' ? `hgss/${name}` : name;
}
