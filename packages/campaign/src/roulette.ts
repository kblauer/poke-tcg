// The Mauville Game Corner's roulette (the Extras page's Game Corner), as Pokémon Emerald plays it (the pret/pokeemerald
// decompilation's src/roulette.c and the RouletteFlash util of src/palette_util.c, ported frame by frame, its bugs kept):
// the player bets the table's coins on a square of the grid (one of the 12 Pokémon of a colour, ×12), a column (a Pokémon,
// ×4 to ×12) or a row (a colour, ×3 to ×12), the wheel spins and the ball rolls round it, slows and falls into a slot; a
// ball that would fall into a slot already hit this round of 6 bounces to the next, and if that one's hit too, Shroomish
// or Taillow comes to clear it into another. The web app runs `rouletteFrame` 60 times a second (the game's frame rate)
// with the buttons newly pressed; the API settles each ball's bet and payout (`coinRoundError`). The player's party
// isn't modelled (no Shroomish or Taillow in it), nor PokéNews's service day.
import type { Random16 } from './berry-blender.js';
import { MAX_COINS, ROULETTE_MIN_BETS } from './game-corner.js';

export const ROULETTE_BALLS = 6;
const NUM_BOARD_COLORS = 3;
const NUM_BOARD_POKES = 4;
export const ROULETTE_SLOTS = NUM_BOARD_COLORS * NUM_BOARD_POKES;
const DEGREES_PER_SLOT = 360 / ROULETTE_SLOTS;
const SLOT_MIDPOINT = DEGREES_PER_SLOT / 2 - 1;
const MAX_MULTIPLIER = 12;
const NO_DELAY = 0xffff;
const BALL_STATE_LANDED = 0xff;

/** The grid's selections: 0 none, 1-4 a Pokémon's column (Wynaut, Azurill, Skitty, Makuhita), 5/10/15 a colour's row (orange, green, purple), and the squares (row + column). */
export const ROULETTE_POKEMON = ['Wynaut', 'Azurill', 'Skitty', 'Makuhita'] as const;
export const ROULETTE_COLORS = ['Orange', 'Green', 'Purple'] as const;
const ROW_ORANGE = 5;
const ROW_GREEN = 10;
const ROW_PURPLE = 15;
const NUM_GRID_SELECTIONS = 19;
const COL = (id: number) => id % (NUM_BOARD_POKES + 1);
const ROW = (id: number) => Math.trunc(id / (NUM_BOARD_POKES + 1)) * (NUM_BOARD_POKES + 1);
const ROW_IDX = (id: number) => Math.trunc(id / 5) - 1;

// The flash util's ids and flags (F_FLASH_*): a slot's colour on the wheel, the wheel's outer edges (a win), the icons.
const F_FLASH_OUTER_EDGES = 1 << 12;
const FLASH_ICON = ROULETTE_SLOTS + 1;
const F_FLASH_ICON = 1 << FLASH_ICON;
const F_FLASH_COLUMN = (1 << FLASH_ICON) | (1 << (FLASH_ICON + 1)) | (1 << (FLASH_ICON + 2));

/** The wheel's slots clockwise from 1 o'clock (sRouletteSlots): slot k is the grid square of colour k % 3 and Pokémon k % 4. */
const slotSquare = (k: number) => ((k % NUM_BOARD_COLORS) + 1) * 5 + (k % NUM_BOARD_POKES) + 1;
const SLOTS = Array.from({ length: ROULETTE_SLOTS }, (_, k) => ({ gridSquare: slotSquare(k), flag: 1 << slotSquare(k) }));

export interface GridSelection {
  /** The wheel icon (a square's slot), or 12-15 a column's header, 16-18 a row's; 0xFF none. */
  spriteIdOffset: number;
  baseMultiplier: number;
  /** Its top left tile on the grid (BG 1), 3x3 tiles. */
  x: number;
  y: number;
  tilemapOffset: number;
  flag: number;
  inSelectionFlags: number;
  flashFlags: number;
}

/** sGridSelections, by selection id. */
export const ROULETTE_GRID: readonly GridSelection[] = Array.from({ length: NUM_GRID_SELECTIONS + 1 }, (_, id) => {
  if (id === 0) return { spriteIdOffset: 0xff, baseMultiplier: 0, x: 7, y: 7, tilemapOffset: 0, flag: 0, inSelectionFlags: 0, flashFlags: 0 };
  const col = COL(id);
  const row = ROW_IDX(id);
  if (row < 0) {
    // A column: its header and the 3 squares under it.
    const squares = [1, 2, 3].map((r) => 1 << (r * 5 + col));
    return { spriteIdOffset: 11 + col, baseMultiplier: NUM_BOARD_POKES, x: 14 + 3 * col, y: 7, tilemapOffset: 0, flag: 1 << id, inSelectionFlags: squares.reduce((a, f) => a | f, 1 << id), flashFlags: F_FLASH_COLUMN };
  }
  if (col === 0) {
    // A row: its header and its 4 squares; it flashes its 4 slots' colours.
    const squares = [1, 2, 3, 4].map((c) => id + c);
    return {
      spriteIdOffset: 16 + row,
      baseMultiplier: NUM_BOARD_COLORS,
      x: 14,
      y: 10 + 3 * row,
      tilemapOffset: 12 + 3 * row,
      flag: 1 << id,
      inSelectionFlags: squares.reduce((a, s) => a | (1 << s), 1 << id),
      flashFlags: squares.reduce((a, s) => a | (1 << SLOTS.findIndex((k) => k.gridSquare === s)), 0),
    };
  }
  const slot = SLOTS.findIndex((k) => k.gridSquare === id);
  return { spriteIdOffset: slot, baseMultiplier: ROULETTE_SLOTS, x: 14 + 3 * col, y: 10 + 3 * row, tilemapOffset: 3 + 3 * row, flag: 1 << id, inSelectionFlags: 1 << id, flashFlags: F_FLASH_ICON | (1 << slot) };
});

/** What the selection pays: a Pokémon of a colour, a Pokémon (column) or a colour (row). */
export const selectionKind = (id: number): 'square' | 'column' | 'row' | null => (id <= 0 || id > NUM_GRID_SELECTIONS ? null : ROW_IDX(id) < 0 ? 'column' : COL(id) === 0 ? 'row' : 'square');

/** The selection whose 3x3 tiles on the grid (at rest) hold the tile `tx`, `ty`, or null. */
export function rouletteSelectionAt(tx: number, ty: number): number | null {
  const id = ROULETTE_GRID.findIndex((s, i) => i > 0 && tx >= s.x && tx < s.x + 3 && ty >= s.y && ty < s.y + 3);
  return id > 0 ? id : null;
}

interface RouletteTable {
  randDistanceHigh: number;
  randDistanceLow: number;
  wheelSpeed: number;
  wheelDelay: number;
  shroomish: { startAngle: number; dropAngle: number; fallSlowdown: number };
  taillow: { baseDropDelay: number; rightStartAngle: number; leftStartAngle: number };
  ballSpeed: number;
  baseTravelDist: number;
  var1C: number;
}

/** sRouletteTables: the left table (bets of 1) and the right (3), its ball travelling less far and more alike each time. */
const TABLES: RouletteTable[] = [
  {
    randDistanceHigh: DEGREES_PER_SLOT * 2,
    randDistanceLow: DEGREES_PER_SLOT,
    wheelSpeed: 1,
    wheelDelay: 1,
    shroomish: { startAngle: 45, dropAngle: 30, fallSlowdown: 1 },
    taillow: { baseDropDelay: 75, rightStartAngle: 27, leftStartAngle: 24 },
    ballSpeed: 10,
    baseTravelDist: 360,
    var1C: -0.5,
  },
  {
    randDistanceHigh: DEGREES_PER_SLOT,
    randDistanceLow: DEGREES_PER_SLOT / 2,
    wheelSpeed: 1,
    wheelDelay: 0,
    shroomish: { startAngle: 75, dropAngle: 60, fallSlowdown: 2 },
    taillow: { baseDropDelay: 0, rightStartAngle: 54, leftStartAngle: 48 },
    ballSpeed: 10,
    baseTravelDist: 270,
    var1C: -1,
  },
];

/** The table's felt (sRoulette's bgColors, BGR555): red at the left table, green at the right. Set in BG palette 0's colour 0 and palette 5's colour 1. */
export const ROULETTE_TABLE_COLORS = [24 | (4 << 5) | (10 << 10), 10 | (19 << 5) | (6 << 10)] as const;

// ---- The game's numbers: f32 maths, s16/u8 fields, Sin2/Cos2 ----

const f = Math.fround;
const s16 = (v: number) => ((v & 0xffff) << 16) >> 16;
const u8 = (v: number) => v & 0xff;
const u16 = (v: number) => v & 0xffff;
const S16TOPOSFLOAT = (v: number) => {
  const s = s16(v);
  return s < 0 ? f(s + 65536) : f(s);
};
/** gSineDegreeTable: sin(0°…179°) in Q4.12. */
const SINE = [
  0, 71, 143, 214, 286, 357, 428, 499, 570, 641, 711, 782, 852, 921, 991, 1060, 1129, 1198, 1266, 1334, 1401, 1468, 1534, 1600, 1666, 1731, 1796, 1860, 1923, 1986, 2048, 2110, 2171, 2231, 2290, 2349, 2408, 2465,
  2522, 2578, 2633, 2687, 2741, 2793, 2845, 2896, 2946, 2996, 3044, 3091, 3138, 3183, 3228, 3271, 3314, 3355, 3396, 3435, 3474, 3511, 3547, 3582, 3617, 3650, 3681, 3712, 3742, 3770, 3798, 3824, 3849, 3873,
  3896, 3917, 3937, 3956, 3974, 3991, 4006, 4021, 4034, 4046, 4056, 4065, 4073, 4080, 4086, 4090, 4093, 4095, 4096, 4095, 4093, 4090, 4086, 4080, 4073, 4065, 4056, 4046, 4034, 4021, 4006, 3991, 3974, 3956,
  3937, 3917, 3896, 3873, 3849, 3824, 3798, 3770, 3742, 3712, 3681, 3650, 3617, 3582, 3547, 3511, 3474, 3435, 3396, 3355, 3314, 3271, 3228, 3183, 3138, 3091, 3044, 2996, 2946, 2896, 2845, 2793, 2741, 2687,
  2633, 2578, 2522, 2465, 2408, 2349, 2290, 2231, 2171, 2110, 2048, 1986, 1923, 1860, 1796, 1731, 1666, 1600, 1534, 1468, 1401, 1334, 1266, 1198, 1129, 1060, 991, 921, 852, 782, 711, 641, 570, 499, 428, 357,
  286, 214, 143, 71,
];
/** Sin2: an angle in degrees (as a u16) to its sine in Q4.12. */
export function sin2(angle: number) {
  const a = u16(angle);
  const v = SINE[a % 180]!;
  return Math.trunc(a / 180) & 1 ? -v : v;
}
export const cos2 = (angle: number) => sin2(u16(angle + 90));

// ---- Sounds ----

export type RouletteSoundName =
  | 'se_shop'
  | 'se_boo'
  | 'se_roulette_ball'
  | 'se_roulette_ball2'
  | 'se_ball_throw'
  | 'se_ball_bounce_1'
  | 'se_pin'
  | 'se_failure'
  | 'se_select'
  | 'se_m_strength'
  | 'se_fall'
  | 'se_taillow_wing_flap'
  | 'se_bridge_walk'
  | 'mus_slots_win'
  | 'mus_slots_jackpot';

/**
 * Each sound's music player and priority (song_table.inc, midi.cfg's -P) and how long it plays, in frames (the WAVs
 * tools/extras/emerald_roulette.py renders; Taillow's wing flaps loop until stopped): IsSEPlaying and a sound's place on
 * its player follow from them, as the game's sound engine has them.
 */
export const ROULETTE_SOUNDS: Record<RouletteSoundName, [player: 'se1' | 'se2', priority: number, frames: number]> = {
  se_shop: ['se1', 5, 36],
  se_boo: ['se1', 4, 20],
  se_roulette_ball: ['se2', 2, 489],
  se_roulette_ball2: ['se2', 2, 81],
  se_ball_throw: ['se1', 5, 33],
  se_ball_bounce_1: ['se1', 4, 18],
  se_pin: ['se1', 4, 25],
  se_failure: ['se1', 4, 30],
  se_select: ['se2', 5, 16],
  se_m_strength: ['se1', 4, 30],
  se_fall: ['se1', 4, 48],
  se_taillow_wing_flap: ['se1', 5, Infinity],
  se_bridge_walk: ['se2', 4, 16],
  mus_slots_win: ['se2', 5, 163],
  mus_slots_jackpot: ['se2', 5, 274],
};
/** The fanfares' lengths (sound.c's sFanfares): the music stops for this many frames. */
const FANFARE_FRAMES: Partial<Record<RouletteSoundName, number>> = { mus_slots_jackpot: 250, mus_slots_win: 150 };

// ---- The flash util (palette_util.c's RouletteFlash) ----

export interface RouletteFlashSettings {
  /** A colour to flash to, or FLASHUTIL_USE_EXISTING_COLOR (bit 15) to fade the colours brighter and back. */
  color: number;
  /** The first colour, 0-255 BG, 256-511 OBJ. */
  paletteOffset: number;
  numColors: number;
  delay: number;
  numFadeCycles: number;
}
export interface RouletteFlashPalette {
  state: number;
  available: boolean;
  delayCounter: number;
  fadeCycleCounter: number;
  colorDelta: number;
  settings: RouletteFlashSettings;
}
export interface RouletteFlashUtil {
  enabled: number;
  flags: number;
  palettes: RouletteFlashPalette[];
}
/** The palettes the flash util changes (gPlttBufferUnfaded/Faded: 512 BGR555 colours, BG then OBJ), if the screen keeps them. */
export interface RoulettePalette {
  unfaded: number[];
  faded: number[];
}
const USE_EXISTING_COLOR = 1 << 15;
const RGB = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);
const flashColor = (paletteOffset: number): RouletteFlashSettings => ({ color: USE_EXISTING_COLOR, paletteOffset, numColors: 1, delay: 1, numFadeCycles: 8 });
/** sFlashData_Colors: each slot's colour on the wheel, by slot; then the outer edges. */
const FLASH_COLORS: RouletteFlashSettings[] = [
  ...[5, 10, 21, 85, 90, 101, 117, 122, 133, 149, 154, 165].map(flashColor),
  { color: RGB(22, 30, 29), paletteOffset: 2 * 16 + 8, numColors: 2, delay: 10, numFadeCycles: 14 },
];
/** sFlashData_PokeIcons: an icon on the wheel tinted with its row's colour (its own palette's 5 colours of that row). */
const FLASH_ICONS: RouletteFlashSettings[] = [
  { color: RGB(31, 31, 20), paletteOffset: 256 + 1, numColors: 5, delay: 30, numFadeCycles: 14 },
  { color: RGB(27, 31, 31), paletteOffset: 256 + 6, numColors: 5, delay: 30, numFadeCycles: 14 },
  { color: RGB(31, 27, 31), paletteOffset: 256 + 11, numColors: 5, delay: 30, numFadeCycles: 14 },
];
/** The 4 Pokémon's sprite palettes (their icons on the wheel): the slots LoadSpritePalettes gives them. */
export const ROULETTE_POKEMON_PALETTE_SLOTS = [8, 9, 10, 11] as const;

const emptyFlash = (): RouletteFlashPalette => ({ state: 0, available: false, delayCounter: 0, fadeCycleCounter: 0, colorDelta: 0, settings: { color: 0, paletteOffset: 0, numColors: 0, delay: 0, numFadeCycles: 0 } });
function flashReset(util: RouletteFlashUtil) {
  util.enabled = 0;
  util.flags = 0;
  util.palettes = Array.from({ length: 16 }, emptyFlash);
}
function flashAdd(util: RouletteFlashUtil, id: number, settings: RouletteFlashSettings) {
  const p = util.palettes[id];
  if (!p || p.available) return;
  Object.assign(p, { settings: { ...settings }, state: 0, available: true, fadeCycleCounter: 0, delayCounter: 0, colorDelta: 1 });
}
function flashEnable(util: RouletteFlashUtil, flags: number) {
  util.enabled = u8(util.enabled + 1);
  util.palettes.forEach((p, i) => {
    if ((flags >> i) & 1 && p.available) {
      util.flags |= 1 << i;
      p.state = 1;
    }
  });
}
function flashStop(util: RouletteFlashUtil, flags: number, palette?: RoulettePalette) {
  util.palettes.forEach((p, i) => {
    if ((util.flags >> i) & 1 && p.available && (flags >> i) & 1) {
      if (palette) for (let c = 0; c < p.settings.numColors; c++) palette.faded[p.settings.paletteOffset + c] = palette.unfaded[p.settings.paletteOffset + c]!;
      Object.assign(p, { state: 0, fadeCycleCounter: 0, delayCounter: 0, colorDelta: 1 });
    }
  });
  if (flags === 0xffff) {
    util.enabled = 0;
    util.flags = 0;
  } else util.flags &= ~flags;
}
/** RouletteFlash_Run: each flashing entry's step, every `delay` + 1 frames. */
function flashRun(util: RouletteFlashUtil, palette?: RoulettePalette) {
  if (!util.enabled) return;
  util.palettes.forEach((p, i) => {
    if (!((util.flags >> i) & 1)) return;
    p.delayCounter = u8(p.delayCounter - 1);
    if (p.delayCounter !== 0xff) return;
    const { paletteOffset, numColors } = p.settings;
    if (p.settings.color & USE_EXISTING_COLOR) {
      // Fade each colour a step brighter (state 1), then back to its own (state 2).
      if (palette) {
        for (let c = 0; c < numColors; c++) {
          const fc = palette.faded[paletteOffset + c]!;
          const uc = palette.unfaded[paletteOffset + c]!;
          const parts = [fc & 31, (fc >> 5) & 31, (fc >> 10) & 31];
          const own = [uc & 31, (uc >> 5) & 31, (uc >> 10) & 31];
          const next = parts.map((v, k) => {
            const n = v + p.colorDelta;
            if (p.state === 1) return n >= 0 && n < 32 ? n : v;
            if (p.state === 2) return p.colorDelta < 0 ? (n >= own[k]! ? n : v) : n <= own[k]! ? n : v;
            return v;
          });
          palette.faded[paletteOffset + c] = next[0]! | (next[1]! << 5) | (next[2]! << 10);
        }
      }
      if (p.fadeCycleCounter++ === p.settings.numFadeCycles) {
        p.fadeCycleCounter = 0;
        p.colorDelta *= -1;
        p.state = p.state === 1 ? 2 : p.state - 1;
      }
    } else if (p.state === 1) {
      if (palette) for (let c = 0; c < numColors; c++) palette.faded[paletteOffset + c] = p.settings.color;
      p.state = 2;
    } else if (p.state === 2) {
      if (palette) for (let c = 0; c < numColors; c++) palette.faded[paletteOffset + c] = palette.unfaded[paletteOffset + c]!;
      p.state = 1;
    }
    p.delayCounter = p.settings.delay;
  });
}

// ---- Sprites ----

/** An animation command: a frame (its first tile in the sheet, its frames shown, flipped), a jump back, or the end. */
type AnimCmd = { tile: number; duration: number; hFlip?: boolean } | { jump: number } | 'end';
const frames = (duration: number, ...tiles: number[]): AnimCmd[] => tiles.map((tile) => ({ tile, duration }));
/** sAnims_Ball: rolling fast, medium and slow, coming to rest from each of the rolling frames, and still. */
const BALL_ANIMS: AnimCmd[][] = [
  [...frames(5, 0, 4, 8, 4), { jump: 0 }],
  [...frames(10, 0, 4, 8, 4), { jump: 0 }],
  [...frames(15, 0, 4, 8, 4), { jump: 0 }],
  [{ tile: 4, duration: 2 }, ...frames(5, 8, 4, 12), 'end'],
  [{ tile: 8, duration: 2 }, ...frames(5, 4, 0, 12), 'end'],
  [{ tile: 4, duration: 2 }, ...frames(4, 0, 4, 8, 12), 'end'],
  [{ tile: 0, duration: 2 }, ...frames(5, 4, 8, 12), 'end'],
  [{ tile: 0, duration: 2 }, ...frames(5, 4, 8, 12), 'end'],
  [{ tile: 12, duration: 0 }, 'end'],
];
/** sAnims_Shroomish, sAnims_Taillow (wings down, flapping slowly, flapping fast; left then right) and the shadows'. */
const MON_ANIMS: Record<'shroomish' | 'taillow' | 'ballShadow' | 'monShadow', AnimCmd[][]> = {
  shroomish: [[...frames(6, 0, 16, 32, 48, 32, 64), { jump: 2 }]],
  taillow: [
    [{ tile: 80, duration: 10 }, 'end'],
    [{ tile: 80, duration: 10, hFlip: true }, 'end'],
    [...frames(20, 80, 96), { jump: 0 }],
    [{ tile: 80, duration: 20, hFlip: true }, { tile: 96, duration: 20, hFlip: true }, { jump: 0 }],
    [...frames(10, 80, 96), { jump: 0 }],
    [{ tile: 80, duration: 10, hFlip: true }, { tile: 96, duration: 10, hFlip: true }, { jump: 0 }],
  ],
  ballShadow: [[{ tile: 0, duration: 0 }, 'end']],
  monShadow: [[{ tile: 4, duration: 0 }, 'end']],
};
/** sAffineAnim_TaillowShadow: its scale's steps (x, y, frames) as Taillow flies off. */
const TAILLOW_SHADOW_AFFINE: [number, number, number][] = [[-2, 0, 15], [-1, -2, 15], [-1, -5, 24]];

export type RouletteBallCallback =
  | 'dummy'
  | 'rollStart'
  | 'rollFast'
  | 'rollMedium'
  | 'rollSlow'
  | 'tryLand'
  | 'tryLandAdjacent'
  | 'landInSlot'
  | 'unstick'
  | 'unstickShroomish'
  | 'shroomishBallFall'
  | 'unstickTaillow'
  | 'taillowPickUp'
  | 'taillowDrop';
export type RouletteMonCallback =
  | 'dummy'
  | 'shroomish'
  | 'shroomishFall'
  | 'shroomishExit'
  | 'shroomishShakeScreen'
  | 'taillow'
  | 'taillowFlyIn'
  | 'taillowPickUpBall'
  | 'taillowFlyAway'
  | 'taillowShadowFlyIn'
  | 'taillowShadowFlash';

export type RouletteSpriteKind = 'ball' | 'shroomish' | 'ballShadow' | 'monShadow' | 'taillow' | 'taillowShadow';

/** A sprite the game moves frame by frame (the balls, Shroomish, Taillow and their shadows), as the GBA's sprite engine keeps it. */
export interface RouletteSprite {
  kind: RouletteSpriteKind;
  inUse: boolean;
  x: number;
  y: number;
  x2: number;
  y2: number;
  invisible: boolean;
  /** Moved with the screen's sprite offset (gSpriteCoordOffsetX/Y). */
  coordOffset: boolean;
  /** Drawn see-through (OBJ blend: Shroomish's shadow). */
  blend: boolean;
  /** Drawn behind the sprites with a lower one (CreateSprite's subpriority). */
  subpriority: number;
  callback: RouletteBallCallback | RouletteMonCallback;
  data: number[];
  animNum: number;
  animCmdIndex: number;
  animDelayCounter: number;
  animBeginning: boolean;
  animEnded: boolean;
  animPaused: boolean;
  /** The frame shown: its first tile in the sheet, flipped. */
  tile: number;
  hFlip: boolean;
  affineAnimPaused: boolean;
  /** Taillow's shadow's scale (256 its size), shrinking as Taillow flies off. */
  xScale: number;
  yScale: number;
  affineCmd: number;
  affineDelay: number;
}

function newSprite(kind: RouletteSpriteKind, x: number, y: number, subpriority: number, callback: RouletteSprite['callback']): RouletteSprite {
  return {
    kind,
    inUse: true,
    x,
    y,
    x2: 0,
    y2: 0,
    invisible: false,
    coordOffset: false,
    blend: false,
    subpriority,
    callback,
    data: [0, 0, 0, 0, 0, 0, 0, 0],
    animNum: 0,
    animCmdIndex: 0,
    animDelayCounter: 0,
    animBeginning: true,
    animEnded: false,
    animPaused: false,
    tile: 0,
    hFlip: false,
    affineAnimPaused: false,
    xScale: 256,
    yScale: 256,
    affineCmd: -1,
    affineDelay: 0,
  };
}

const animsOf = ({ kind }: RouletteSprite) => (kind === 'ball' ? BALL_ANIMS : MON_ANIMS[kind === 'taillowShadow' ? 'monShadow' : kind]);

function startSpriteAnim(sp: RouletteSprite, animNum: number) {
  sp.animNum = animNum;
  sp.animBeginning = true;
  sp.animEnded = false;
}

/** AnimateSprite: BeginAnim, or ContinueAnim (a frame's delay, the next command), and Taillow's shadow's affine animation. */
function animateSprite(sp: RouletteSprite) {
  const anim = animsOf(sp)[sp.animNum]!;
  const show = (cmd: AnimCmd) => {
    if (typeof cmd !== 'object' || !('tile' in cmd)) return;
    sp.animDelayCounter = cmd.duration ? cmd.duration - 1 : 0;
    sp.tile = cmd.tile;
    sp.hFlip = !!cmd.hFlip;
  };
  if (sp.animBeginning) {
    sp.animCmdIndex = 0;
    sp.animEnded = false;
    sp.animBeginning = false;
    show(anim[0]!);
  } else if (sp.animDelayCounter) {
    if (!sp.animPaused) sp.animDelayCounter--;
  } else if (!sp.animPaused) {
    sp.animCmdIndex++;
    const cmd = anim[sp.animCmdIndex]!;
    if (cmd === 'end') {
      sp.animCmdIndex--;
      sp.animEnded = true;
    } else if ('jump' in cmd) {
      sp.animCmdIndex = cmd.jump;
      show(anim[sp.animCmdIndex]!);
    } else show(cmd);
  }
  if (sp.kind === 'taillowShadow' && !sp.affineAnimPaused) {
    if (sp.affineDelay) sp.affineDelay--;
    else if (sp.affineCmd + 1 < TAILLOW_SHADOW_AFFINE.length) sp.affineDelay = TAILLOW_SHADOW_AFFINE[++sp.affineCmd]![2];
    const step = TAILLOW_SHADOW_AFFINE[sp.affineCmd];
    if (step && sp.affineDelay) {
      sp.xScale += step[0];
      sp.yScale += step[1];
    }
  }
}

// ---- The game ----

export type RouletteTask =
  | 'fieldEntry'
  | 'fieldShowYesNo'
  | 'fieldYesNo'
  | 'fieldNotEnough'
  | 'fieldFade'
  | 'load'
  | 'startPlaying'
  | 'askKeepPlaying'
  | 'keepPlayingYesNo'
  | 'continuePlaying'
  | 'stopPlaying'
  | 'selectFirstEmptySquare'
  | 'startHandleBetGridInput'
  | 'handleBetGridInput'
  | 'placeBet'
  | 'startSpin'
  | 'slideGridOffscreen'
  | 'initBallRoll'
  | 'rollBall'
  | 'recordBallHit'
  | 'slideGridOnscreen'
  | 'flashBallOnWinningSquare'
  | 'printSpinResult'
  | 'tryIncrementWins'
  | 'printPayout'
  | 'givePayout'
  | 'endTurn'
  | 'tryPrintEndTurnMsg'
  | 'clearBoard'
  | 'exitRoulette'
  | 'waitForNextTask'
  | 'gone';

export interface RouletteGame {
  /** The table: 0 the left (a bet is 1 coin), 1 the right (3). */
  tableId: 0 | 1;
  minBet: number;
  /** The local hour (gLocalTime.hours, read as the table is sat at): it changes how far the ball travels and where it starts. */
  hours: number;
  /** Shroomish (1) and Taillow (2) in the party (partySpeciesFlags): never, here. */
  partySpeciesFlags: number;
  /** What's on screen: the Game Corner (the table's question, over the field), the roulette loading, or the roulette. */
  screen: 'field' | 'load' | 'game';
  frame: number;
  task: RouletteTask;
  loadState: number;
  // The play task's data (tMultiplier, tSelectionId, tWonBet, tBallNum, tTotalBallNum, tConsecutiveWins, tWinningSquare, tCoins; data[1], data[7]).
  data1: number;
  data7: number;
  multiplier: number;
  selectionId: number;
  wonBet: boolean;
  ballNum: number;
  totalBallNum: number;
  consecutiveWins: number;
  winningSquare: number;
  /** The coins as the game counts them (tCoins). */
  coins: number;
  // StartTaskAfterDelayOrInput.
  nextTask: RouletteTask | null;
  taskWaitDelay: number;
  taskWaitKey: 'ab' | 'any' | 'none';
  /** The spinning wheel's task (destroyed as the player leaves). */
  spinning: boolean;
  // sRoulette.
  hitFlags: number;
  hitSquares: number[];
  pokeHits: number[];
  colorHits: number[];
  betSelection: number;
  wheelDelayTimer: number;
  wheelSpeed: number;
  wheelDelay: number;
  /** The wheel's angle, 0-359 (it turns anticlockwise: it goes down). */
  wheelAngle: number;
  /** How far the grid has slid off to the right (BG 1's scroll and its sprites'). */
  gridX: number;
  ballStuck: boolean;
  ballUnstuck: boolean;
  useTaillow: boolean;
  shroomishShadowTimer: number;
  /** BLDALPHA while Shroomish's shadow shows (EVB << 8 | EVA). */
  shroomishShadowAlpha: number;
  curBallSpriteId: number;
  ballState: number;
  hitSlot: number;
  stuckHitSlot: number;
  ballTravelDist: number;
  ballTravelDistFast: number;
  ballTravelDistMed: number;
  ballTravelDistSlow: number;
  ballAngle: number;
  ballAngleSpeed: number;
  ballAngleAccel: number;
  ballDistToCenter: number;
  ballFallSpeed: number;
  ballFallAccel: number;
  varA0: number;
  /** The sprite offset (gSpriteCoordOffsetX/Y): the wheel slides with it, Shroomish shakes the screen with it. */
  offsetX: number;
  offsetY: number;
  /** The 6 balls on the wheel (sprites 0-5), and Shroomish or Taillow and their shadows when they come (sprites 54-56). */
  balls: RouletteSprite[];
  mons: RouletteSprite[];
  /** The ball rolling (sRoulette->ball). */
  ball: number;
  flash: RouletteFlashUtil;
  // What the screen shows (the sprites and tilemaps the game sets).
  /** The credit (SetCreditDigits). */
  credit: number;
  /** The multiplier's frame (0 none, 1-4 ×3, ×4, ×6, ×12) and where it is (it follows the grid but stops short as it slides off). */
  multiplierAnim: number;
  multiplierFollows: boolean;
  multiplierX2: number;
  /** The ball counter's 3 sprites' frames (2 balls each), and whether they show. */
  ballCounter: number[];
  ballCounterShown: boolean;
  /** The grid's icons (by slot) and headers (12-15 the Pokémon, 16-18 the colours) hidden. */
  gridIconHidden: boolean[];
  /** The balls on the grid: hidden, and their places (sprite centres). */
  gridBalls: { hidden: boolean; x: number; y: number }[];
  /** The winning square's cursor. */
  winCursor: { hidden: boolean; x: number; y: number };
  /** The wheel's icons (by slot) hidden (a slot hit this round). */
  wheelIconHidden: boolean[];
  /** The Pokémon header filled in (its column selected), or -1. */
  litHeader: number;
  /** The selection highlighted on the grid (BG 1), and the selection's flashing box (BG 0), when it shows. */
  gridHighlight: number;
  rectShown: boolean;
  rectSelection: number;
  /** The message window's text (lines), the yes/no window's cursor (0 yes), the field's coin window. */
  message: string[] | null;
  yesNo: number | null;
  coinsWindow: number | null;
  /** The screen's darkness, 0-16 (the palette fades). */
  darkness: number;
  fade: { mode: 'hardware' | 'normal'; y: number; target: number; finishing: boolean; active: boolean } | null;
  // The sound engine's players, for IsSEPlaying and a sound's priority (m4a); the fanfare's countdown.
  players: Record<'se1' | 'se2', { song: RouletteSoundName; priority: number; ends: number } | null>;
  fanfare: number | null;
}

/** The buttons newly pressed this frame; or a square of the grid clicked (it's selected and A pressed), or the yes/no window's answer clicked. */
export interface RouletteInput {
  a?: boolean;
  b?: boolean;
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  select?: number;
  answer?: 'yes' | 'no';
}

export type RouletteEvent =
  | { type: 'sound'; name: RouletteSoundName }
  | { type: 'stopSound'; name: RouletteSoundName }
  | { type: 'cry'; species: 'taillow' | 'shroomish' }
  | { type: 'fanfare'; name: RouletteSoundName }
  | { type: 'fanfareEnd' }
  /** A ball's outcome: the coins bet and paid back (0 for a loss). */
  | { type: 'round'; bet: number; payout: number }
  /** The player has left the table. */
  | { type: 'exit' };

/** A table sat at with `coins` (PlayRoulette): the question of the minimum wager, then the roulette. */
export function newRouletteGame(table: 0 | 1, coins: number, hours: number): RouletteGame {
  const t = TABLES[table]!;
  const flash: RouletteFlashUtil = { enabled: 0, flags: 0, palettes: [] };
  flashReset(flash);
  const ball = () => ({ ...newSprite('ball', 116, 80, 0, 'dummy'), invisible: true, coordOffset: true });
  return {
    tableId: table,
    minBet: ROULETTE_MIN_BETS[table],
    hours,
    partySpeciesFlags: 0,
    screen: 'field',
    frame: 0,
    task: 'fieldEntry',
    loadState: 0,
    data1: 0,
    data7: 0,
    multiplier: 0,
    selectionId: 0,
    wonBet: false,
    ballNum: 0,
    totalBallNum: 0,
    consecutiveWins: 0,
    winningSquare: 0,
    coins: Math.max(0, Math.min(MAX_COINS, coins)),
    nextTask: null,
    taskWaitDelay: 0,
    taskWaitKey: 'none',
    spinning: false,
    hitFlags: 0,
    hitSquares: Array(ROULETTE_BALLS).fill(0),
    pokeHits: Array(NUM_BOARD_POKES).fill(0),
    colorHits: Array(NUM_BOARD_COLORS).fill(0),
    betSelection: 0,
    wheelDelayTimer: 0,
    wheelSpeed: t.wheelSpeed,
    wheelDelay: t.wheelDelay,
    wheelAngle: 0,
    gridX: 0,
    ballStuck: false,
    ballUnstuck: false,
    useTaillow: false,
    shroomishShadowTimer: 0,
    shroomishShadowAlpha: 0,
    curBallSpriteId: 0,
    ballState: 0,
    hitSlot: 0,
    stuckHitSlot: 0,
    ballTravelDist: 0,
    ballTravelDistFast: 0,
    ballTravelDistMed: 0,
    ballTravelDistSlow: 0,
    ballAngle: 0,
    ballAngleSpeed: 0,
    ballAngleAccel: 0,
    ballDistToCenter: 0,
    ballFallSpeed: 0,
    ballFallAccel: 0,
    varA0: 0,
    offsetX: 0,
    offsetY: 0,
    balls: Array.from({ length: ROULETTE_BALLS }, (_, i) => ({ ...ball(), subpriority: 57 - i })),
    mons: [],
    ball: 0,
    flash,
    credit: 0,
    multiplierAnim: 0,
    multiplierFollows: true,
    multiplierX2: 0,
    ballCounter: [0, 0, 0],
    ballCounterShown: false,
    gridIconHidden: Array(NUM_GRID_SELECTIONS).fill(false),
    gridBalls: Array.from({ length: ROULETTE_BALLS }, () => ({ hidden: true, x: 116, y: 20 })),
    winCursor: { hidden: true, x: 152, y: 96 },
    wheelIconHidden: Array(ROULETTE_SLOTS).fill(false),
    litHeader: -1,
    gridHighlight: 0,
    rectShown: false,
    rectSelection: 0,
    message: null,
    yesNo: null,
    coinsWindow: null,
    darkness: 0,
    fade: null,
    players: { se1: null, se2: null },
    fanfare: null,
  };
}

/** The multiplier the selection pays now (GetMultiplier): ×3, ×4, ×6, ×12 for a row with 0-3 of its squares hit, ×4, ×6, ×12 for a column with 0-2; ×12 a square; 0 when it can't be bet on. */
export function rouletteMultiplier(game: Pick<RouletteGame, 'hitFlags' | 'pokeHits' | 'colorHits'>, selectionId: number) {
  const multipliers = [0, 3, 4, 6, MAX_MULTIPLIER];
  const id = selectionId > NUM_GRID_SELECTIONS ? 0 : selectionId;
  switch (ROULETTE_GRID[id]!.baseMultiplier) {
    case NUM_BOARD_COLORS: {
      const hits = game.colorHits[ROW_IDX(id)]!;
      return hits >= NUM_BOARD_POKES ? 0 : multipliers[hits + 1]!;
    }
    case NUM_BOARD_POKES: {
      const hits = game.pokeHits[id - 1]!;
      return hits >= NUM_BOARD_COLORS ? 0 : multipliers[hits + 2]!;
    }
    case ROULETTE_SLOTS:
      return game.hitFlags & ROULETTE_GRID[id]!.flag ? 0 : multipliers[4]!;
  }
  return 0;
}

/** GetMultiplierAnimId: the multiplier sprite's frame (the same as GetMultiplier, its checks a little different). */
function multiplierAnimId(game: RouletteGame, selectionId: number) {
  const id = selectionId > NUM_GRID_SELECTIONS ? 0 : selectionId;
  switch (ROULETTE_GRID[id]!.baseMultiplier) {
    case NUM_BOARD_COLORS: {
      const hits = game.colorHits[ROW_IDX(id)]!;
      return hits > 3 ? 0 : hits + 1;
    }
    case NUM_BOARD_POKES: {
      const hits = game.pokeHits[id - 1]!;
      return hits > 2 ? 0 : hits + 2;
    }
    case ROULETTE_SLOTS:
      return game.hitFlags & ROULETTE_GRID[id]!.flag ? 0 : 4;
  }
  return 0;
}

/** The game's frame, with what it played and settled: a context passed round the port's functions. */
interface Frame {
  g: RouletteGame;
  input: RouletteInput;
  random: Random16;
  palette?: RoulettePalette;
  events: RouletteEvent[];
}

const pressedA = (fr: Frame) => !!fr.input.a;
const pressedAB = (fr: Frame) => !!(fr.input.a || fr.input.b);
const pressedAny = (fr: Frame) => !!(fr.input.a || fr.input.b || fr.input.up || fr.input.down || fr.input.left || fr.input.right);

/** m4aSongNumStart / PlaySE: on its player, unless a sound of higher priority is playing there. */
function playSE(fr: Frame, name: RouletteSoundName) {
  const [player, priority, length] = ROULETTE_SOUNDS[name];
  const current = fr.g.players[player];
  if (current && current.ends > fr.g.frame && current.priority > priority) return;
  fr.g.players[player] = { song: name, priority, ends: fr.g.frame + length };
  fr.events.push({ type: 'sound', name });
}
/** m4aSongNumStartOrChange: started unless it's already playing. */
function playSEOrChange(fr: Frame, name: RouletteSoundName) {
  const current = fr.g.players[ROULETTE_SOUNDS[name][0]];
  if (current?.song === name && current.ends > fr.g.frame) return;
  playSE(fr, name);
}
/** m4aSongNumStop: stops it if it's what its player plays. */
function stopSE(fr: Frame, name: RouletteSoundName) {
  const player = ROULETTE_SOUNDS[name][0];
  if (fr.g.players[player]?.song !== name) return;
  fr.g.players[player] = null;
  fr.events.push({ type: 'stopSound', name });
}
const isSEPlaying = (g: RouletteGame) => (['se1', 'se2'] as const).some((p) => (g.players[p]?.ends ?? 0) > g.frame);
function playFanfare(fr: Frame, name: RouletteSoundName) {
  fr.g.fanfare = FANFARE_FRAMES[name]!;
  playSE(fr, name);
  fr.events.push({ type: 'fanfare', name });
}

function startTaskAfterDelayOrInput(g: RouletteGame, task: RouletteTask, delay: number, key: 'ab' | 'none') {
  g.nextTask = task;
  g.taskWaitDelay = delay;
  g.taskWaitKey = delay === NO_DELAY && key === 'none' ? 'any' : key;
  g.task = 'waitForNextTask';
}

function showMessage(g: RouletteGame, ...lines: string[]) {
  g.message = lines;
}

// The grid (the sprites and tilemaps its functions set).

function showHideGridIcons(g: RouletteGame, hideAll: boolean, hideSquare: number) {
  if (hideAll) {
    g.gridIconHidden.fill(true);
    return;
  }
  for (let i = 0; i < ROULETTE_SLOTS; i++) g.gridIconHidden[i] = !!(g.hitFlags & SLOTS[i]!.flag) && SLOTS[i]!.gridSquare !== u8(hideSquare);
  for (let i = ROULETTE_SLOTS; i < NUM_GRID_SELECTIONS; i++) g.gridIconHidden[i] = false;
}

function showHideGridBalls(g: RouletteGame, hideAll: boolean, hideBallId: number) {
  g.gridBalls.forEach((ball, i) => {
    if (hideAll || !g.hitSquares[i] || i === u8(hideBallId)) ball.hidden = true;
    else {
      const square = ROULETTE_GRID[g.hitSquares[i]!]!;
      Object.assign(ball, { hidden: false, x: (square.x + 1) * 8 + 4, y: (square.y + 1) * 8 + 3 });
    }
  });
}

function showHideWinSlotCursor(g: RouletteGame, selectionId: number) {
  if (!selectionId) g.winCursor.hidden = true;
  else g.winCursor = { hidden: false, x: (ROULETTE_GRID[selectionId]!.x + 2) * 8, y: (ROULETTE_GRID[selectionId]!.y + 2) * 8 };
}

function drawGridBackground(g: RouletteGame, selectionId: number) {
  showHideGridIcons(g, false, 0);
  g.gridHighlight = selectionId;
}

function setBallCounterNumLeft(g: RouletteGame, numBalls: number) {
  const t = g.minBet === 1 ? 2 : 0;
  switch (numBalls) {
    case 6:
      g.ballCounterShown = true;
      g.ballCounter = [0, 0, 0];
      break;
    case 5:
      g.ballCounter[2] = t + 1;
      break;
    case 4:
      g.ballCounter[2] = t + 2;
      break;
    case 3:
      g.ballCounter[1] = t + 1;
      break;
    case 2:
      g.ballCounter[1] = t + 2;
      break;
    case 1:
      g.ballCounter[0] = t + 1;
      break;
    default:
      g.ballCounter = [t + 2, t + 2, t + 2];
  }
}

function resetBallDataForNewSpin(g: RouletteGame) {
  g.ballStuck = false;
  g.ballUnstuck = false;
  g.useTaillow = false;
  g.betSelection = 0;
  g.data1 = 0;
}

function resetHits(g: RouletteGame) {
  g.hitFlags = 0;
  g.hitSquares.fill(0);
  g.pokeHits.fill(0);
  g.colorHits.fill(0);
  showHideGridBalls(g, true, -1);
}

function hideWheelBalls(g: RouletteGame) {
  for (const ball of g.balls) {
    ball.invisible = true;
    ball.callback = 'dummy';
    startSpriteAnim(ball, 0);
    ball.data.fill(0);
  }
}

/** RecordHit: the slot the ball fell into marked hit (and a column or row whose squares are all hit); its grid square. */
function recordHit(g: RouletteGame, slotId: number) {
  if (slotId >= ROULETTE_SLOTS) return 0;
  const slot = SLOTS[slotId]!;
  const columnFlags = [1, 2, 3, 4].map((c) => ROULETTE_GRID[c]!.inSelectionFlags);
  const rowFlags = [ROW_ORANGE, ROW_GREEN, ROW_PURPLE].map((r) => ROULETTE_GRID[r]!.inSelectionFlags);
  g.hitSquares[u8(g.ballNum - 1)] = slot.gridSquare;
  g.winningSquare = slot.gridSquare;
  g.hitFlags |= slot.flag;
  for (let i = 0; i < NUM_BOARD_POKES; i++) {
    if (slot.flag & columnFlags[i]!) g.pokeHits[i]!++;
    if (g.pokeHits[i]! >= NUM_BOARD_COLORS) g.hitFlags |= columnFlags[i]!;
  }
  for (let j = 0; j < NUM_BOARD_COLORS; j++) {
    if (slot.flag & rowFlags[j]!) g.colorHits[j]!++;
    if (g.colorHits[j]! >= NUM_BOARD_POKES) g.hitFlags |= rowFlags[j]!;
  }
  return slot.gridSquare;
}

/** IsHitInBetSelection: whether the square hit is in the selection bet on. */
function isHitInBetSelection(gridSquare: number, betSelection: number) {
  if (u8(gridSquare - 1) >= NUM_GRID_SELECTIONS) return false;
  switch (selectionKind(betSelection)) {
    case null:
      return false; // "should never happen": it returns 3, which is taken as a miss
    case 'column':
      return gridSquare === betSelection + ROW_ORANGE || gridSquare === betSelection + ROW_GREEN || gridSquare === betSelection + ROW_PURPLE;
    case 'row':
      return gridSquare >= betSelection + 1 && gridSquare <= betSelection + 4;
    default:
      return gridSquare === betSelection;
  }
}

/** FlashSelectionOnWheel: the slots (their colours, the icons) of the selection flashing on the wheel. */
function flashSelectionOnWheel(g: RouletteGame, selectionId: number) {
  let flashFlags = 0;
  if (selectionKind(selectionId) === 'row') {
    for (let i = selectionId + 1; i < selectionId + 5; i++) if (!(g.hitFlags & ROULETTE_GRID[i]!.flag)) flashFlags |= ROULETTE_GRID[i]!.flashFlags;
    flashEnable(g.flash, flashFlags & ~F_FLASH_ICON);
    return;
  }
  const iconFlash = FLASH_ICONS.map((s) => ({ ...s }));
  let numSelected = selectionId >= 1 && selectionId <= 4 ? NUM_BOARD_COLORS : 1;
  // The icons of a Pokémon share a palette: its slot's colours (PLTT_ID of the sprite's palette).
  const palOffset = COL(selectionId) ? 16 * ROULETTE_POKEMON_PALETTE_SLOTS[COL(selectionId) - 1]! : ROW_IDX(selectionId);
  if (numSelected === 1) {
    if (g.hitFlags & ROULETTE_GRID[selectionId]!.flag) return;
    iconFlash[ROW_IDX(selectionId)]!.paletteOffset += palOffset;
    flashAdd(g.flash, ROULETTE_SLOTS + 1, iconFlash[ROW_IDX(selectionId)]!);
  } else {
    for (let i = 0; i < NUM_BOARD_COLORS; i++) {
      const square = i * 5 + selectionId + 5;
      if (!(g.hitFlags & ROULETTE_GRID[square]!.flag)) {
        iconFlash[ROW_IDX(square)]!.paletteOffset += palOffset;
        flashAdd(g.flash, i + ROULETTE_SLOTS + 1, iconFlash[ROW_IDX(square)]!);
        if (numSelected === 3) flashFlags = ROULETTE_GRID[square]!.flashFlags;
        numSelected--;
      }
    }
    if (numSelected !== 2) flashFlags = 0;
  }
  flashEnable(g.flash, flashFlags | ROULETTE_GRID[selectionId]!.flashFlags);
}

function iconsUnavailable(g: RouletteGame) {
  for (const id of [FLASH_ICON, FLASH_ICON + 1, FLASH_ICON + 2]) g.flash.palettes[id]!.available = false;
}

/** CanMoveSelectionInDir: the selection moved up, down, left or right, round its column or row. */
function canMoveSelectionInDir(g: RouletteGame, dir: 0 | 1 | 2 | 3) {
  const original = g.selectionId;
  let low: number;
  let high: number;
  if (dir < 2) {
    low = COL(g.selectionId);
    high = low + ROW_PURPLE;
    if (low === 0) low = 5;
  } else {
    low = ROW(g.selectionId);
    high = low + 4;
    if (low === 0) low = 1;
  }
  g.selectionId += [-5, 5, -1, 1][dir]!;
  if (g.selectionId < low) g.selectionId = high;
  if (g.selectionId > high) g.selectionId = low;
  return g.selectionId !== original;
}

/** The selection changed (ProcessBetGridInput's moves, or a square clicked): redrawn, its multiplier, its slots flashing. */
function selectionMoved(fr: Frame) {
  const g = fr.g;
  drawGridBackground(g, g.selectionId);
  g.multiplierAnim = multiplierAnimId(g, g.selectionId);
  g.rectSelection = g.selectionId;
  g.data1 = 0;
  playSE(fr, 'se_select');
  flashStop(g.flash, 0xffff, fr.palette);
  iconsUnavailable(g);
  flashSelectionOnWheel(g, g.selectionId);
  g.litHeader = -1;
  if (u16(g.selectionId - 1) < 4 && !(g.hitFlags & ROULETTE_GRID[g.selectionId]!.flag)) g.litHeader = g.selectionId - 1;
}

function processBetGridInput(fr: Frame) {
  const { input, g } = fr;
  if (input.select !== undefined && ROULETTE_GRID[input.select] && input.select !== 0) {
    if (input.select !== g.selectionId) {
      g.selectionId = input.select;
      selectionMoved(fr);
    }
    return;
  }
  let dirPressed = false;
  const dirs = [input.up, input.down, input.left, input.right];
  for (let dir = 0; dir < 4; dir++) {
    if (!dirs[dir]) continue;
    dirPressed = true;
    if (!canMoveSelectionInDir(g, dir as 0 | 1 | 2 | 3)) return;
  }
  if (dirPressed) selectionMoved(fr);
}

/** Menu_ProcessInputNoWrapClearOnChoose on the yes/no window: 0 yes, 1 no, -1 B, null nothing chosen. */
function yesNoInput(fr: Frame): number | null {
  const g = fr.g;
  if (fr.input.answer) {
    g.yesNo = fr.input.answer === 'yes' ? 0 : 1;
    return choose(fr);
  }
  if (fr.input.a) return choose(fr);
  if (fr.input.b) {
    g.yesNo = null;
    return -1;
  }
  if (fr.input.up && g.yesNo !== 0) {
    g.yesNo = 0;
    playSE(fr, 'se_select');
  } else if (fr.input.down && g.yesNo !== 1) {
    g.yesNo = 1;
    playSE(fr, 'se_select');
  }
  return null;
}
function choose(fr: Frame) {
  const cursor = fr.g.yesNo ?? 0;
  playSE(fr, 'se_select');
  fr.g.yesNo = null;
  return cursor;
}

// ---- The ball (its sprite callbacks) ----

/** UpdateBallRelativeWheelAngle: the ball's angle on the wheel (sBallWheelAngle, data[6]). */
function ballWheelAngle(g: RouletteGame, sp: RouletteSprite) {
  if (g.wheelAngle > sp.data[3]!) {
    sp.data[6] = 360 - g.wheelAngle + sp.data[3]!;
    if (sp.data[6]! >= 360) sp.data[6]! -= 360;
  } else sp.data[6] = sp.data[3]! - g.wheelAngle;
  return sp.data[6]!;
}

function updateSlotBelowBall(g: RouletteGame, sp: RouletteSprite) {
  g.hitSlot = u8(Math.trunc(f(ballWheelAngle(g, sp) / DEGREES_PER_SLOT)));
  return g.hitSlot;
}

function ballDistanceToSlotMidpoint(g: RouletteGame, sp: RouletteSprite) {
  const angleIntoSlot = ballWheelAngle(g, sp) % DEGREES_PER_SLOT;
  sp.data[2] = angleIntoSlot === SLOT_MIDPOINT ? 0 : angleIntoSlot >= SLOT_MIDPOINT ? DEGREES_PER_SLOT - 1 + SLOT_MIDPOINT - angleIntoSlot : SLOT_MIDPOINT - angleIntoSlot;
  return sp.data[2]!;
}

/** UpdateBallPos: the ball turned and moved in or out (the game's floats), its sprite placed. */
function updateBallPos(g: RouletteGame, sp: RouletteSprite) {
  g.ballAngleSpeed = f(g.ballAngleSpeed + g.ballAngleAccel);
  g.ballAngle = f(g.ballAngle + g.ballAngleSpeed);
  if (g.ballAngle >= 360) g.ballAngle = f(g.ballAngle - 360);
  else if (g.ballAngle < 0) g.ballAngle = f(g.ballAngle + 360);
  sp.data[3] = s16(Math.trunc(g.ballAngle));
  g.ballFallSpeed = f(g.ballFallSpeed + g.ballFallAccel);
  g.ballDistToCenter = f(g.ballDistToCenter + g.ballFallSpeed);
  sp.data[4] = s16(Math.trunc(g.ballDistToCenter));
  sp.x2 = s16((sin2(sp.data[3]) * sp.data[4]) >> 12);
  sp.y2 = s16((-cos2(sp.data[3]) * sp.data[4]) >> 12);
}

/** LandBall: the ball comes to rest in the slot under it, and turns with the wheel. */
function landBall(fr: Frame, sp: RouletteSprite) {
  const g = fr.g;
  g.ballState = BALL_STATE_LANDED;
  startSpriteAnim(sp, sp.animCmdIndex + 3);
  updateSlotBelowBall(g, sp);
  sp.data[4] = 30;
  ballWheelAngle(g, sp);
  sp.data[6] = Math.trunc(sp.data[6]! / DEGREES_PER_SLOT) * DEGREES_PER_SLOT + 15;
  sp.callback = 'landInSlot';
  playSEOrChange(fr, 'se_bridge_walk');
}

/** SetBallStuck: the ball can't fall in; Shroomish or Taillow (by where it stopped) will move it to a free slot a few along. */
function setBallStuck(fr: Frame, sp: RouletteSprite) {
  const g = fr.g;
  const t = TABLES[g.tableId]!;
  const rand = fr.random();
  g.ballState = 1;
  g.ballStuck = true;
  g.ballUnstuck = false;
  g.hitSlot = 0xff;
  g.ballAngle = f(sp.data[3]!);
  g.ballFallSpeed = 0;
  g.ballAngleSpeed = f(t.var1C);
  let angle = g.tableId * DEGREES_PER_SLOT + 33 + (1 - Number(g.useTaillow)) * 15;
  for (let i = 0; i < 4; i++) {
    if (angle < sp.data[3]! && sp.data[3]! <= angle + 90) {
      sp.data[0] = Math.trunc(i / 2);
      g.useTaillow = i % 2 === 1;
      break;
    }
    if (i === 3) {
      sp.data[0] = 1;
      g.useTaillow = true;
      break;
    }
    angle += 90;
  }
  fr.events.push({ type: 'cry', species: g.useTaillow ? 'taillow' : 'shroomish' });
  const slotsToSkip = 2;
  let slotId = (g.stuckHitSlot + 2) % ROULETTE_SLOTS;
  const maxSlotToCheck = 5 + (g.useTaillow && g.tableId === 1 ? 6 : slotsToSkip);
  const candidates: number[] = [];
  let betSlotId = 0;
  for (let i = slotsToSkip; i < maxSlotToCheck; i++) {
    if (!(g.hitFlags & SLOTS[slotId]!.flag)) {
      candidates.push(i);
      if (betSlotId === 0 && SLOTS[slotId]!.flag & ROULETTE_GRID[g.betSelection]!.inSelectionFlags) betSlotId = i;
    }
    slotId = (slotId + 1) % ROULETTE_SLOTS;
  }
  // With the Pokémon in the party, 3 times in 4 the slot bet on (none is, here).
  if ((Number(g.useTaillow) + 1) & g.partySpeciesFlags && betSlotId && rand % 256 < 192) sp.data[7] = betSlotId;
  else sp.data[7] = candidates[rand % candidates.length] ?? slotsToSkip;
  sp.callback = 'unstick';
}

/** CreateShroomishSprite: Shroomish (above the screen), the ball's shadow and Shroomish's (see-through), all hidden. */
function createShroomish(g: RouletteGame, ball: RouletteSprite) {
  const t = TABLES[g.tableId]!;
  const left = ball.data[0]!;
  const mon = newSprite('shroomish', 36, -12, 50, 'dummy');
  const ballShadow = newSprite('ballShadow', 116, left ? 112 : 44, 59, 'dummy');
  const monShadow = { ...newSprite('monShadow', 36, 140, 51, 'shroomish'), blend: true };
  g.mons = [mon, ballShadow, monShadow];
  for (const sp of g.mons) {
    Object.assign(sp, { coordOffset: false, invisible: true, animPaused: true, affineAnimPaused: true });
    sp.data[4] = 0;
    sp.data[5] = 1;
    sp.data[6] = 2;
    sp.data[2] = s16(u16(ball.data[7]! - 2));
    sp.data[3] = s16(ball.data[7]! * t.randDistanceHigh + (t.randDistanceLow + 0xffff));
  }
  ballShadow.coordOffset = true;
}

/** CreateTaillowSprite: Taillow and its shadow, coming in from the side the ball stopped on. */
function createTaillow(g: RouletteGame, ball: RouletteSprite) {
  const t = TABLES[g.tableId]!;
  const left = ball.data[0]!;
  const tt = s16(ball.data[7]! - 2);
  const [x, y] = left ? [-16, 84] : [256, 84];
  const mon = newSprite('taillow', x, y, 50, 'taillow');
  startSpriteAnim(mon, left);
  const shadow = { ...newSprite('taillowShadow', x, y, 51, 'taillow'), affineAnimPaused: true, animPaused: true };
  ball.data[7] = s16(tt * t.randDistanceHigh + (t.taillow.baseDropDelay + 45));
  g.mons = [mon, shadow];
  for (const sp of g.mons) {
    sp.data[4] = 0;
    sp.data[5] = 1;
    sp.data[6] = 1;
    sp.data[2] = tt;
    sp.data[3] = s16(ball.data[7]! - 45);
  }
}

function ballCallback(fr: Frame, sp: RouletteSprite) {
  const g = fr.g;
  const t = TABLES[g.tableId]!;
  switch (sp.callback as RouletteBallCallback) {
    case 'rollStart':
      sp.data[1] = 1;
      sp.data[2] = 0;
      updateBallPos(g, sp);
      sp.invisible = false;
      sp.callback = 'rollFast';
      return;
    case 'rollFast':
      updateBallPos(g, sp);
      if (g.ballDistToCenter > 60) return;
      playSEOrChange(fr, 'se_roulette_ball2');
      g.ballFallSpeed = f(-f(20 / g.ballTravelDistMed));
      g.ballAngleAccel = f(f(1 - g.ballAngleSpeed) / g.ballTravelDistMed);
      Object.assign(sp, { animNum: 1, animBeginning: true, animEnded: false, callback: 'rollMedium' });
      sp.data[1] = 2;
      return;
    case 'rollMedium':
      updateBallPos(g, sp);
      if (g.ballDistToCenter > 40) return;
      g.ballFallSpeed = f(-f(4 / g.ballTravelDistSlow));
      g.ballAngleAccel = f(-f(g.ballAngleSpeed / g.ballTravelDistSlow));
      Object.assign(sp, { animNum: 2, animBeginning: true, animEnded: false, callback: 'rollSlow' });
      sp.data[1] = 3;
      return;
    case 'rollSlow':
      updateBallPos(g, sp);
      if (g.ballAngleSpeed > 0.5) return;
      updateSlotBelowBall(g, sp);
      if (ballDistanceToSlotMidpoint(g, sp) === 0) {
        // Over a slot's middle: it drops in, turning on with the wheel.
        g.ballAngleAccel = 0;
        g.ballAngleSpeed = f(g.ballAngleSpeed - f(t.wheelSpeed / (t.wheelDelay + 1)));
        sp.data[1] = 4;
        sp.callback = 'tryLand';
      } else if (g.ballAngleAccel !== 0 && g.ballAngleSpeed < 0) {
        g.ballAngleAccel = 0;
        g.ballAngleSpeed = 0;
        g.ballFallSpeed = f(g.ballFallSpeed / 1.2);
      }
      return;
    case 'tryLand': {
      updateBallPos(g, sp);
      sp.data[2] = 0;
      updateSlotBelowBall(g, sp);
      if (!(SLOTS[g.hitSlot]!.flag & g.hitFlags)) {
        landBall(fr, sp);
        return;
      }
      // The slot's been hit: it bounces towards the next one, right or left at random.
      playSE(fr, 'se_ball_bounce_1');
      const fallRight = fr.random() & 1;
      let slotId: number;
      if (fallRight) {
        g.ballAngleSpeed = 0;
        g.stuckHitSlot = slotId = (g.hitSlot + 1) % ROULETTE_SLOTS;
      } else {
        g.ballAngleSpeed = f(f(t.var1C) * 2);
        slotId = (g.hitSlot + ROULETTE_SLOTS - 1) % ROULETTE_SLOTS;
        g.stuckHitSlot = g.hitSlot;
      }
      if (SLOTS[slotId]!.flag & g.hitFlags) {
        sp.data[0] = 1;
        sp.data[2] = t.randDistanceLow;
      } else {
        sp.data[0] = 0;
        if (g.tableId) sp.data[2] = t.randDistanceHigh;
        else {
          sp.data[2] = t.randDistanceLow;
          g.ballAngleSpeed = fallRight ? 0.5 : -1.5;
        }
      }
      g.ballFallSpeed = f(0.085);
      sp.callback = 'tryLandAdjacent';
      sp.data[1] = 5;
      return;
    }
    case 'tryLandAdjacent':
      updateBallPos(g, sp);
      if (sp.data[2]!-- === 16) g.ballFallSpeed = f(g.ballFallSpeed * -1);
      if (sp.data[2] === 0) {
        if (!sp.data[0]) landBall(fr, sp);
        else {
          sp.animPaused = true;
          playSE(fr, 'se_ball_bounce_1');
          setBallStuck(fr, sp);
        }
      }
      return;
    case 'landInSlot':
      sp.data[3] = g.wheelAngle + sp.data[6]!;
      if (sp.data[3]! >= 360) sp.data[3]! -= 360;
      sp.x2 = s16((sin2(sp.data[3]!) * sp.data[4]!) >> 12);
      // The screen's shake is added here as well as to the sprite's place (the game's, twice over).
      sp.y2 = s16(((-cos2(sp.data[3]!) * sp.data[4]!) >> 12) + g.offsetY);
      return;
    case 'unstick':
      updateBallPos(g, sp);
      if (!g.useTaillow) {
        createShroomish(g, sp);
        sp.callback = 'unstickShroomish';
      } else {
        createTaillow(g, sp);
        sp.callback = 'unstickTaillow';
      }
      return;
    case 'unstickShroomish': {
      updateBallPos(g, sp);
      // At the top (or, stuck on the left, the bottom) Shroomish's thump sends the ball flying to its new slot.
      const left = sp.data[0]!;
      if (sp.data[3] === 0 ? left === 1 : sp.data[3] === 180 ? !left : true) return;
      const slotOffset = f(sp.data[7]!);
      const ballFallDist = f(f(slotOffset * t.randDistanceHigh) + (t.randDistanceLow - 1));
      const fallSpeed = sp.data[3] === 0 ? f(slotOffset / t.shroomish.fallSlowdown) : f(-f(slotOffset / t.shroomish.fallSlowdown));
      g.varA0 = g.ballDistToCenter;
      g.ballFallSpeed = fallSpeed;
      g.ballFallAccel = f(-f(f(f(fallSpeed * 2) / ballFallDist) + f(2 / f(ballFallDist * ballFallDist))));
      g.ballAngleSpeed = 0;
      Object.assign(sp, { animPaused: false, animNum: 0, animBeginning: true, animEnded: false, callback: 'shroomishBallFall' });
      sp.data[2] = 0;
      return;
    }
    case 'shroomishBallFall':
      updateBallPos(g, sp);
      sp.data[2]!++;
      sp.invisible = sp.data[4]! < -132 || sp.data[4]! > 80;
      if (sp.data[2]! >= DEGREES_PER_SLOT) {
        const landed = !sp.data[0] ? g.ballDistToCenter <= f(g.varA0 - 2) : g.ballDistToCenter >= f(g.varA0 - 2);
        if (landed) {
          landBall(fr, sp);
          g.ballFallAccel = g.ballFallSpeed = 0;
          g.ballAngleSpeed = -1;
        }
      }
      return;
    case 'unstickTaillow':
      updateBallPos(g, sp);
      if ((sp.data[3] === 90 && sp.data[0] !== 1) || (sp.data[3] === 270 && sp.data[0])) {
        sp.callback = 'taillowPickUp';
        sp.data[2] = 0;
      }
      return;
    case 'taillowPickUp': {
      // Taillow lifts the ball, bobbing with its wings, carries it while the wheel turns, then lets it drop.
      const mon = g.mons[0]!;
      if (sp.data[2]!++ < 45) {
        sp.y2--;
        if (sp.data[2] === 45 && mon.animCmdIndex === 1) sp.y2++;
      } else if (sp.data[2]! < sp.data[7]!) {
        if (mon.animDelayCounter === 0) sp.y2 += mon.animCmdIndex === 1 ? 1 : -1;
      } else {
        Object.assign(sp, { animPaused: false, animNum: 1, animBeginning: true, animEnded: false, callback: 'taillowDrop' });
        sp.data[2] = 0;
        playSE(fr, 'se_ball_throw');
      }
      return;
    }
    case 'taillowDrop':
      sp.y2 = s16(Math.trunc(f(f(sp.data[2]! * f(0.05)) * sp.data[2]!)) - 45);
      sp.data[2]!++;
      if (sp.data[2]! >= DEGREES_PER_SLOT && sp.y2 >= 0) {
        landBall(fr, sp);
        g.ballUnstuck = true;
      }
      return;
  }
}

const SHROOMISH_SHADOW_ALPHAS = [0x907, 0x808, 0x709, 0x60a, 0x50b, 0x40c, 0x30d, 0x20e, 0x10f, 0x010];
const SCREEN_SHAKE = [
  [-1, 0, 1, 0],
  [-2, 0, 2, 0],
  [-3, 0, 3, 0],
];

function destroy(sp: RouletteSprite) {
  sp.inUse = false;
}

function monCallback(fr: Frame, sp: RouletteSprite) {
  const g = fr.g;
  const t = TABLES[g.tableId]!;
  const ball = g.balls[g.ball]!;
  const left = ball.data[0]!;
  const mon = g.mons[sp.data[4]!]!;
  switch (sp.callback as RouletteMonCallback) {
    case 'shroomish':
      // Shroomish's shadow: shows as the ball passes the table's start angle, and Shroomish falls at its drop angle.
      if (sp.data[7] === 0) {
        if (ball.data[3] !== t.shroomish.startAngle + (left ? 180 : 0)) return;
        sp.invisible = false;
        sp.data[7]!++;
        playSE(fr, 'se_fall');
        g.shroomishShadowTimer = 1;
        g.shroomishShadowAlpha = SHROOMISH_SHADOW_ALPHAS[0]!;
      } else {
        g.shroomishShadowAlpha = SHROOMISH_SHADOW_ALPHAS[Math.trunc((g.shroomishShadowTimer - 1) / 2)]!;
        if (g.shroomishShadowTimer < 19) g.shroomishShadowTimer++;
        if (ball.data[3] !== t.shroomish.dropAngle + (left ? 180 : 0)) return;
        mon.callback = 'shroomishFall';
        mon.invisible = false;
        sp.callback = 'dummy';
        sp.data[7] = 0;
      }
      return;
    case 'shroomishFall': {
      sp.data[1]!++;
      const timer = f(sp.data[1]!);
      sp.y2 = s16(Math.trunc(f(f(timer * f(0.039)) * timer)));
      g.shroomishShadowAlpha = SHROOMISH_SHADOW_ALPHAS[Math.trunc((g.shroomishShadowTimer - 1) / 2)]!;
      if (g.shroomishShadowTimer < SHROOMISH_SHADOW_ALPHAS.length * 2 - 1) g.shroomishShadowTimer++;
      if (sp.data[1]! > 60) {
        sp.data[1] = 0;
        sp.callback = 'shroomishExit';
        const monShadow = g.mons[sp.data[6]!]!;
        monShadow.callback = 'shroomishExit';
        monShadow.data[1] = -2;
        const ballShadow = g.mons[sp.data[5]!]!;
        ballShadow.invisible = false;
        ballShadow.callback = 'shroomishShakeScreen';
        playSE(fr, 'se_m_strength');
      }
      return;
    }
    case 'shroomishExit':
      // Waits while the screen shakes, then walks off to the left.
      if (sp.data[1]!++ >= sp.data[3]!) {
        sp.x -= 2;
        if (sp.x < -16) {
          if (!g.ballUnstuck) g.ballUnstuck = true;
          destroy(sp);
          g.shroomishShadowTimer = 0;
          g.shroomishShadowAlpha = SHROOMISH_SHADOW_ALPHAS[0]!;
        }
      }
      return;
    case 'shroomishShakeScreen':
      if (sp.data[1]!++ < sp.data[3]!) {
        if (sp.data[1]! & 1) {
          g.offsetY = SCREEN_SHAKE[Math.trunc(sp.data[2]! / 2)]?.[sp.data[7]!] ?? 0;
          sp.data[7] = (sp.data[7]! + 1) % 4;
        }
        sp.invisible = !sp.invisible;
      } else {
        g.offsetY = 0;
        mon.animPaused = false;
        destroy(sp);
      }
      return;
    case 'taillow': {
      // Taillow and its shadow wait for the ball to come round to the table's angle, then fly in.
      const start = left ? t.taillow.leftStartAngle + 270 : t.taillow.rightStartAngle + 90;
      if (ball.data[3] !== start) return;
      const shadow = g.mons[sp.data[6]!]!;
      shadow.data[1] = mon.data[1] = left ? 46 : 52;
      shadow.callback = 'taillowShadowFlyIn';
      mon.callback = 'taillowFlyIn';
      playSE(fr, 'se_fall');
      return;
    }
    case 'taillowFlyIn': {
      const dir = left ? 1 : -1;
      const moves = [[2, 0], [2, 0], [2, -1], [2, -1], [2, -1], [2, -1], [2, -2], [2, -2]];
      if (sp.data[1]!-- > 7) sp.x += dir * 2;
      else if (sp.data[1]! >= 0) {
        sp.x += dir * moves[7 - sp.data[1]!]![0]!;
        sp.y += moves[7 - sp.data[1]!]![1]!;
      } else {
        playSEOrChange(fr, 'se_taillow_wing_flap');
        fr.events.push({ type: 'cry', species: 'taillow' });
        startSpriteAnim(sp, left + 2);
        sp.data[1] = 45;
        sp.callback = 'taillowPickUpBall';
      }
      return;
    }
    case 'taillowShadowFlyIn':
      if (sp.data[1]!-- >= 0) {
        sp.x += (left ? 1 : -1) * 2;
        const self = g.mons[sp.data[6]!]!;
        self.invisible = !self.invisible;
      } else sp.callback = 'taillowShadowFlash';
      return;
    case 'taillowShadowFlash':
      sp.invisible = !sp.invisible;
      return;
    case 'taillowPickUpBall':
      if (sp.data[1]! >= 0) {
        sp.data[1]!--;
        sp.y--;
        if (sp.data[1] === 0 && sp.animCmdIndex === 1) sp.y2++;
      } else if (sp.data[3]! >= 0) {
        sp.data[3]!--;
        if (sp.animDelayCounter === 0) sp.y2 += sp.animCmdIndex === 1 ? 1 : -1;
      } else {
        playSE(fr, 'se_fall');
        startSpriteAnim(sp, left + 4);
        sp.callback = 'taillowFlyAway';
        g.mons[sp.data[6]!]!.affineAnimPaused = false;
      }
      return;
    case 'taillowFlyAway':
      if (sp.y > -16) sp.y--;
      else {
        Object.assign(sp, { callback: 'dummy', invisible: true, animPaused: true });
        stopSE(fr, 'se_taillow_wing_flap');
        destroy(sp);
        destroy(g.mons[1]!);
      }
      return;
  }
}

// ---- The tasks ----

const NOT_ENOUGH = "You don't have enough COINS.";

function runPlayTask(fr: Frame) {
  const g = fr.g;
  switch (g.task) {
    case 'fieldEntry':
      // Task_PrintRouletteEntryMsg, at the table in the Game Corner.
      g.coinsWindow = g.coins;
      if (g.coins >= g.minBet) {
        showMessage(g, 'The minimum wager at this table', `is ${g.minBet}. Do you want to play?`);
        g.task = 'fieldShowYesNo';
      } else {
        showMessage(g, NOT_ENOUGH);
        g.task = 'fieldNotEnough';
        g.coins = 0;
      }
      return;
    case 'fieldShowYesNo':
      g.yesNo = 0;
      g.task = 'fieldYesNo';
      return;
    case 'fieldYesNo': {
      const choice = yesNoInput(fr);
      if (choice === null) return;
      g.message = null;
      g.coinsWindow = null;
      if (choice === 0) {
        // Task_AcceptMinBet: the screen fades to black, a step at once.
        g.fade = { mode: 'normal', y: 0, target: 16, finishing: false, active: true };
        updateFade(g);
        g.task = 'fieldFade';
      } else {
        g.task = 'gone';
        fr.events.push({ type: 'exit' });
      }
      return;
    }
    case 'fieldNotEnough':
      if (pressedAB(fr)) {
        g.message = null;
        g.coinsWindow = null;
        g.task = 'gone';
        fr.events.push({ type: 'exit' });
      }
      return;
    case 'startPlaying':
      if (updateFade(g)) return;
      g.ballNum = 0;
      resetBallDataForNewSpin(g);
      resetHits(g);
      hideWheelBalls(g);
      drawGridBackground(g, 0);
      setBallCounterNumLeft(g, ROULETTE_BALLS);
      startTaskAfterDelayOrInput(g, 'continuePlaying', NO_DELAY, 'ab');
      return;
    case 'askKeepPlaying':
      g.yesNo = 0;
      showMessage(g, 'Keep playing?');
      g.task = 'keepPlayingYesNo';
      return;
    case 'keepPlayingYesNo': {
      const choice = yesNoInput(fr);
      if (choice === null) return;
      // The yes/no's functions are called at once (Task_ContinuePlaying, Task_StopPlaying; B is No).
      g.task = choice === 0 ? 'continuePlaying' : 'stopPlaying';
      runPlayTask(fr);
      return;
    }
    case 'continuePlaying':
      g.message = null;
      g.task = 'selectFirstEmptySquare';
      return;
    case 'stopPlaying':
      g.spinning = false;
      exitRoulette(fr);
      return;
    case 'selectFirstEmptySquare': {
      let i: number;
      if (g.hitFlags & ROULETTE_GRID[ROW_ORANGE]!.flag) {
        // The orange row's all hit: the first of the green (never as far as Makuhita: 6 balls can't fill both rows).
        for (i = ROW_GREEN + 1; i < ROW_GREEN + 4; i++) if (!(g.hitFlags & ROULETTE_GRID[i]!.flag)) break;
      } else for (i = ROW_ORANGE + 1; i <= ROW_ORANGE + 4; i++) if (!(g.hitFlags & ROULETTE_GRID[i]!.flag)) break;
      g.selectionId = i;
      resetBallDataForNewSpin(g);
      drawGridBackground(g, g.selectionId);
      g.multiplierAnim = multiplierAnimId(g, g.selectionId);
      flashSelectionOnWheel(g, g.selectionId);
      g.data1 = 0;
      g.task = 'startHandleBetGridInput';
      return;
    }
    case 'startHandleBetGridInput':
      g.rectShown = true;
      g.rectSelection = g.selectionId;
      g.wheelDelay = 2;
      g.wheelDelayTimer = 0;
      g.task = 'handleBetGridInput';
      return;
    case 'handleBetGridInput': {
      processBetGridInput(fr);
      // The selection's box flashes: shown 30 frames, hidden 30.
      if (g.data1 === 0) {
        g.rectSelection = g.selectionId;
        g.data1++;
      } else if (g.data1 === 30) {
        g.rectSelection = 0;
        g.data1++;
      } else if (g.data1 === 59) g.data1 = 0;
      else g.data1++;
      if (pressedA(fr) || fr.input.select) {
        if (g.hitFlags & ROULETTE_GRID[g.selectionId]!.flag) playSE(fr, 'se_boo');
        else {
          playSE(fr, 'se_shop');
          g.task = 'placeBet';
        }
      }
      return;
    }
    case 'placeBet':
      g.betSelection = g.selectionId;
      g.multiplier = rouletteMultiplier(g, g.betSelection);
      g.multiplierAnim = multiplierAnimId(g, g.betSelection);
      g.coins = Math.max(0, g.coins - g.minBet);
      g.credit = g.coins;
      g.task = 'startSpin';
      return;
    case 'startSpin':
      g.rectShown = false;
      g.wheelDelay = g.minBet === 1 ? 1 : 0;
      g.wheelDelayTimer = 0;
      g.data1 = 32;
      g.task = 'slideGridOffscreen';
      return;
    case 'slideGridOffscreen':
      if (g.data1-- > 0) {
        if (g.data1 > 2) g.offsetX += 2;
        if ((g.gridX += 4) === 104) g.multiplierFollows = false;
      } else {
        showHideGridIcons(g, true, -1);
        showHideGridBalls(g, true, -1);
        g.task = 'initBallRoll';
        g.data1 = 0;
      }
      return;
    case 'initBallRoll':
      initBallRoll(fr);
      return;
    case 'rollBall': {
      g.ball = g.curBallSpriteId;
      g.balls[g.ball]!.callback = 'rollStart';
      g.ballNum++;
      g.totalBallNum++;
      setBallCounterNumLeft(g, ROULETTE_BALLS - g.ballNum);
      playSE(fr, 'se_roulette_ball');
      g.task = 'recordBallHit';
      return;
    }
    case 'recordBallHit':
      // Waits for the ball to land (or, stuck, to be cleared), then marks the hit and shows it for a second (A cuts it short).
      if (g.ballState === 0) return;
      if (g.ballStuck) {
        if (g.ballUnstuck) g.ballUnstuck = g.ballStuck = false;
        return;
      }
      if (g.data1 === 0) {
        const won = isHitInBetSelection(recordHit(g, g.hitSlot), g.betSelection);
        g.wonBet = won;
        if (won) flashEnable(g.flash, F_FLASH_OUTER_EDGES);
        fr.events.push({ type: 'round', bet: g.minBet, payout: won ? g.minBet * g.multiplier : 0 });
      }
      if (g.data1 <= 60) {
        if (pressedA(fr)) g.data1 = 60;
        g.data1++;
      } else {
        drawGridBackground(g, g.betSelection);
        showHideGridIcons(g, false, g.winningSquare);
        showHideGridBalls(g, false, g.ballNum - 1);
        g.data1 = 32;
        g.task = 'slideGridOnscreen';
      }
      return;
    case 'slideGridOnscreen':
      if (g.data1-- > 0) {
        if (g.data1 > 2) g.offsetX -= 2;
        if ((g.gridX -= 4) === 104) g.multiplierFollows = true;
      } else {
        showHideWinSlotCursor(g, g.winningSquare);
        g.data1 = g.wonBet ? 121 : 61;
        g.task = 'flashBallOnWinningSquare';
      }
      return;
    case 'flashBallOnWinningSquare':
      if (g.data1-- > 1) {
        if (g.data1 % 16 === 8) {
          showHideGridIcons(g, false, -1);
          showHideGridBalls(g, false, -1);
        } else if (g.data1 % 16 === 0) {
          showHideGridIcons(g, false, g.winningSquare);
          showHideGridBalls(g, false, g.ballNum - 1);
        }
      } else startTaskAfterDelayOrInput(g, 'printSpinResult', 30, 'none');
      return;
    case 'printSpinResult':
      if (g.wonBet) {
        if (g.multiplier === MAX_MULTIPLIER) {
          playFanfare(fr, 'mus_slots_jackpot');
          showMessage(g, 'Jackpot!');
        } else {
          playFanfare(fr, 'mus_slots_win');
          showMessage(g, "It's a hit!");
        }
      } else {
        playSE(fr, 'se_failure');
        showMessage(g, 'Nothing doing!');
      }
      g.data1 = 0;
      g.task = 'tryIncrementWins';
      return;
    case 'tryIncrementWins':
      if (g.wonBet) {
        if (g.fanfare === null) {
          g.consecutiveWins++;
          startTaskAfterDelayOrInput(g, 'printPayout', NO_DELAY, 'ab');
        }
      } else if (!isSEPlaying(g)) {
        g.consecutiveWins = 0;
        startTaskAfterDelayOrInput(g, 'endTurn', NO_DELAY, 'ab');
      }
      return;
    case 'printPayout':
      showMessage(g, `You've won ${g.minBet * g.multiplier} COINS!`);
      g.data1 = g.minBet * g.multiplier;
      g.data7 = 0;
      g.task = 'givePayout';
      return;
    case 'givePayout':
      // A coin every 4 frames, with a ping, up to the Coin Case's limit.
      if (g.data7 === 0) {
        g.coins++;
        playSE(fr, 'se_pin');
        g.credit = g.coins;
        if (g.coins >= MAX_COINS) g.data1 = 0;
        else {
          g.data1--;
          g.data7++;
        }
      } else if (g.data7 === 3) {
        stopSE(fr, 'se_pin');
        g.data7 = 0;
      } else g.data7++;
      if (g.data1 === 0) startTaskAfterDelayOrInput(g, 'endTurn', NO_DELAY, 'ab');
      return;
    case 'endTurn': {
      flashStop(g.flash, 0xffff, fr.palette);
      iconsUnavailable(g);
      const slot = ROULETTE_GRID[g.winningSquare]!.spriteIdOffset;
      if (slot < ROULETTE_SLOTS) g.wheelIconHidden[slot] = true;
      g.task = 'tryPrintEndTurnMsg';
      return;
    }
    case 'tryPrintEndTurnMsg':
      g.selectionId = 0;
      g.betSelection = 0;
      drawGridBackground(g, 0);
      g.winCursor.hidden = true;
      g.litHeader = -1;
      if (g.coins >= g.minBet) {
        if (g.ballNum === ROULETTE_BALLS) {
          showMessage(g, 'The ROULETTE board will be cleared.');
          startTaskAfterDelayOrInput(g, 'clearBoard', NO_DELAY, 'ab');
        } else if (g.coins === MAX_COINS) {
          showMessage(g, 'Your COIN CASE is full!', 'Coins can be exchanged for prizes.');
          startTaskAfterDelayOrInput(g, 'askKeepPlaying', NO_DELAY, 'ab');
        } else g.task = 'askKeepPlaying';
      } else {
        showMessage(g, 'No COINS left…');
        startTaskAfterDelayOrInput(g, 'stopPlaying', 60, 'ab');
      }
      return;
    case 'clearBoard':
      g.ballNum = 0;
      resetBallDataForNewSpin(g);
      resetHits(g);
      hideWheelBalls(g);
      drawGridBackground(g, 0);
      setBallCounterNumLeft(g, ROULETTE_BALLS);
      g.wheelIconHidden.fill(false);
      if (g.coins === MAX_COINS) {
        showMessage(g, 'Your COIN CASE is full!', 'Coins can be exchanged for prizes.');
        startTaskAfterDelayOrInput(g, 'askKeepPlaying', NO_DELAY, 'ab');
      } else g.task = 'askKeepPlaying';
      return;
    case 'exitRoulette':
      if (updateFade(g)) return;
      g.task = 'gone';
      fr.events.push({ type: 'exit' });
      return;
    case 'waitForNextTask': {
      const key = g.taskWaitKey;
      if (g.taskWaitDelay === 0 || (key === 'ab' ? pressedAB(fr) : key === 'any' ? pressedAny(fr) : false)) {
        g.task = g.nextTask!;
        if (key !== 'none') playSE(fr, 'se_select');
        g.nextTask = null;
        g.taskWaitKey = 'none';
        g.taskWaitDelay = 0;
      }
      if (g.taskWaitDelay !== NO_DELAY) g.taskWaitDelay = u16(g.taskWaitDelay - 1);
      return;
    }
  }
}

/** GetRandomForBallTravelDistance: how much the ball's travel can vary this time (twice what it adds at most). */
function randomForTravel(g: RouletteGame, ballNum: number, rand: number) {
  const t = TABLES[g.tableId]!;
  const morning = (end: number) => g.hours > 3 && g.hours < end;
  switch (g.partySpeciesFlags) {
    case 1:
    case 2:
      if (morning(10)) return ballNum < ROULETTE_BALLS * 2 || rand & 1 ? Math.trunc(t.randDistanceLow / 2) : 1;
      return !(rand & 3) ? Math.trunc(t.randDistanceLow / 2) : t.randDistanceLow;
    case 3:
      if (morning(11)) return ballNum < ROULETTE_BALLS || rand & 1 ? Math.trunc(t.randDistanceLow / 2) : 1;
      return rand & 1 && ballNum > ROULETTE_BALLS ? Math.trunc(t.randDistanceLow / 4) : Math.trunc(t.randDistanceLow / 2);
    default:
      if (morning(10)) return !(rand & 3) ? 1 : Math.trunc(t.randDistanceLow / 2);
      if (!(rand & 3)) return ballNum > ROULETTE_BALLS * 2 ? Math.trunc(t.randDistanceLow / 2) : t.randDistanceLow;
      if (rand & (1 << 15)) return ballNum > ROULETTE_BALLS * 2 ? t.randDistanceLow : t.randDistanceHigh;
      return t.randDistanceHigh * 2;
  }
}

/** Task_InitBallRoll: where the ball starts, how fast it goes and how far it travels before it slows. */
function initBallRoll(fr: Frame) {
  const g = fr.g;
  const t = TABLES[g.tableId]!;
  const rand = fr.random();
  const randmod = rand % 100;
  g.curBallSpriteId = g.ballNum;
  g.ballState = g.hitSlot = g.stuckHitSlot = 0;
  const mod = u8(randomForTravel(g, g.totalBallNum, rand));
  const randTravelDist = ((((rand % mod) - Math.trunc(mod / 2)) & 0xff) << 24) >> 24;
  let startAngleId = g.hours < 13 ? 0 : 1;
  startAngleId = randmod < 80 ? startAngleId * 2 : (1 - startAngleId) * 2;
  let travelDist = u16(t.baseTravelDist + randTravelDist);
  g.ballTravelDist = s16(travelDist);
  travelDist = u16(Math.trunc(f(S16TOPOSFLOAT(travelDist) / 5)));
  g.ballTravelDistFast = s16(travelDist * 3);
  g.ballTravelDistSlow = g.ballTravelDistMed = travelDist;
  g.ballAngle = S16TOPOSFLOAT([0, 180, 90, 270][(rand & 1) + startAngleId]!);
  g.ballAngleSpeed = S16TOPOSFLOAT(t.ballSpeed);
  g.ballAngleAccel = f(f(f(g.ballAngleSpeed * 0.5) - g.ballAngleSpeed) / S16TOPOSFLOAT(g.ballTravelDistFast));
  g.ballDistToCenter = 68;
  g.ballFallAccel = 0;
  g.ballFallSpeed = f(-f(8 / S16TOPOSFLOAT(g.ballTravelDistFast)));
  g.varA0 = 36;
  g.task = 'rollBall';
}

function exitRoulette(fr: Frame) {
  const g = fr.g;
  flashStop(g.flash, 0xffff, fr.palette);
  flashReset(g.flash);
  g.fade = { mode: 'hardware', y: 0, target: 16, finishing: false, active: true };
  g.task = 'exitRoulette';
}

/** UpdatePaletteFade (a hardware fade: the screen's brightness a step a frame; a normal one: 2 steps): true while it's going. */
function updateFade(g: RouletteGame) {
  const fade = g.fade;
  if (!fade?.active) return false;
  if (fade.finishing) {
    // UpdateBlendRegisters, the frame after it reached its end.
    fade.active = false;
    if (fade.mode === 'hardware' && fade.target === 0) g.darkness = 0;
    return true;
  }
  const step = fade.mode === 'normal' ? 2 : 1;
  if (fade.y < fade.target) fade.y = Math.min(fade.target, fade.y + step);
  else if (fade.y > fade.target) fade.y = Math.max(fade.target, fade.y - step);
  else fade.finishing = true;
  g.darkness = fade.y;
  return true;
}

function spinWheel(g: RouletteGame) {
  if (u8(g.wheelDelayTimer++) === g.wheelDelay) {
    g.wheelDelayTimer = 0;
    if ((g.wheelAngle -= g.wheelSpeed) < 0) g.wheelAngle = 360 - g.wheelSpeed;
  }
  g.wheelDelayTimer = u8(g.wheelDelayTimer);
}

/** CB2_LoadRoulette's states, a frame each: the table's data and the board set up, then the screen fading in. */
function loadRoulette(fr: Frame) {
  const g = fr.g;
  switch (g.loadState) {
    case 4: {
      const table = TABLES[g.tableId]!;
      g.wheelSpeed = table.wheelSpeed;
      g.wheelDelay = table.wheelDelay;
      if (fr.palette) {
        for (const i of [0, 5 * 16 + 1]) fr.palette.unfaded[i] = fr.palette.faded[i] = ROULETTE_TABLE_COLORS[g.minBet === 1 ? 0 : 1];
      }
      flashReset(g.flash);
      FLASH_COLORS.forEach((s, i) => flashAdd(g.flash, i, s));
      break;
    }
    case 6:
      g.credit = g.coins;
      setBallCounterNumLeft(g, ROULETTE_BALLS);
      g.multiplierAnim = multiplierAnimId(g, 0);
      drawGridBackground(g, 0);
      showMessage(g, 'Place your wager with the + Control', 'Pad, then press the A Button.');
      g.offsetX = -60;
      g.offsetY = 0;
      break;
    case 8:
      g.fade = { mode: 'hardware', y: 16, target: 0, finishing: false, active: true };
      g.darkness = 16;
      g.ballNum = ROULETTE_BALLS;
      g.spinning = true;
      g.task = 'startPlaying';
      g.screen = 'game';
      return;
  }
  g.loadState++;
}

/**
 * One frame of the game (the roulette's CB2: its tasks, its sprites, the flash util), changing `game` in place, with the
 * buttons newly pressed this frame; `random` is the game's Random() (0-65535). `palette`, if the screen keeps one, is
 * changed as the game's flashes change its colours. Returns what it played and settled: each ball's round (its bet and
 * payout) as soon as it's known, and the player leaving.
 */
export function rouletteFrame(game: RouletteGame, input: RouletteInput, random: Random16, palette?: RoulettePalette): RouletteEvent[] {
  const fr: Frame = { g: game, input, random, palette, events: [] };
  const g = game;
  if (g.task === 'gone') return [];
  if (g.screen === 'field') {
    if (g.task === 'fieldFade') {
      if (!updateFade(g)) {
        g.screen = 'load';
        g.task = 'load';
        g.loadState = 0;
        g.darkness = 16;
      }
    } else runPlayTask(fr);
  } else if (g.screen === 'load') loadRoulette(fr);
  else {
    runPlayTask(fr);
    if (g.spinning) spinWheel(g);
    if (g.fanfare !== null) {
      if (g.fanfare) g.fanfare--;
      else {
        g.fanfare = null;
        fr.events.push({ type: 'fanfareEnd' });
      }
    }
    // AnimateSprites: the balls (sprites 0-5), the multiplier (12), then Shroomish or Taillow and their shadows (54-56).
    for (const ball of g.balls) {
      ballCallback(fr, ball);
      animateSprite(ball);
    }
    if (g.multiplierFollows) g.multiplierX2 = g.gridX;
    for (const sp of g.mons) {
      if (!sp.inUse) continue;
      monCallback(fr, sp);
      if (sp.inUse) animateSprite(sp);
    }
    flashRun(g.flash, palette);
  }
  g.frame++;
  return fr.events;
}
