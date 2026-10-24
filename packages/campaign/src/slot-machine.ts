// The Game Corner's slot machines (the Extras page), as Pokémon Emerald plays them at Mauville (the pret/pokeemerald
// decompilation's src/slot_machine.c, ported frame by frame, its bugs kept): the player bets 1 to 3 coins (each coin
// another line to match on), the 3 reels spin and stop one by one on A; a line of 3 pays (a cherry on the left reel alone
// pays too). Each spin the machine draws a bias (its luck, the machine id, sets the odds) and steers the reels up to 4
// symbols past where the player stopped them to make the bias's symbols line up, or not line up when it has none. Three
// Power bolts add one to the Pika Power meter; a Reel Time draw starts its lottery (the Pikachu machine), whose spins stop
// the reels exactly where the player presses. The web app runs `slotFrame` 60 times a second (the game's frame rate) with
// the buttons pressed, and draws the screen from the machine's state (its sprites, palettes and tilemap writes, as the
// game's tasks leave them); the API settles each spin's bet and payout (`coinRoundError`).
import type { Random16 } from './berry-blender.js';
import { MAX_COINS, type SlotMachineId } from './game-corner.js';

const MAX_BET = 3;
const SYMBOLS_PER_REEL = 21;
const REEL_SYMBOL_HEIGHT = 24;
const REEL_HEIGHT = SYMBOLS_PER_REEL * REEL_SYMBOL_HEIGHT;
const REELTIME_SYMBOLS = 6;
const REELTIME_SYMBOL_HEIGHT = 20;
const REELTIME_REEL_HEIGHT = REELTIME_SYMBOLS * REELTIME_SYMBOL_HEIGHT;
const NUM_REELS = 3;
const MAX_EXTRA_TURNS = 4;
/** The game's empty sprite slot (MAX_SPRITES), as the digital display's task marks one. */
const NO_SPRITE = 64;

// The biases (BIAS_*): there can be two at once, Reel Time and a regular one; the 7s' bias stays until 7s are matched.
const BIAS_REPLAY = 1 << 0;
const BIAS_CHERRY = 1 << 1;
const BIAS_LOTAD = 1 << 2;
const BIAS_AZURILL = 1 << 3;
const BIAS_POWER = 1 << 4;
const BIAS_REELTIME = 1 << 5;
const BIAS_MIXED_7 = 1 << 6;
const BIAS_STRAIGHT_7 = 1 << 7;
const BIAS_7 = BIAS_STRAIGHT_7 | BIAS_MIXED_7;

/** The reels' symbols (SYMBOL_*), the order of their pictures. */
const SYMBOL_7_RED = 0;
const SYMBOL_7_BLUE = 1;
const SYMBOL_AZURILL = 2;
const SYMBOL_LOTAD = 3;
const SYMBOL_CHERRY = 4;
const SYMBOL_POWER = 5;
const SYMBOL_REPLAY = 6;

/** What a line can match (MATCH_*); `matches` holds a bit for each. */
const MATCH_CHERRY = 0;
const MATCH_TOPBOT_CHERRY = 1;
const MATCH_REPLAY = 2;
const MATCH_LOTAD = 3;
const MATCH_AZURILL = 4;
const MATCH_POWER = 5;
const MATCH_MIXED_7 = 6;
const MATCH_RED_7 = 7;
const MATCH_BLUE_7 = 8;
const MATCH_NONE = 9;

/** The symbols' and matches' numbers, for the web app and the tests. */
export const SLOT_SYMBOL = { red7: SYMBOL_7_RED, blue7: SYMBOL_7_BLUE, azurill: SYMBOL_AZURILL, lotad: SYMBOL_LOTAD, cherry: SYMBOL_CHERRY, power: SYMBOL_POWER, replay: SYMBOL_REPLAY } as const;
export const SLOT_MATCH = { cherry: MATCH_CHERRY, topBottomCherry: MATCH_TOPBOT_CHERRY, replay: MATCH_REPLAY, lotad: MATCH_LOTAD, azurill: MATCH_AZURILL, power: MATCH_POWER, mixed7: MATCH_MIXED_7, red7: MATCH_RED_7, blue7: MATCH_BLUE_7, none: MATCH_NONE } as const;

/** The lines (MATCH_MIDDLE_ROW…MATCH_NESW_DIAG). */
export const SLOT_LINES = 5;
const MATCH_MIDDLE_ROW = 0;
const MATCH_TOP_ROW = 1;
const MATCH_BOTTOM_ROW = 2;
const MATCH_NWSE_DIAG = 3;
const MATCH_NESW_DIAG = 4;

const REEL_NORMAL_SPEED = 8;
const REEL_HALF_SPEED = 4;
const REEL_QUARTER_SPEED = 2;

/** Each reel's symbols, top to bottom of its tape (sReelSymbols). */
export const SLOT_REEL_SYMBOLS: readonly (readonly number[])[] = [
  [0, 4, 2, 6, 5, 3, 1, 3, 4, 5, 6, 2, 0, 5, 3, 6, 2, 1, 5, 3, 6],
  [0, 4, 6, 3, 2, 4, 6, 5, 5, 3, 1, 3, 6, 4, 2, 3, 6, 4, 3, 6, 4],
  [0, 5, 1, 6, 3, 2, 6, 3, 5, 2, 6, 3, 2, 5, 6, 3, 2, 5, 6, 3, 4],
];
/** The Reel Time machine's numbers, in its reel's order (sReelTimeSymbols). */
const REELTIME_REEL = [1, 0, 5, 4, 3, 2];
/** Where the reels start, in a normal and a lucky game (sInitialReelPositions). */
const INITIAL_REEL_POSITIONS = [[0, 6], [0, 10], [0, 2]];
/** The odds out of 256 of drawing for a special bias, by machine and bet (sSpecialDrawOdds). */
const SPECIAL_DRAW_ODDS = [[1, 1, 12], [1, 1, 14], [2, 2, 14], [2, 2, 14], [2, 3, 16], [3, 3, 16]];
/** The special biases, in the order they're drawn, and their odds out of 256 by machine (sBiasesSpecial, sBiasProbabilities_Special). */
const BIASES_SPECIAL = [BIAS_STRAIGHT_7, BIAS_REELTIME, BIAS_MIXED_7];
const BIAS_PROBABILITIES_SPECIAL = [[25, 25, 30, 40, 40, 50], [25, 25, 30, 30, 35, 35], [25, 25, 30, 25, 25, 30]];
/** The regular biases and their odds (sBiasesRegular, sBiasProbabilities_Regular). */
const BIASES_REGULAR = [BIAS_POWER, BIAS_AZURILL, BIAS_LOTAD, BIAS_CHERRY, BIAS_REPLAY];
const BIAS_PROBABILITIES_REGULAR = [[20, 25, 25, 20, 25, 25], [12, 15, 15, 18, 19, 22], [25, 25, 25, 30, 30, 40], [25, 25, 20, 20, 15, 15], [40, 40, 35, 35, 40, 40]];
/** Each bias's symbol, by its bit (sBiasSymbols). */
const BIAS_SYMBOLS = [SYMBOL_REPLAY, SYMBOL_CHERRY, SYMBOL_LOTAD, SYMBOL_AZURILL, SYMBOL_POWER, SYMBOL_7_RED, SYMBOL_7_RED, SYMBOL_7_RED];
/** The odds out of 256 of a Reel Time draw of 0-5 spins, by Power bolts (0-16), in a normal and a lucky game. */
const REELTIME_PROBABILITIES_NORMAL = [
  [243, 243, 243, 80, 80, 80, 80, 40, 40, 40, 40, 40, 40, 5, 5, 5, 5],
  [5, 5, 5, 150, 150, 150, 150, 130, 130, 130, 130, 130, 130, 100, 100, 100, 5],
  [4, 4, 4, 20, 20, 20, 20, 80, 80, 80, 80, 80, 80, 100, 100, 100, 40],
  [2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 45, 45, 45, 100],
  [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5, 100],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6],
];
const REELTIME_PROBABILITIES_LUCKY = [
  [243, 243, 243, 200, 200, 200, 200, 160, 160, 160, 160, 160, 160, 70, 70, 70, 5],
  [5, 5, 5, 25, 25, 25, 25, 5, 5, 5, 5, 5, 5, 2, 2, 2, 6],
  [4, 4, 4, 25, 25, 25, 25, 30, 30, 30, 30, 30, 30, 40, 40, 40, 35],
  [2, 2, 2, 3, 3, 3, 3, 30, 30, 30, 30, 30, 30, 100, 100, 100, 50],
  [1, 1, 1, 2, 2, 2, 2, 30, 30, 30, 30, 30, 30, 40, 40, 40, 100],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 60],
];
const REELTIME_EXPLODE_PROBABILITY = [128, 175, 200, 225, 256];
/** Reel Time's odds (out of 100) of half and quarter speed, by coins lost; and quarter speed's boost by spins used. */
const REELTIME_SPEED_PROBABILITIES = [[10, 5], [10, 10], [10, 15], [10, 25], [10, 35]];
const QUARTER_SPEED_BOOST = [0, 5, 10, 15, 20];
const SYMBOL_TO_MATCH = [MATCH_RED_7, MATCH_BLUE_7, MATCH_AZURILL, MATCH_LOTAD, MATCH_CHERRY, MATCH_POWER, MATCH_REPLAY];
/** What each match pays (sSlotPayouts): a cherry in the middle 2, at the top or bottom 4; a Replay nothing but a free spin. */
export const SLOT_PAYOUTS = [2, 4, 0, 6, 12, 3, 90, 300, 300];
/** The lines each coin of the bet lights (sBetToMatchLineIds, sMatchLinesPerBet). */
export const SLOT_BET_LINES = [[MATCH_MIDDLE_ROW], [MATCH_TOP_ROW, MATCH_BOTTOM_ROW], [MATCH_NWSE_DIAG, MATCH_NESW_DIAG]];
const REEL_STOP_SHOCKS = [2, 4, 4, 4, 8];
/** The stop buttons' places on the menu's tilemap (sReelButtonOffsets), and the Pika Power meter's tiles (unlit, lit). */
const REEL_BUTTON_OFFSETS = [5, 10, 15];
const PIKA_POWER_TILES = [[0x9e, 0x6e], [0x9f, 0x6f], [0xaf, 0x7f]];
const REELTIME_PIKACHU_ANIMS = [1, 1, 2, 2];
const REELTIME_BOLT_DELAYS = [64, 48, 24, 8];
const PIKACHU_AURA_FLASH_DELAYS = [10, 8, 6, 4];

/** The GBA's buttons, as bits (the game's A_BUTTON… order). */
export const SLOT_KEYS = { a: 1, b: 2, select: 4, start: 8, right: 16, left: 32, up: 64, down: 128, r: 256, l: 512 } as const;
/** A frame's buttons: those pressed this frame (JOY_NEW) and those held down (JOY_HELD). */
export interface SlotInput {
  pressed: number;
  held: number;
}

// ---- Sprites ----

/** A sprite's animation command (union AnimCmd): a frame (picture, frames shown, flipped), a jump, or the end. */
type AnimCmd = readonly [image: number, duration: number, hFlip?: boolean] | { jump: number } | 'end';
/** An affine animation command: scale and rotation steps for some frames (0: set them), a loop, or the end. */
type AffineCmd = readonly [xScale: number, yScale: number, rotation: number, duration: number] | { loop: number } | 'end';

const SINGLE_FRAME: AnimCmd[][] = [[[0, 1], 'end']];
/** Each kind of sprite's animations (sAnims_*). */
const ANIMS: Partial<Record<SlotSpriteKind, AnimCmd[][]>> = {
  rt_pikachu: [
    [[0, 16], 'end'],
    [[1, 16], [0, 16], { jump: 0 }],
    [[1, 8], [0, 8], { jump: 0 }],
    [[1, 4], [0, 4], { jump: 0 }],
    [[2, 32], [3, 32], { jump: 0 }],
    [[4, 1], 'end'],
  ],
  rt_number: [0, 1, 2, 3, 4, 5].map((i) => [[i, 1], 'end'] as AnimCmd[]),
  rt_bolt: [[[0, 4], [1, 4], { jump: 0 }]],
  rt_explosion: [[[0, 16], [1, 16], { jump: 0 }]],
  rt_duck: [[[0, 1], { jump: 0 }]],
  dd_a_button: [[[0, 30], [1, 30], { jump: 0 }], [[1, 1], 'end']],
  dd_d_pad: [[[0, 30], [1, 30], { jump: 0 }]],
  dd_pokeball: [[[0, 16], [1, 16], [0, 16], [1, 16, true], { jump: 0 }], [[0, 1], 'end']],
  dd_number: [0, 1, 2, 3, 4].map((i) => [[i, 1], 'end'] as AnimCmd[]),
};
/** The smoke grows from nothing (sAffineAnim_ReelTimeSmoke); the Power bolt spins as it appears (sAffineAnim_PikaPowerBolt). */
const AFFINE_ANIMS: Partial<Record<SlotSpriteKind, AffineCmd[]>> = {
  rt_smoke: [[16, 16, 0, 0], { loop: 0 }, [1, 1, 0, 1], { loop: 255 }, 'end'],
  power_bolt: [[0, 0, 8, 32], [0, 0, 6, 32], [0, 0, 4, 16], [0, 0, 12, 2], [0, 0, -12, 4], [0, 0, 12, 2], [0, 0, 12, 2], [0, 0, -12, 4], [0, 0, 12, 2], 'end'],
};

/** The kinds of sprite the machine shows, each its pictures in the web app's sheet (but `empty`, the digital display's invisible one). */
export type SlotSpriteKind =
  | 'flash_line' | 'empty'
  | 'dd_reel' | 'dd_time' | 'dd_insert' | 'dd_win' | 'dd_lose' | 'dd_a_button' | 'dd_smoke' | 'dd_number' | 'dd_pokeball' | 'dd_d_pad'
  | 'dd_stop_s' | 'dd_stop_t' | 'dd_stop_o' | 'dd_stop_p' | 'dd_bonus_b' | 'dd_bonus_o' | 'dd_bonus_n' | 'dd_bonus_u' | 'dd_bonus_s'
  | 'dd_big_b' | 'dd_big_i' | 'dd_big_g' | 'dd_reg_r' | 'dd_reg_e' | 'dd_reg_g'
  | 'rt_pikachu' | 'rt_antennae' | 'rt_machine' | 'rt_broken' | 'rt_number' | 'rt_shadow' | 'rt_gap' | 'rt_bolt' | 'rt_aura'
  | 'rt_explosion' | 'rt_duck' | 'rt_smoke' | 'power_bolt';

type Callback =
  | 'none' | 'flashLine' | 'ddStatic' | 'ddStop' | 'ddAButtonStop' | 'ddPokeballRocking' | 'ddSmoke' | 'ddSmokeNE' | 'ddSmokeSW' | 'ddSmokeSE'
  | 'ddReel' | 'ddTime' | 'ddReelTimeNumber' | 'ddPokeballShining' | 'ddRegBonus' | 'ddBigBonus' | 'ddAButtonStart'
  | 'rtPikachu' | 'rtNumbers' | 'rtBolt' | 'rtAura' | 'rtExplosion' | 'rtDuck' | 'rtSmoke' | 'powerBolt';

interface AnimState {
  num: number;
  cmd: number;
  delay: number;
  beginning: boolean;
  ended: boolean;
  paused: boolean;
  /** The picture shown and its flip (the frame command's). */
  image: number;
  hFlip: boolean;
}

interface AffineState {
  cmd: number;
  delay: number;
  loop: number;
  beginning: boolean;
  ended: boolean;
  xScale: number;
  yScale: number;
  /** 65536 a turn. */
  rotation: number;
}

/** A sprite (struct Sprite, as much of it as the machine uses). */
export interface SlotSprite {
  kind: SlotSpriteKind;
  callback: Callback;
  x: number;
  y: number;
  x2: number;
  y2: number;
  /** Its OAM priority (0 over BG 0 … 3) and its order among sprites of the same priority (lower in front). */
  priority: number;
  subpriority: number;
  /** Moved by the sprites' shared offset (gSpriteCoordOffsetX/Y: Reel Time's window sliding in, the explosion's shake). */
  coordOffset: boolean;
  invisible: boolean;
  hFlip: boolean;
  vFlip: boolean;
  mosaic: boolean;
  subspriteTableNum: number;
  data: number[];
  anim: AnimState;
  affine: AffineState | null;
}

/** The picture a sprite shows (its animation's frame; the digital display's smoke its subsprite table). */
export function slotSpriteImage(sprite: SlotSprite) {
  return sprite.kind === 'dd_smoke' ? sprite.subspriteTableNum : sprite.anim.image;
}

/** Whether a sprite is drawn flipped (the sprite's flip and its animation frame's). */
export const slotSpriteHFlip = (sprite: SlotSprite) => sprite.hFlip !== sprite.anim.hFlip;

// ---- The machine ----

/** The slot machine's tasks' states (SLOTTASK_*). */
const enum Task {
  Unfade, WaitFade, ReadyNewSpin, ReadyNewRtSpin, AskInsertBet, BetInput, MsgNeed3Coins, WaitMsgNeed3Coins, WaitInfoBox, StartSpin,
  StartRtSpin, ResetBiasFailure, WaitReelStop, WaitAllReelsStop, CheckMatches, WaitPayout, EndPayout, MatchedPower, WaitRtAnim,
  ResetBetTiles, NoMatches, AskQuit, HandleQuitInput, MsgMaxCoins, WaitMsgMaxCoins, MsgNoMoreCoins, WaitMsgNoMoreCoins, End, Free,
}

/** The message box's messages. */
export type SlotMessage = 'need3' | 'maxCoins' | 'noCoins' | 'quit';
/** The songs the machine plays: the map's (the Game Corner's own), Reel Time's (MUS_ROULETTE) or none. */
export type SlotMusic = 'corner' | 'roulette' | 'none';
export type SlotFanfare = 'mus_slots_win' | 'mus_slots_jackpot' | 'mus_too_bad';
export type SlotSound = 'se_shop' | 'se_contest_place' | 'se_pin' | 'se_m_explosion' | 'se_select';
/** What a frame did that the web app plays or passes on: a sound, a fanfare, a spin over (its bet and payout), the end. */
export type SlotEvent = { sound: SlotSound } | { fanfare: SlotFanfare } | { round: { bet: number; payout: number } } | { exit: true };

/** The fanfares' lengths in frames (sFanfares), for which the map's music waits and the payout's sounds hold. */
const FANFARE_FRAMES: Record<SlotFanfare, number> = { mus_slots_jackpot: 250, mus_slots_win: 150, mus_too_bad: 160 };

export interface SlotMachine {
  // struct SlotMachine.
  /** The machine's task's state (SLOTTASK_*). */
  state: number;
  machineId: SlotMachineId;
  pikaPowerBolts: number;
  luckyGame: boolean;
  machineBias: number;
  reelTimeDraw: number;
  didNotFailBias: boolean;
  biasSymbol: number;
  matches: number;
  reelTimeSpinsLeft: number;
  reelTimeSpinsUsed: number;
  coins: number;
  payout: number;
  /** The coins lost to the machine, less what it paid (never below 0, at most 9999): slows Reel Time's reels. */
  netCoinLoss: number;
  bet: number;
  reeltimePixelOffset: number;
  reeltimePosition: number;
  currentReel: number;
  reelSpeed: number;
  reelPixelOffsets: number[];
  reelShockOffsets: number[];
  reelPositions: number[];
  reelExtraTurns: number[];
  winnerRows: number[];
  /** The coins taken for the spin under way (0 for a Replay's), for its round. */
  spinBet: number;
  // The slot task's timers (its data[0] and data[1]).
  timer: number;
  timer2: number;
  /** Each reel's task: its state (REEL_TASK_*), its extra turns or shock (data[1]), its timer and whether it moves. */
  reels: { state: number; d1: number; timer: number; moving: boolean }[];
  /** The payout's task, while it pays: its state and timer. */
  payoutTask: { state: number; timer: number } | null;
  /** The stop buttons pressed (Task_PressStopReelButton): each reel's, its state and timer. */
  stopButtons: { reel: number; state: number; timer: number }[];
  /** The lights flashing on a win (Task_FlashSlotMachineLights): its timer, the palette (0-2) and which way it goes. */
  lights: { delay: number; state: number; dir: number } | null;
  /** The Pika Power meter's task (Task_CreatePikaPowerBolt): its data[]. */
  pikaBolt: number[];
  /** Reel Time's task, while it runs: its data[]. */
  reelTime: number[] | null;
  /** The info screen's task (SELECT), while it's open: its state and the digital display scene to come back to. */
  infoBox: { state: number; scene: number } | null;
  /** The digital display's task: its scene (DIG_DISPLAY_*, -1 none) and its sprites (data[4..15]). */
  display: { scene: number; sprites: number[] };
  /** A fanfare playing (Task_Fanfare): which and the frames it has left. */
  fanfare: { song: SlotFanfare; counter: number } | null;
  music: SlotMusic;
  /** The sprites (gSprites), by slot: the game's own fixed ones (the reels, numbers…) are drawn by the web app from the state. */
  sprites: (SlotSprite | null)[];
  flashLineSprites: number[];
  rt: Record<'pikachu' | 'gap' | 'explosion' | 'broken' | 'smoke', number> & Record<'machine' | 'numbers' | 'shadows' | 'bolts' | 'aura' | 'ducks', number[]>;
  // What the GBA shows.
  /** The screen's fade to black (gPaletteFade): 0-16. */
  fade: { active: boolean; y: number; target: number; dec: boolean; toggle: boolean; finishing: boolean; finishCounter: number };
  spriteOffsetX: number;
  spriteOffsetY: number;
  bg1Hofs: number;
  bg1Vofs: number;
  /** BG 1's tilemap (Reel Time's window): 0 an empty entry, otherwise 1 + the entry's index in reel_time_window.bin. */
  bg1: number[];
  /** BG 2's tilemap: the machine's or the info screen's, with the entries written over it since (the meter, the stop buttons). */
  bg2: 'menu' | 'info';
  bg2Writes: Record<number, number>;
  bg3Shown: boolean;
  /** Each line lit (a coin bet on it) or dark. */
  lineLit: boolean[];
  /** The lights' palette (0-2, flashing) or -1 for the machine's own. */
  lightsPal: number;
  /** The digital display's palette: the Poké Ball's shine (0-2) or 3 its own. */
  displayPal: number;
  /** The Pikachu aura's colour 3 lightened (0-16, MultiplyInvertedPaletteRGBComponents). */
  auraLight: number;
  /** The sprites' mosaic (REG_MOSAIC's): a block of 1 + this. */
  mosaic: number;
  /** Window 0 (its left, right, top and bottom) and whether sprites show in it and outside it. */
  win0: { left: number; right: number; top: number; bottom: number; objIn: boolean; objOut: boolean };
  message: SlotMessage | null;
  /** The YES/NO window's cursor (0 YES), while it's open. */
  yesNo: number | null;
  /** The info screen's text shown. */
  infoText: boolean;
  exited: boolean;
}

const newAnim = (): AnimState => ({ num: 0, cmd: 0, delay: 0, beginning: true, ended: false, paused: false, image: 0, hFlip: false });

/** A slot machine sat at (InitSlotMachine): `coins` the player's, `machineId` its luck. The screen fades in. */
export function newSlotMachine(machineId: SlotMachineId, coins: number, random: Random16): SlotMachine {
  const luckyGame = (random() & 1) === 1;
  const reelPositions = INITIAL_REEL_POSITIONS.map((p) => p[luckyGame ? 1 : 0]! % SYMBOLS_PER_REEL);
  const m: SlotMachine = {
    state: Task.Unfade,
    machineId,
    pikaPowerBolts: 0,
    luckyGame,
    machineBias: 0,
    reelTimeDraw: 0,
    didNotFailBias: false,
    biasSymbol: 0,
    matches: 0,
    reelTimeSpinsLeft: 0,
    reelTimeSpinsUsed: 0,
    coins: Math.max(0, Math.min(MAX_COINS, coins)),
    payout: 0,
    netCoinLoss: 0,
    bet: 0,
    reeltimePixelOffset: 0,
    reeltimePosition: 0,
    currentReel: 0,
    reelSpeed: REEL_NORMAL_SPEED,
    reelPixelOffsets: reelPositions.map((p) => (REEL_HEIGHT - p * REEL_SYMBOL_HEIGHT) % REEL_HEIGHT),
    reelShockOffsets: [0, 0, 0],
    reelPositions,
    reelExtraTurns: [0, 0, 0],
    winnerRows: [0, 0, 0],
    spinBet: 0,
    timer: 0,
    timer2: 0,
    reels: [0, 1, 2].map(() => ({ state: 0, d1: 0, timer: 0, moving: false })),
    payoutTask: null,
    stopButtons: [],
    lights: null,
    pikaBolt: Array(16).fill(0),
    reelTime: null,
    infoBox: null,
    display: { scene: -1, sprites: Array(12).fill(NO_SPRITE) },
    fanfare: null,
    music: 'corner',
    sprites: Array(64).fill(null),
    flashLineSprites: [],
    rt: { pikachu: 0, gap: 0, explosion: 0, broken: 0, smoke: 0, machine: [], numbers: [], shadows: [], bolts: [], aura: [], ducks: [] },
    // The setup's fade in from black (CB2_SlotMachineSetup), under way as the game starts.
    fade: { active: true, y: 16, target: 0, dec: true, toggle: false, finishing: false, finishCounter: 0 },
    spriteOffsetX: 0,
    spriteOffsetY: 0,
    bg1Hofs: 0,
    bg1Vofs: 0,
    bg1: Array(1024).fill(0),
    bg2: 'menu',
    bg2Writes: {},
    bg3Shown: true,
    lineLit: Array(SLOT_LINES).fill(false),
    lightsPal: -1,
    displayPal: 3,
    auraLight: 0,
    mosaic: 0,
    win0: fullWindow(),
    message: null,
    yesNo: null,
    infoText: false,
    exited: false,
  };
  // The invisible sprites that flash the lines (CreateInvisibleFlashMatchLineSprites), in the game's sprite slots after
  // the reels' symbols (15) and the coin numbers (8).
  for (let i = 0; i < SLOT_LINES; i++) {
    const id = 23 + i;
    m.sprites[id] = makeSprite('flash_line', 'flashLine', 0, 0, 0, 0);
    m.sprites[id]!.invisible = true;
    m.sprites[id]!.data[0] = i;
    m.flashLineSprites.push(id);
  }
  return m;
}

const fullWindow = () => ({ left: 0, right: 240, top: 0, bottom: 160, objIn: true, objOut: true });

/** One frame's context: the machine, the buttons, the game's Random() and what the frame did. */
interface Frame {
  m: SlotMachine;
  input: SlotInput;
  random: Random16;
  events: SlotEvent[];
}

const isNew = (f: Frame, key: number) => (f.input.pressed & key) !== 0;
const isHeld = (f: Frame, key: number) => (f.input.held & key) !== 0;
const playSE = (f: Frame, sound: SlotSound) => f.events.push({ sound });

/**
 * One frame of the game (CB2_SlotMachine), changing `m` in place: its tasks in their priorities' order (the machine's,
 * the info screen's, the reels', the payout's, the stop buttons', the lights', Reel Time's, the Power meter's, the
 * fanfare's), then the sprites' callbacks and animations, then the fade. Returns what the frame did.
 */
export function slotFrame(m: SlotMachine, input: SlotInput, random: Random16): SlotEvent[] {
  const f: Frame = { m, input, random, events: [] };
  if (m.exited) return f.events;
  while (slotTask(f));
  if (m.infoBox) infoBoxTask(f);
  for (let i = 0; i < NUM_REELS; i++) reelTask(f, i);
  if (m.payoutTask) payoutTask(f);
  for (const button of [...m.stopButtons]) stopButtonTask(f, button);
  if (m.lights) lightsTask(f);
  if (m.reelTime) reelTimeTask(f);
  pikaBoltTask(f);
  if (m.fanfare) {
    // Task_Fanfare: the map's music plays on when it's over (m4aMPlayContinue).
    if (m.fanfare.counter) m.fanfare.counter--;
    else m.fanfare = null;
  }
  m.sprites.forEach((sprite, id) => {
    if (!sprite) return;
    spriteCallback(f, sprite);
    if (m.sprites[id] === sprite) animateSprite(sprite);
  });
  updateFade(m);
  return f.events;
}

// ---- The palette fade (palette.c's BeginNormalPaletteFade / UpdateNormalPaletteFade) ----

function beginFade(m: SlotMachine, start: number, target: number) {
  if (m.fade.active) return false;
  m.fade = { active: true, y: start, target, dec: start >= target, toggle: false, finishing: false, finishCounter: 0 };
  updateFade(m);
  return true;
}

function updateFade(m: SlotMachine) {
  const fade = m.fade;
  if (!fade.active) return;
  if (fade.finishing) {
    if (fade.finishCounter === 4) Object.assign(fade, { active: false, finishing: false, finishCounter: 0 });
    else fade.finishCounter++;
    return;
  }
  // The BG palettes blend one frame, the sprites' the next; then y steps by 2.
  fade.toggle = !fade.toggle;
  if (fade.toggle) return;
  if (fade.y === fade.target) fade.finishing = true;
  else fade.y = fade.dec ? Math.max(fade.target, fade.y - 2) : Math.min(fade.target, fade.y + 2);
}

const fadeActive = (m: SlotMachine) => m.fade.active;

// ---- The slot machine's task (Task_SlotMachine) ----

function slotTask(f: Frame): boolean {
  const m = f.m;
  switch (m.state) {
    case Task.Unfade:
      beginFade(m, 16, 0);
      loadPikaPowerMeter(m, m.pikaPowerBolts);
      m.state = Task.WaitFade;
      return false;
    case Task.WaitFade:
      if (!fadeActive(m)) m.state = Task.ReadyNewSpin;
      return false;
    case Task.ReadyNewSpin:
      m.payout = 0;
      m.bet = 0;
      m.currentReel = 0;
      m.machineBias &= BIAS_7;
      m.state = Task.AskInsertBet;
      if (m.coins <= 0) m.state = Task.MsgNoMoreCoins;
      else if (m.reelTimeSpinsLeft) {
        m.state = Task.ReadyNewRtSpin;
        createDisplayScene(f, DISPLAY_REEL_TIME);
      }
      return true;
    case Task.ReadyNewRtSpin:
      if (displayAnimFinished(m)) m.state = Task.AskInsertBet;
      return false;
    case Task.AskInsertBet:
      createDisplayScene(f, DISPLAY_INSERT_BET);
      m.state = Task.BetInput;
      if (m.coins >= MAX_COINS) m.state = Task.MsgMaxCoins;
      return true;
    case Task.BetInput:
      if (isNew(f, SLOT_KEYS.select)) {
        openInfoBox(f, DISPLAY_INSERT_BET);
        m.state = Task.WaitInfoBox;
      } else if (isNew(f, SLOT_KEYS.r)) {
        // Bet the most at once, or "You don't have three COINS." (whatever's already bet).
        if (m.coins - (MAX_BET - m.bet) >= 0) {
          for (let i = m.bet; i < MAX_BET; i++) m.lineLit = lightenBetTiles(m.lineLit, i, true);
          m.coins -= MAX_BET - m.bet;
          m.spinBet += MAX_BET - m.bet;
          m.bet = MAX_BET;
          m.state = Task.StartSpin;
          playSE(f, 'se_shop');
        } else m.state = Task.MsgNeed3Coins;
      } else {
        if (isNew(f, SLOT_KEYS.down) && m.coins !== 0) {
          playSE(f, 'se_shop');
          m.lineLit = lightenBetTiles(m.lineLit, m.bet, true);
          m.coins--;
          m.spinBet++;
          m.bet++;
        }
        if (m.bet >= MAX_BET || (m.bet !== 0 && isNew(f, SLOT_KEYS.a))) m.state = Task.StartSpin;
        if (isNew(f, SLOT_KEYS.b)) m.state = Task.AskQuit;
      }
      return false;
    case Task.MsgNeed3Coins:
      m.message = 'need3';
      m.state = Task.WaitMsgNeed3Coins;
      return false;
    case Task.WaitMsgNeed3Coins:
      if (isNew(f, SLOT_KEYS.a | SLOT_KEYS.b)) {
        m.message = null;
        m.state = Task.BetInput;
      }
      return false;
    case Task.WaitInfoBox:
      if (!m.infoBox) m.state = Task.BetInput;
      return false;
    case Task.StartSpin:
      drawMachineBias(f);
      destroyDisplayScene(f);
      for (let i = 0; i < NUM_REELS; i++) Object.assign(m.reels[i]!, { state: REEL_SPIN, moving: true });
      m.timer = 0;
      if (m.machineBias & BIAS_REELTIME) {
        beginReelTime(f);
        m.state = Task.StartRtSpin;
      } else {
        createDisplayScene(f, DISPLAY_STOP_REEL);
        m.state = Task.ResetBiasFailure;
      }
      m.reelSpeed = REEL_NORMAL_SPEED;
      if (m.reelTimeSpinsLeft) m.reelSpeed = reelTimeSpeed(f);
      return false;
    case Task.StartRtSpin:
      if (!m.reelTime) {
        createDisplayScene(f, DISPLAY_STOP_REEL);
        m.machineBias &= ~BIAS_REELTIME;
        m.state = Task.ResetBiasFailure;
      }
      return false;
    case Task.ResetBiasFailure:
      if (++m.timer >= 30) {
        m.didNotFailBias = m.machineBias !== 0;
        m.state = Task.WaitReelStop;
      }
      return false;
    case Task.WaitReelStop:
      if (isNew(f, SLOT_KEYS.a)) {
        playSE(f, 'se_contest_place');
        m.reels[m.currentReel]!.state = REEL_DECIDE_STOP;
        pressStopReelButton(f, m.currentReel);
        m.state = Task.WaitAllReelsStop;
      }
      return false;
    case Task.WaitAllReelsStop:
      if (!m.reels[m.currentReel]!.moving) {
        m.currentReel++;
        m.state = Task.WaitReelStop;
        if (m.currentReel >= NUM_REELS) m.state = Task.CheckMatches;
        return true;
      }
      return false;
    case Task.CheckMatches:
      checkMatches(f);
      return false;
    case Task.WaitPayout:
      if (!m.payoutTask) m.state = Task.EndPayout;
      return false;
    case Task.EndPayout:
      if (tryStopLights(m)) {
        m.state = Task.ResetBetTiles;
        if (m.matches & (1 << MATCH_REPLAY)) {
          m.currentReel = 0;
          m.state = Task.StartSpin;
        }
        if (m.matches & (1 << MATCH_POWER)) m.state = Task.MatchedPower;
        if (m.reelTimeSpinsLeft && m.matches & (1 << MATCH_REPLAY)) {
          createDisplayScene(f, DISPLAY_REEL_TIME);
          m.state = Task.WaitRtAnim;
        }
      }
      return false;
    case Task.MatchedPower:
      if (!m.pikaBolt[15]) {
        m.state = Task.ResetBetTiles;
        if (m.matches & (1 << MATCH_REPLAY)) {
          m.state = Task.StartSpin;
          if (m.reelTimeSpinsLeft) {
            createDisplayScene(f, DISPLAY_REEL_TIME);
            m.state = Task.WaitRtAnim;
          }
        }
      }
      return false;
    case Task.WaitRtAnim:
      if (displayAnimFinished(m)) {
        m.state = Task.ResetBetTiles;
        if (m.matches & (1 << MATCH_REPLAY)) m.state = Task.StartSpin;
      }
      return false;
    case Task.ResetBetTiles:
      for (let i = 0; i < MAX_BET; i++) m.lineLit = lightenBetTiles(m.lineLit, i, false);
      m.state = Task.ReadyNewSpin;
      return false;
    case Task.NoMatches:
      if (++m.timer2 > 64) {
        m.timer2 = 0;
        m.state = Task.ResetBetTiles;
      }
      return false;
    case Task.AskQuit:
      m.message = 'quit';
      m.yesNo = 0;
      m.state = Task.HandleQuitInput;
      return false;
    case Task.HandleQuitInput: {
      const input = menuInput(f);
      if (input === 0) {
        m.message = null;
        m.yesNo = null;
        for (let i = 0; i < MAX_BET; i++) m.lineLit = lightenBetTiles(m.lineLit, i, false);
        m.coins += m.bet;
        m.spinBet = 0;
        m.state = Task.End;
      } else if (input === 1 || input === 'b') {
        m.message = null;
        m.yesNo = null;
        m.state = Task.BetInput;
      }
      return false;
    }
    case Task.MsgMaxCoins:
      m.message = 'maxCoins';
      m.state = Task.WaitMsgMaxCoins;
      return false;
    case Task.WaitMsgMaxCoins:
      if (isNew(f, SLOT_KEYS.a | SLOT_KEYS.b)) {
        m.message = null;
        m.state = Task.BetInput;
      }
      return false;
    case Task.MsgNoMoreCoins:
      m.message = 'noCoins';
      m.state = Task.WaitMsgNoMoreCoins;
      return false;
    case Task.WaitMsgNoMoreCoins:
      if (isNew(f, SLOT_KEYS.a | SLOT_KEYS.b)) {
        m.message = null;
        m.state = Task.End;
      }
      return false;
    case Task.End:
      beginFade(m, 0, 16);
      m.state = Task.Free;
      return false;
    case Task.Free:
      if (!fadeActive(m)) {
        m.exited = true;
        f.events.push({ exit: true });
      }
      return false;
  }
  return false;
}

/** The YES/NO menu's answer this frame (Menu_ProcessInputNoWrapClearOnChoose): 0 YES, 1 NO, 'b', or null. */
function menuInput(f: Frame): number | 'b' | null {
  const m = f.m;
  if (isNew(f, SLOT_KEYS.a)) {
    playSE(f, 'se_select');
    return m.yesNo ?? 0;
  }
  if (isNew(f, SLOT_KEYS.b)) return 'b';
  const move = isNew(f, SLOT_KEYS.up) ? -1 : isNew(f, SLOT_KEYS.down) ? 1 : 0;
  if (move) {
    const next = Math.max(0, Math.min(1, (m.yesNo ?? 0) + move));
    if (next !== m.yesNo) playSE(f, 'se_select');
    m.yesNo = next;
  }
  return null;
}

/** SlotTask_CheckMatches: the lines' matches and their payout, the fanfare, the 7s' and Power's effects; the round reported. */
function checkMatches(f: Frame) {
  const m = f.m;
  m.machineBias &= BIAS_7;
  checkMatch(m);
  f.events.push({ round: { bet: m.spinBet, payout: m.payout } });
  m.spinBet = 0;
  if (m.reelTimeSpinsLeft) {
    m.reelTimeSpinsLeft--;
    m.reelTimeSpinsUsed++;
  }
  if (m.matches) {
    m.state = Task.WaitPayout;
    // AwardPayout: the payout's task, run at once.
    m.payoutTask = { state: 0, timer: 0 };
    payoutTask(f);
    // FlashSlotMachineLights: the lights' task, run at once.
    m.lights = { delay: 0, state: 0, dir: 1 };
    lightsTask(f);
    if ((m.netCoinLoss -= m.payout) < 0) m.netCoinLoss = 0;
    if (m.matches & ((1 << MATCH_BLUE_7) | (1 << MATCH_RED_7))) {
      playFanfare(f, 'mus_slots_jackpot');
      createDisplayScene(f, DISPLAY_BONUS_BIG);
    } else if (m.matches & (1 << MATCH_MIXED_7)) {
      playFanfare(f, 'mus_slots_jackpot');
      createDisplayScene(f, DISPLAY_BONUS_REG);
    } else {
      playFanfare(f, 'mus_slots_win');
      createDisplayScene(f, DISPLAY_WIN);
    }
    if (m.matches & ((1 << MATCH_MIXED_7) | (1 << MATCH_BLUE_7) | (1 << MATCH_RED_7))) {
      m.machineBias &= ~BIAS_7;
      if (m.matches & ((1 << MATCH_BLUE_7) | (1 << MATCH_RED_7))) {
        // Reel Time ends; a blue 7 makes the game lucky, a red one normal.
        m.reelTimeSpinsLeft = 0;
        m.reelTimeSpinsUsed = 0;
        m.luckyGame = (m.matches & (1 << MATCH_BLUE_7)) !== 0;
      }
    }
    if (m.matches & (1 << MATCH_POWER) && m.pikaPowerBolts < 16) {
      m.pikaPowerBolts++;
      addPikaPowerBolt(m);
    }
  } else {
    createDisplayScene(f, DISPLAY_LOSE);
    m.state = Task.NoMatches;
    if ((m.netCoinLoss += m.bet) > MAX_COINS) m.netCoinLoss = MAX_COINS;
  }
}

/** PlayFanfare: the map's music stops for it (the web app pauses the site's). */
function playFanfare(f: Frame, song: SlotFanfare) {
  f.m.fanfare = { song, counter: FANFARE_FRAMES[song] };
  f.events.push({ fanfare: song });
}

const fanfareInactive = (m: SlotMachine) => !m.fanfare;

/** Whether the machine waits for a bet (the digital display's INSERT): the bet's buttons, SELECT and B count. */
export const slotAwaitingBet = (m: SlotMachine) => m.state === Task.BetInput && !m.message && !m.infoBox;
/** Whether the machine waits for A to stop the next reel. */
export const slotAwaitingStop = (m: SlotMachine) => m.state === Task.WaitReelStop;

// ---- The biases ----

/**
 * DrawMachineBias: the bias for this spin (but during Reel Time, or while the 7s' bias stays): perhaps a draw for a
 * special bias (7s or Reel Time), then perhaps a regular one (none after a 7s' bias; one with Reel Time's).
 */
function drawMachineBias(f: Frame) {
  const m = f.m;
  if (m.reelTimeSpinsLeft !== 0 || m.machineBias & BIAS_7) return;
  if (shouldTrySpecialBias(f)) {
    const which = trySelectBias(f, BIAS_PROBABILITIES_SPECIAL, false);
    if (which !== BIASES_SPECIAL.length) {
      m.machineBias |= BIASES_SPECIAL[which]!;
      if (which !== 1) return;
    }
  }
  const which = trySelectBias(f, BIAS_PROBABILITIES_REGULAR, true);
  if (which !== BIASES_REGULAR.length) m.machineBias |= BIASES_REGULAR[which]!;
}

/** ShouldTrySpecialBias: Random()'s low byte under the machine's odds for the bet. */
function shouldTrySpecialBias(f: Frame) {
  const rval = f.random() & 0xff;
  return SPECIAL_DRAW_ODDS[f.m.machineId]![f.m.bet - 1]! > rval;
}

/** TrySelectBias_Special / _Regular: each bias in turn, or none (the list's length); a lucky game favours Power over Replay. */
function trySelectBias(f: Frame, probabilities: number[][], regular: boolean) {
  let which = 0;
  for (; which < probabilities.length; which++) {
    const rval = f.random() & 0xff;
    let value = probabilities[which]![f.m.machineId]!;
    if (regular && which === 0 && f.m.luckyGame) value = Math.min(0x100, value + 10);
    else if (regular && which === 4 && f.m.luckyGame) value = Math.max(0, value - 10);
    if (value > rval) break;
  }
  return which;
}

/** GetBiasSymbol: the symbol of the bias's lowest bit. */
function biasSymbolOf(machineBias: number) {
  for (let i = 0; i < 8; i++) {
    if (machineBias & 1) return BIAS_SYMBOLS[i]!;
    machineBias >>= 1;
  }
  return 0;
}

const reelTimeSpinProbability = (m: SlotMachine, spins: number) =>
  (m.luckyGame ? REELTIME_PROBABILITIES_LUCKY : REELTIME_PROBABILITIES_NORMAL)[spins]![m.pikaPowerBolts]!;

/**
 * GetReelTimeDraw: how many Reel Time spins the lottery lands on. A first draw for 0, then 5 down to 1 each drawn in turn,
 * and 0 if they all miss (a bug: it makes 0 far likelier than the tables mean).
 */
function reelTimeDraw(f: Frame) {
  const m = f.m;
  m.reelTimeDraw = 0;
  if ((f.random() & 0xff) < reelTimeSpinProbability(m, 0)) return;
  let spins = 5;
  for (; spins > 0; spins--) if ((f.random() & 0xff) < reelTimeSpinProbability(m, spins)) break;
  m.reelTimeDraw = spins;
}

/** ReelTimeSpeed: Reel Time's reels at half or quarter speed, likelier the more coins were lost and the more spins used. */
function reelTimeSpeed(f: Frame) {
  const m = f.m;
  const i = m.netCoinLoss >= 300 ? 4 : m.netCoinLoss >= 250 ? 3 : m.netCoinLoss >= 200 ? 2 : m.netCoinLoss >= 150 ? 1 : 0;
  if (f.random() % 100 < REELTIME_SPEED_PROBABILITIES[i]![0]!) return REEL_HALF_SPEED;
  if (f.random() % 100 < REELTIME_SPEED_PROBABILITIES[i]![1]! + QUARTER_SPEED_BOOST[m.reelTimeSpinsUsed]!) return REEL_QUARTER_SPEED;
  return REEL_NORMAL_SPEED;
}

// ---- Matches ----

/** CheckMatch: the middle row; with 2 coins the top and bottom rows; with 3 the diagonals (a cherry there pays nothing more). */
function checkMatch(m: SlotMachine) {
  m.matches = 0;
  const line = (rows: number[], lineId: number, topBottom = false, diagonal = false) => {
    let match = slotMatch(slotSymbolAtRest(m, 0, rows[0]!), slotSymbolAtRest(m, 1, rows[1]!), slotSymbolAtRest(m, 2, rows[2]!));
    if (match === MATCH_NONE) return;
    if (topBottom && match === MATCH_CHERRY) match = MATCH_TOPBOT_CHERRY;
    if (!diagonal || match !== MATCH_CHERRY) {
      m.payout += SLOT_PAYOUTS[match]!;
      m.matches |= 1 << match;
    }
    flashMatchLine(m, lineId);
  };
  line([2, 2, 2], MATCH_MIDDLE_ROW);
  if (m.bet > 1) {
    line([1, 1, 1], MATCH_TOP_ROW, true);
    line([3, 3, 3], MATCH_BOTTOM_ROW, true);
  }
  if (m.bet > 2) {
    line([1, 2, 3], MATCH_NWSE_DIAG, false, true);
    line([3, 2, 1], MATCH_NESW_DIAG, false, true);
  }
}

/** GetMatchFromSymbols: 3 the same; red-red-blue or blue-blue-red 7s (Reg Bonus); otherwise a cherry on the left reel. */
export function slotMatch(sym1: number, sym2: number, sym3: number) {
  if (sym1 === sym2 && sym1 === sym3) return SYMBOL_TO_MATCH[sym1]!;
  if (sym1 === SYMBOL_7_RED && sym2 === SYMBOL_7_RED && sym3 === SYMBOL_7_BLUE) return MATCH_MIXED_7;
  if (sym1 === SYMBOL_7_BLUE && sym2 === SYMBOL_7_BLUE && sym3 === SYMBOL_7_RED) return MATCH_MIXED_7;
  if (sym1 === SYMBOL_CHERRY) return MATCH_CHERRY;
  return MATCH_NONE;
}

/** GetSymbolAtRest: the symbol `offset` below the top of the reel's tape as it's shown (1-3 the rows on screen). */
export function slotSymbolAtRest(m: SlotMachine, reel: number, offset: number) {
  let pos = (m.reelPositions[reel]! + offset) % SYMBOLS_PER_REEL;
  if (pos < 0) pos += SYMBOLS_PER_REEL;
  return SLOT_REEL_SYMBOLS[reel]![pos]!;
}

/** GetSymbol: as if the reel had snapped down to its next symbol. */
function symbolAt(m: SlotMachine, reel: number, offset: number) {
  const inc = m.reelPixelOffsets[reel]! % REEL_SYMBOL_HEIGHT !== 0 ? -1 : 0;
  return slotSymbolAtRest(m, reel, offset + inc);
}

const reelTimeSymbol = (m: SlotMachine, offset: number) => {
  let pos = (m.reeltimePosition + offset) % REELTIME_SYMBOLS;
  if (pos < 0) pos += REELTIME_SYMBOLS;
  return REELTIME_REEL[pos]!;
};

function advanceSlotReel(m: SlotMachine, reel: number, value: number) {
  m.reelPixelOffsets[reel] = (m.reelPixelOffsets[reel]! + value) % REEL_HEIGHT;
  m.reelPositions[reel] = SYMBOLS_PER_REEL - Math.trunc(m.reelPixelOffsets[reel]! / REEL_SYMBOL_HEIGHT);
}

function advanceSlotReelToNextSymbol(m: SlotMachine, reel: number, value: number) {
  let offset = m.reelPixelOffsets[reel]! % REEL_SYMBOL_HEIGHT;
  if (offset !== 0) {
    if (offset < value) value = offset;
    advanceSlotReel(m, reel, value);
    offset = m.reelPixelOffsets[reel]! % REEL_SYMBOL_HEIGHT;
  }
  return offset;
}

function advanceReeltimeReel(m: SlotMachine, value: number) {
  m.reeltimePixelOffset = (m.reeltimePixelOffset + value) % REELTIME_REEL_HEIGHT;
  m.reeltimePosition = REELTIME_SYMBOLS - Math.trunc(m.reeltimePixelOffset / REELTIME_SYMBOL_HEIGHT);
}

function advanceReeltimeReelToNextSymbol(m: SlotMachine, value: number) {
  let offset = m.reeltimePixelOffset % REELTIME_SYMBOL_HEIGHT;
  if (offset !== 0) {
    if (offset < value) value = offset;
    advanceReeltimeReel(m, value);
    offset = m.reeltimePixelOffset % REELTIME_SYMBOL_HEIGHT;
  }
  return offset;
}

// ---- The payout (Task_Payout) ----

/** Once the lines have flashed: a coin a time, every 8 frames (4 while A is held); START pays the rest at once. */
function payoutTask(f: Frame) {
  const m = f.m;
  const task = m.payoutTask!;
  for (;;) {
    if (task.state === 0) {
      if (!matchLinesDoneFlashingBeforePayout(m)) return;
      task.state++;
      if (m.payout === 0) {
        task.state = 2;
        continue;
      }
      return;
    }
    if (task.state === 1) {
      if (!task.timer--) {
        if (fanfareInactive(m)) playSE(f, 'se_pin');
        m.payout--;
        if (m.coins < MAX_COINS) m.coins++;
        task.timer = isHeld(f, SLOT_KEYS.a) ? 4 : 8;
      }
      if (fanfareInactive(m) && isNew(f, SLOT_KEYS.start)) {
        playSE(f, 'se_pin');
        m.coins = Math.min(MAX_COINS, m.coins + m.payout);
        m.payout = 0;
      }
      if (m.payout === 0) task.state++;
      return;
    }
    if (tryStopMatchLinesFlashing(m)) m.payoutTask = null;
    return;
  }
}

// ---- The reels (Task_Reel) ----

const REEL_STILL = 0;
const REEL_SPIN = 1;
const REEL_DECIDE_STOP = 2;
const REEL_STOP_MOVE = 3;
const REEL_STOP_SHAKE = 4;

function reelTask(f: Frame, reel: number) {
  const m = f.m;
  const task = m.reels[reel]!;
  for (;;) {
    switch (task.state) {
      case REEL_STILL:
        return;
      case REEL_SPIN:
        advanceSlotReel(m, reel, m.reelSpeed);
        return;
      case REEL_DECIDE_STOP:
        // In Reel Time the reel stops where it is; otherwise the bias's symbol is lined up if it can be, or a loss made.
        task.state++;
        m.winnerRows[reel] = 0;
        m.reelExtraTurns[reel] = 0;
        if (m.reelTimeSpinsLeft === 0) {
          if (m.machineBias === 0 || !m.didNotFailBias || !DECIDE_STOP_BIAS[reel]!(m)) {
            m.didNotFailBias = false;
            DECIDE_STOP_NO_BIAS[reel]!(m);
          }
        }
        task.d1 = m.reelExtraTurns[reel]!;
        continue;
      case REEL_STOP_MOVE: {
        let pixelPos = m.reelPixelOffsets[reel]! % REEL_SYMBOL_HEIGHT;
        if (pixelPos !== 0) pixelPos = advanceSlotReelToNextSymbol(m, reel, m.reelSpeed);
        else if (m.reelExtraTurns[reel]) {
          m.reelExtraTurns[reel]!--;
          advanceSlotReel(m, reel, m.reelSpeed);
          pixelPos = m.reelPixelOffsets[reel]! % REEL_SYMBOL_HEIGHT;
        }
        if (pixelPos === 0 && m.reelExtraTurns[reel] === 0) {
          task.state++;
          task.d1 = REEL_STOP_SHOCKS[task.d1]!;
          task.timer = 0;
        }
        return;
      }
      case REEL_STOP_SHAKE:
        m.reelShockOffsets[reel] = task.d1;
        task.d1 = -task.d1;
        task.timer++;
        if ((task.timer & 3) === 0) task.d1 >>= 1;
        if (task.d1 === 0) {
          task.state = REEL_STILL;
          task.moving = false;
          m.reelShockOffsets[reel] = 0;
        }
        return;
    }
    return;
  }
}

// The stopping decisions (sDecideStop_Bias, sDecideStop_NoBias): each sets the reel's winner row and extra turns.

const DECIDE_STOP_BIAS: ((m: SlotMachine) => boolean)[] = [
  // DecideStop_Bias_Reel1: toward the bias's symbol (either 7 for the 7s' biases).
  (m) => {
    let sym2 = biasSymbolOf(m.machineBias);
    let sym1 = sym2;
    if (m.machineBias & BIAS_7) {
      sym1 = SYMBOL_7_RED;
      sym2 = SYMBOL_7_BLUE;
    }
    return m.bet === 1 ? decideStopBiasReel1Bet1(m, sym1, sym2) : decideStopBiasReel1Bet2or3(m, sym1, sym2);
  },
  (m) => (m.bet === 3 ? decideStopBiasReel2Bet3(m) : decideStopBiasReel2Bet1or2(m)),
  // DecideStop_Bias_Reel3: the mixed 7s' bias turns to the other colour.
  (m) => {
    let biasSymbol = m.biasSymbol;
    if (m.machineBias & BIAS_MIXED_7) biasSymbol = m.biasSymbol === SYMBOL_7_RED ? SYMBOL_7_BLUE : SYMBOL_7_RED;
    return m.bet === 3 ? decideStopBiasReel3Bet3(m, biasSymbol) : decideStopBiasReel3Bet1or2(m, biasSymbol);
  },
];

function eitherSymbolAtPosReel1(m: SlotMachine, pos: number, sym1: number, sym2: number) {
  const sym = symbolAt(m, 0, pos);
  if (sym === sym1 || sym === sym2) {
    m.biasSymbol = sym;
    return true;
  }
  return false;
}

const cherriesOnScreenReel1 = (m: SlotMachine, turns: number) =>
  symbolAt(m, 0, 1 - turns) === SYMBOL_CHERRY || symbolAt(m, 0, 2 - turns) === SYMBOL_CHERRY || symbolAt(m, 0, 3 - turns) === SYMBOL_CHERRY;

function decideStopBiasReel1Bet1(m: SlotMachine, sym1: number, sym2: number) {
  for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
    if (eitherSymbolAtPosReel1(m, 2 - i, sym1, sym2)) {
      m.winnerRows[0] = 2;
      m.reelExtraTurns[0] = i;
      return true;
    }
  }
  return false;
}

/** With a cherry's or the 7s' bias, any row; otherwise only where no cherry will show (skipping more than it needs to). */
function decideStopBiasReel1Bet2or3(m: SlotMachine, sym1: number, sym2: number) {
  const cherry7Bias = (m.machineBias & (BIAS_7 | BIAS_CHERRY)) !== 0;
  if (cherry7Bias || !cherriesOnScreenReel1(m, 0)) {
    for (let i = 1; i <= 3; i++) {
      if (eitherSymbolAtPosReel1(m, i, sym1, sym2)) {
        m.winnerRows[0] = i;
        m.reelExtraTurns[0] = 0;
        return true;
      }
    }
  }
  for (let i = 1; i <= MAX_EXTRA_TURNS; i++) {
    if (cherry7Bias || !cherriesOnScreenReel1(m, i)) {
      if (eitherSymbolAtPosReel1(m, 1 - i, sym1, sym2)) {
        if (i === 1 && (cherry7Bias || !cherriesOnScreenReel1(m, 3))) {
          m.winnerRows[0] = 3;
          m.reelExtraTurns[0] = 3;
          return true;
        }
        if (i <= 3 && (cherry7Bias || !cherriesOnScreenReel1(m, i + 1))) {
          m.winnerRows[0] = 2;
          m.reelExtraTurns[0] = i + 1;
          return true;
        }
        m.winnerRows[0] = 1;
        m.reelExtraTurns[0] = i;
        return true;
      }
    }
  }
  return false;
}

function decideStopBiasReel2Bet1or2(m: SlotMachine) {
  const row = m.winnerRows[0]!;
  for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
    if (symbolAt(m, 1, row - i) === m.biasSymbol) {
      m.winnerRows[1] = row;
      m.reelExtraTurns[1] = i;
      return true;
    }
  }
  return false;
}

/** Turns a straight match diagonal when it would take 2 or 3 turns; adds the two diagonal cases a 2-coin bet misses. */
function decideStopBiasReel2Bet3(m: SlotMachine) {
  if (decideStopBiasReel2Bet1or2(m)) {
    if (m.winnerRows[0] !== 2 && m.reelExtraTurns[1]! > 1 && m.reelExtraTurns[1] !== 4) {
      for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
        if (symbolAt(m, 1, 2 - i) === m.biasSymbol) {
          m.winnerRows[1] = 2;
          m.reelExtraTurns[1] = i;
          break;
        }
      }
    }
    return true;
  }
  if (m.winnerRows[0] !== 2) {
    for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
      if (symbolAt(m, 1, 2 - i) === m.biasSymbol) {
        m.winnerRows[1] = 2;
        m.reelExtraTurns[1] = i;
        return true;
      }
    }
  }
  return false;
}

function decideStopBiasReel3Bet1or2(m: SlotMachine, biasSymbol: number) {
  const row = m.winnerRows[1]!;
  for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
    if (symbolAt(m, 2, row - i) === biasSymbol) {
      m.winnerRows[2] = row;
      m.reelExtraTurns[2] = i;
      return true;
    }
  }
  return false;
}

function decideStopBiasReel3Bet3(m: SlotMachine, biasSymbol: number) {
  if (m.winnerRows[0] === m.winnerRows[1]) return decideStopBiasReel3Bet1or2(m, biasSymbol);
  const biasRow = m.winnerRows[0] === 1 ? 3 : 1;
  for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
    if (symbolAt(m, 2, biasRow - i) === biasSymbol) {
      m.reelExtraTurns[2] = i;
      m.winnerRows[2] = biasRow;
      return true;
    }
  }
  return false;
}

/** IfSymbol7_SwitchColor: the other colour's 7, or null for any other symbol. */
const otherSeven = (sym: number) => (sym === SYMBOL_7_RED ? SYMBOL_7_BLUE : sym === SYMBOL_7_BLUE ? SYMBOL_7_RED : null);
const mismatched77 = (a: number, b: number) => (a === SYMBOL_7_RED && b === SYMBOL_7_BLUE) || (a === SYMBOL_7_BLUE && b === SYMBOL_7_RED);
const mismatched777 = (a: number, b: number, c: number) =>
  (a === SYMBOL_7_RED && b === SYMBOL_7_BLUE && c === SYMBOL_7_RED) || (a === SYMBOL_7_BLUE && b === SYMBOL_7_RED && c === SYMBOL_7_BLUE);
/** NeitherMatchNor7Mismatch (it doesn't count cherries). */
const neitherMatchNor7Mismatch = (a: number, b: number, c: number) =>
  !(mismatched777(a, b, c) || (a === SYMBOL_7_RED && b === SYMBOL_7_RED && c === SYMBOL_7_BLUE) || (a === SYMBOL_7_BLUE && b === SYMBOL_7_BLUE && c === SYMBOL_7_RED) || (a === b && a === c));

const DECIDE_STOP_NO_BIAS: ((m: SlotMachine) => void)[] = [
  // DecideStop_NoBias_Reel1: on past any cherry.
  (m) => {
    let i = 0;
    while (cherriesOnScreenReel1(m, i)) i++;
    m.reelExtraTurns[0] = i;
  },
  (m) => [noBiasReel2Bet1, noBiasReel2Bet2, noBiasReel2Bet3][m.bet - 1]!(m),
  (m) => [noBiasReel3Bet1, noBiasReel3Bet2, noBiasReel3Bet3][m.bet - 1]!(m),
];

// The machine taunts a player who failed the straight 7s' bias: the other colour's 7 lined up next to theirs.
// (reelExtraTurns of a reel already stopped is 0 by now, as the game reads it.)
function noBiasReel2Bet1(m: SlotMachine) {
  if (m.winnerRows[0] !== 0 && m.machineBias & BIAS_STRAIGHT_7) {
    const sym = otherSeven(symbolAt(m, 0, 2 - m.reelExtraTurns[0]!));
    if (sym === null) return;
    for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
      if (sym === symbolAt(m, 1, 2 - i)) {
        m.winnerRows[1] = 2;
        m.reelExtraTurns[1] = i;
        break;
      }
    }
  }
}

function noBiasReel2Bet2(m: SlotMachine) {
  if (m.winnerRows[0] !== 0 && m.machineBias & BIAS_STRAIGHT_7) {
    const sym = otherSeven(symbolAt(m, 0, m.winnerRows[0]! - m.reelExtraTurns[0]!));
    if (sym === null) return;
    for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
      if (sym === symbolAt(m, 1, m.winnerRows[0]! - i)) {
        m.winnerRows[1] = m.winnerRows[0]!;
        m.reelExtraTurns[1] = i;
        break;
      }
    }
  }
}

/** It misses the chance when the 7 is in the bottom row and the other 7 could reach the middle row in 4 turns (as the game does). */
function noBiasReel2Bet3(m: SlotMachine) {
  if (m.winnerRows[0] === 0 || !(m.machineBias & BIAS_STRAIGHT_7)) return;
  if (m.winnerRows[0] === 2) return noBiasReel2Bet2(m);
  const sym = otherSeven(symbolAt(m, 0, m.winnerRows[0]! - m.reelExtraTurns[0]!));
  if (sym === null) return;
  let j = m.winnerRows[0] === 3 ? 3 : 2;
  for (let i = 0; i < 2; i++, j--) {
    if (sym === symbolAt(m, 1, j)) {
      m.winnerRows[1] = j;
      m.reelExtraTurns[1] = 0;
      return;
    }
  }
  for (j = 1; j <= MAX_EXTRA_TURNS; j++) {
    if (sym === symbolAt(m, 1, m.winnerRows[0]! - j)) {
      if (m.winnerRows[0] === 1) {
        if (j <= 2) {
          m.winnerRows[1] = 2;
          m.reelExtraTurns[1] = j + 1;
        } else {
          m.winnerRows[1] = 1;
          m.reelExtraTurns[1] = j;
        }
      } else if (j <= 2) {
        m.winnerRows[1] = 3;
        m.reelExtraTurns[1] = j;
      } else {
        m.winnerRows[1] = 2;
        m.reelExtraTurns[1] = j - 1;
      }
      return;
    }
  }
}

/** On until the middle row doesn't match (or, taunting, the 7s don't). */
function noBiasReel3Bet1(m: SlotMachine) {
  let i = 0;
  const sym1 = symbolAt(m, 0, 2 - m.reelExtraTurns[0]!);
  const sym2 = symbolAt(m, 1, 2 - m.reelExtraTurns[1]!);
  if (sym1 === sym2) {
    for (;;) {
      const sym3 = symbolAt(m, 2, 2 - i);
      if (!(sym1 === sym3 || (sym1 === SYMBOL_7_RED && sym3 === SYMBOL_7_BLUE) || (sym1 === SYMBOL_7_BLUE && sym3 === SYMBOL_7_RED))) break;
      i++;
    }
  } else if (mismatched77(sym1, sym2)) {
    if (m.machineBias & BIAS_STRAIGHT_7) {
      for (i = 0; i <= MAX_EXTRA_TURNS; i++) {
        if (sym1 === symbolAt(m, 2, 2 - i)) {
          m.reelExtraTurns[2] = i;
          return;
        }
      }
    }
    i = 0;
    while (sym1 === symbolAt(m, 2, 2 - i)) i++;
  }
  m.reelExtraTurns[2] = i;
}

/** On (with no limit) until no row matches, a 7 mismatch allowed only when taunting. */
function noBiasReel3Bet2(m: SlotMachine) {
  let extraTurns = 0;
  if (m.winnerRows[1] !== 0 && m.winnerRows[0] === m.winnerRows[1] && m.machineBias & BIAS_STRAIGHT_7) {
    const sym1 = symbolAt(m, 0, m.winnerRows[0]! - m.reelExtraTurns[0]!);
    const sym2 = symbolAt(m, 1, m.winnerRows[1]! - m.reelExtraTurns[1]!);
    if (mismatched77(sym1, sym2)) {
      for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
        if (sym1 === symbolAt(m, 2, m.winnerRows[1]! - i)) {
          extraTurns = i;
          break;
        }
      }
    }
  }
  for (;;) {
    let matches = 0;
    for (let i = 1; i <= 3; i++) {
      const sym1 = symbolAt(m, 0, i - m.reelExtraTurns[0]!);
      const sym2 = symbolAt(m, 1, i - m.reelExtraTurns[1]!);
      const sym3 = symbolAt(m, 2, i - extraTurns);
      if (!neitherMatchNor7Mismatch(sym1, sym2, sym3) && !(mismatched777(sym1, sym2, sym3) && m.machineBias & BIAS_STRAIGHT_7)) {
        matches++;
        break;
      }
    }
    if (matches === 0) break;
    extraTurns++;
  }
  m.reelExtraTurns[2] = extraTurns;
}

/**
 * As for 2 coins, then on until neither diagonal matches. It never checks the rows again, so a row can still match
 * (as in the game).
 */
function noBiasReel3Bet3(m: SlotMachine) {
  noBiasReel3Bet2(m);
  if (m.winnerRows[1] !== 0 && m.winnerRows[0] !== m.winnerRows[1] && m.machineBias & BIAS_STRAIGHT_7) {
    const sym1 = symbolAt(m, 0, m.winnerRows[0]! - m.reelExtraTurns[0]!);
    const sym2 = symbolAt(m, 1, m.winnerRows[1]! - m.reelExtraTurns[1]!);
    if (mismatched77(sym1, sym2)) {
      const row = m.winnerRows[0] === 1 ? 3 : 1;
      for (let i = 0; i <= MAX_EXTRA_TURNS; i++) {
        if (sym1 === symbolAt(m, 2, row - (m.reelExtraTurns[2]! + i))) {
          m.reelExtraTurns[2]! += i;
          break;
        }
      }
    }
  }
  for (const [r1, r3] of [[1, 3], [3, 1]] as const) {
    for (;;) {
      const sym1 = symbolAt(m, 0, r1 - m.reelExtraTurns[0]!);
      const sym2 = symbolAt(m, 1, 2 - m.reelExtraTurns[1]!);
      const sym3 = symbolAt(m, 2, r3 - m.reelExtraTurns[2]!);
      if (neitherMatchNor7Mismatch(sym1, sym2, sym3) || (mismatched777(sym1, sym2, sym3) && m.machineBias & BIAS_STRAIGHT_7)) break;
      m.reelExtraTurns[2]!++;
    }
  }
}

// ---- The stop buttons, the lines and the lights ----

function pressStopReelButton(f: Frame, reel: number) {
  const button = { reel, state: 0, timer: 0 };
  f.m.stopButtons.push(button);
  stopButtonTask(f, button);
}

/** The reel's button shaded while pressed, 12 frames. */
function stopButtonTask(f: Frame, button: { reel: number; state: number; timer: number }) {
  const m = f.m;
  if (button.state === 0) {
    setReelButtonTilemap(m, REEL_BUTTON_OFFSETS[button.reel]!, [0x62, 0x63, 0x72, 0x73]);
    button.state++;
  } else if (button.state === 1) {
    if (++button.timer > 11) button.state++;
  } else {
    setReelButtonTilemap(m, REEL_BUTTON_OFFSETS[button.reel]!, [0x42, 0x43, 0x52, 0x53]);
    m.stopButtons = m.stopButtons.filter((b) => b !== button);
  }
}

function setReelButtonTilemap(m: SlotMachine, offset: number, tiles: number[]) {
  m.bg2Writes[15 * 32 + offset] = tiles[0]!;
  m.bg2Writes[15 * 32 + 1 + offset] = tiles[1]!;
  m.bg2Writes[16 * 32 + offset] = tiles[2]!;
  m.bg2Writes[16 * 32 + 1 + offset] = tiles[3]!;
}

/** LightenBetTiles / DarkenBetTiles: a coin's lines lit or dark. */
function lightenBetTiles(lit: boolean[], bet: number, on: boolean) {
  const next = [...lit];
  for (const line of SLOT_BET_LINES[bet]!) next[line] = on;
  return next;
}

/** FlashMatchLine: the line's colour darkens and comes back, 4 times in full before the payout, then by halves till it's paid. */
function flashMatchLine(m: SlotMachine, line: number) {
  const sprite = m.sprites[m.flashLineSprites[line]!]!;
  Object.assign(sprite.data, { 1: 1, 2: 4, 3: 0, 4: 0, 5: 2, 7: 0 });
}

function matchLinesDoneFlashingBeforePayout(m: SlotMachine) {
  return m.flashLineSprites.every((id) => {
    const d = m.sprites[id]!.data;
    return !(d[1] && d[2]);
  });
}

function tryStopMatchLinesFlashing(m: SlotMachine) {
  for (const id of m.flashLineSprites) {
    const d = m.sprites[id]!.data;
    if (!d[1]) continue;
    if (d[7]) d[1] = 0;
    if (!d[7]) return false;
  }
  return true;
}

/** How dark a line is drawn (MultiplyPaletteRGBComponents' 0-16), while it flashes. */
export function slotLineDarkness(m: SlotMachine, line: number) {
  const d = m.sprites[m.flashLineSprites[line]!]!.data;
  return d[1] ? d[4]! : 0;
}

/** The lights round the top: their palette goes inside, middle, outside and back, every 5 frames. */
function lightsTask(f: Frame) {
  const task = f.m.lights!;
  if (!task.delay--) {
    task.delay = 4;
    task.state += task.dir;
    if (task.state === 0 || task.state === 2) task.dir = -task.dir;
  }
  f.m.lightsPal = task.state;
}

/** TryStopSlotMachineLights: once they're back at the inside palette, the machine's own. */
function tryStopLights(m: SlotMachine) {
  if (m.lights && m.lights.state === 0) {
    m.lights = null;
    m.lightsPal = -1;
    return true;
  }
  return false;
}

// ---- The Pika Power meter (Task_CreatePikaPowerBolt) ----

function addPikaPowerBolt(m: SlotMachine) {
  const task = m.pikaBolt;
  for (let i = 2; i < 16; i++) task[i] = 0;
  task[0] = 1;
  task[1]!++;
  task[15] = 1;
}

function resetPikaPowerBolts(m: SlotMachine) {
  const task = m.pikaBolt;
  for (let i = 2; i < 16; i++) task[i] = 0;
  task[0] = 3;
  task[15] = 1;
}

/** The meter's bolt `bolts + 2` places along, lit or not (the first and last its ends). */
function meterTile(m: SlotMachine, n: number, lit: boolean) {
  const end = n === 1 ? 1 : n === 16 ? 2 : 0;
  m.bg2Writes[n + 2 + 0x40] = PIKA_POWER_TILES[end]![lit ? 0 : 1]!;
}

function pikaBoltTask(f: Frame) {
  const m = f.m;
  const task = m.pikaBolt;
  switch (task[0]) {
    case 1:
      // A bolt spins in over its place, then the meter's tile lights.
      task[2] = createSprite(m, 'power_bolt', 'powerBolt', (task[1]! << 3) + 20, 20, 2, 12);
      task[0]++;
      break;
    case 2:
      if (m.sprites[task[2]!]?.data[7]) {
        meterTile(m, task[1]!, true);
        m.sprites[task[2]!] = null;
        task[0] = 0;
        task[15] = 0;
      }
      break;
    case 3:
      // Cleared one a time, every 20 frames.
      if (task[2] === 0) {
        meterTile(m, task[1]!, false);
        task[1]!--;
      }
      if (++task[2]! >= 20) task[2] = 0;
      if (task[1] === 0) {
        task[0] = 0;
        task[15] = 0;
      }
      break;
  }
}

function loadPikaPowerMeter(m: SlotMachine, bolts: number) {
  for (let i = 0; i < 16; i++) meterTile(m, i + 1, i < bolts);
  m.pikaBolt[1] = bolts;
}

// ---- Reel Time (Task_ReelTime) ----

const RT_INIT = 0;
const RT_WINDOW_ENTER = 1;
const RT_WAIT_START_PIKA = 2;
const RT_PIKA_SPEEDUP1 = 3;
const RT_PIKA_SPEEDUP2 = 4;
const RT_WAIT_REEL = 5;
const RT_CHECK_EXPLODE = 6;
const RT_LAND = 7;
const RT_PIKA_REACT = 8;
const RT_WAIT_CLEAR_POWER = 9;
const RT_CLOSE_WINDOW_SUCCESS = 10;
const RT_DESTROY_SPRITES = 11;
const RT_SET_REEL_SPEED = 12;
const RT_END_SUCCESS = 13;
const RT_EXPLODE = 14;
const RT_WAIT_EXPLODE = 15;
const RT_WAIT_SMOKE = 16;
const RT_CLOSE_WINDOW_FAILURE = 17;
const RT_END_FAILURE = 18;

function beginReelTime(f: Frame) {
  f.m.reelTime = Array(16).fill(0);
  reelTimeTask(f);
}

/** LoadReelTimeWindowTilemap: a column of the window's tilemap (from its column `from`) written at column `col` of BG 1. */
function loadReelTimeWindowColumn(m: SlotMachine, col: number, from: number) {
  for (let i = 4; i < 15; i++) m.bg1[32 * i + col] = 1 + from + (i - 4) * 20;
}

function clearReelTimeWindowColumn(m: SlotMachine, col: number) {
  for (let i = 4; i < 15; i++) m.bg1[32 * i + col] = 0;
}

function reelTimeTask(f: Frame) {
  const m = f.m;
  const d = m.reelTime!;
  const rt = m.rt;
  const speed = () => d[4]! >> 8;
  switch (d[0]) {
    case RT_INIT:
      m.reelTimeSpinsLeft = 0;
      m.reeltimePixelOffset = 0;
      m.reeltimePosition = 0;
      d[0]++;
      d[1] = 0;
      d[2] = 30;
      d[4] = 1280;
      m.spriteOffsetX = 0;
      m.spriteOffsetY = 0;
      m.bg1Hofs = 0;
      m.bg1Vofs = 0;
      // Its first column written at column 30 (it passes REG_OFFSET_BG3VOFS for the column, as the game does).
      loadReelTimeWindowColumn(m, 0x1e, 0);
      rt.machine = [createSprite(m, 'rt_antennae', 'none', 368, 52, 1, 7, true), createSprite(m, 'rt_machine', 'none', 368, 84, 1, 7, true)];
      rt.pikachu = createSprite(m, 'rt_pikachu', 'rtPikachu', 280, 80, 1, 1, true);
      rt.numbers = [0, 20, 40].map((r5) => {
        const id = createSprite(m, 'rt_number', 'rtNumbers', 368, 0, 1, 10, true);
        m.sprites[id]!.data[7] = r5;
        return id;
      });
      rt.shadows = [createSprite(m, 'rt_shadow', 'none', 368, 100, 1, 9, true), createSprite(m, 'rt_shadow', 'none', 288, 104, 1, 4, true)];
      rt.gap = createSprite(m, 'rt_gap', 'none', 368, 76, 1, 11, true);
      reelTimeDraw(f);
      // StopMapMusic, then PlayNewMapMusic(MUS_ROULETTE).
      m.music = 'roulette';
      break;
    case RT_WINDOW_ENTER: {
      // The window slides in from the right, 8 pixels a frame, its columns written as they come in.
      m.spriteOffsetX -= 8;
      d[1]! += 8;
      const r3 = ((d[1]! + 240) & 0xff) >> 3;
      m.bg1Hofs = d[1]! & 0x1ff;
      if (r3 !== d[2] && d[3]! <= 18) {
        d[2] = r3;
        d[3] = d[1]! >> 3;
        loadReelTimeWindowColumn(m, r3, d[3]!);
      }
      if (d[1]! >= 200) {
        d[0]++;
        d[3] = 0;
      }
      advanceReeltimeReel(m, speed());
      break;
    }
    case RT_WAIT_START_PIKA:
      advanceReeltimeReel(m, speed());
      if (++d[5]! >= 60) {
        d[0]++;
        rt.bolts = [createSprite(m, 'rt_bolt', 'rtBolt', 152, 32, 1, 5), createSprite(m, 'rt_bolt', 'rtBolt', 184, 32, 1, 5)];
        Object.assign(m.sprites[rt.bolts[0]!]!, { hFlip: true });
        Object.assign(m.sprites[rt.bolts[0]!]!.data, { 0: 8, 1: -1, 2: -1, 7: 32 });
        Object.assign(m.sprites[rt.bolts[1]!]!.data, { 1: 1, 2: -1, 7: 32 });
        rt.aura = [createSprite(m, 'rt_aura', 'rtAura', 72, 80, 1, 3), createSprite(m, 'rt_aura', 'rtAura', 104, 80, 1, 3)];
        Object.assign(m.sprites[rt.aura[0]!]!.data, { 0: 1, 5: 0, 6: 16, 7: 8 });
        m.sprites[rt.aura[1]!]!.hFlip = true;
      }
      break;
    case RT_PIKA_SPEEDUP1: {
      // Pikachu charges faster as the reel slows down.
      advanceReeltimeReel(m, speed());
      d[4]! -= 4;
      const i = 4 - (d[4]! >> 8);
      for (const id of rt.bolts) m.sprites[id]!.data[7] = REELTIME_BOLT_DELAYS[i]!;
      m.sprites[rt.aura[0]!]!.data[7] = PIKACHU_AURA_FLASH_DELAYS[i]!;
      startSpriteAnimIfDifferent(m.sprites[rt.pikachu]!, REELTIME_PIKACHU_ANIMS[i]!);
      if (d[4]! <= 0x100) {
        d[0]++;
        d[4] = 0x100;
        d[5] = 0;
      }
      break;
    }
    case RT_PIKA_SPEEDUP2:
      advanceReeltimeReel(m, speed());
      if (++d[5]! >= 80) {
        d[0]++;
        d[5] = 0;
        m.sprites[rt.aura[0]!]!.data[7] = 2;
        startSpriteAnimIfDifferent(m.sprites[rt.pikachu]!, 3);
      }
      break;
    case RT_WAIT_REEL:
      advanceReeltimeReel(m, speed());
      d[4] = (d[4]! & 0xff) + 0x80;
      if (++d[5]! >= 80) {
        d[0]++;
        d[5] = 0;
      }
      break;
    case RT_CHECK_EXPLODE:
      // Every 40 frames: with a draw, on to land on it (at once: it compares the spins left, still 0, as the game does);
      // with none, up to 4 chances to explode, then it lands on 0.
      advanceReeltimeReel(m, speed());
      d[4] = (d[4]! & 0xff) + 0x40;
      if (++d[5]! >= 40) {
        d[5] = 0;
        if (m.reelTimeDraw) {
          if (m.reelTimeSpinsLeft <= d[6]!) d[0]++;
        } else if (d[6]! > 3) d[0]++;
        else if ((f.random() & 0xff) < REELTIME_EXPLODE_PROBABILITY[d[6]!]!) d[0] = RT_EXPLODE;
        d[6]!++;
      }
      break;
    case RT_LAND: {
      let offset = m.reeltimePixelOffset % 20;
      if (offset) {
        offset = advanceReeltimeReelToNextSymbol(m, speed());
        d[4] = (d[4]! & 0xff) + 0x40;
      } else if (reelTimeSymbol(m, 1) !== m.reelTimeDraw) {
        advanceReeltimeReel(m, speed());
        offset = m.reeltimePixelOffset % 20;
        d[4] = (d[4]! & 0xff) + 0x40;
      }
      if (offset === 0 && reelTimeSymbol(m, 1) === m.reelTimeDraw) {
        d[4] = 0;
        d[0]++;
      }
      break;
    }
    case RT_PIKA_REACT:
      if (++d[4]! >= 60) {
        m.music = 'none';
        destroySprites(m, rt.bolts);
        destroyAura(m);
        d[0]++;
        if (m.reelTimeDraw === 0) {
          d[4] = 0xa0;
          startSpriteAnimIfDifferent(m.sprites[rt.pikachu]!, 5);
          playFanfare(f, 'mus_too_bad');
        } else {
          // Spins won: the Power bolts are spent.
          d[4] = 0xc0;
          startSpriteAnimIfDifferent(m.sprites[rt.pikachu]!, 4);
          m.sprites[rt.pikachu]!.anim.cmd = 0;
          if (m.pikaPowerBolts) {
            resetPikaPowerBolts(m);
            m.pikaPowerBolts = 0;
          }
          playFanfare(f, 'mus_slots_win');
        }
      }
      break;
    case RT_WAIT_CLEAR_POWER:
      if ((d[4] === 0 || --d[4]! === 0) && !m.pikaBolt[15]) d[0]++;
      break;
    case RT_CLOSE_WINDOW_SUCCESS:
    case RT_CLOSE_WINDOW_FAILURE: {
      // The window slides on out to the left, its columns cleared.
      m.spriteOffsetX -= 8;
      d[1]! += 8;
      d[3]! += 8;
      const r4 = ((d[1]! - 8) & 0xff) >> 3;
      m.bg1Hofs = d[1]! & 0x1ff;
      if (d[3]! >> 3 <= 25) clearReelTimeWindowColumn(m, r4);
      else d[0]++;
      break;
    }
    case RT_DESTROY_SPRITES:
      m.reelTimeSpinsUsed = 0;
      m.reelTimeSpinsLeft = m.reelTimeDraw;
      m.spriteOffsetX = 0;
      m.bg1Hofs = 0;
      m.reelSpeed = REEL_NORMAL_SPEED;
      destroySprites(m, [rt.pikachu, rt.gap, ...rt.machine, ...rt.numbers, ...rt.shadows]);
      m.music = 'corner';
      if (m.reelTimeSpinsLeft === 0) m.reelTime = null;
      else {
        createDisplayScene(f, DISPLAY_REEL_TIME);
        d[1] = reelTimeSpeed(f);
        d[2] = 0;
        d[3] = 0;
        d[0]++;
      }
      break;
    case RT_SET_REEL_SPEED:
      // The reels slow, halving their speed now and then as the left one passes a symbol, to the speed drawn.
      if (m.reelSpeed === d[1]) d[0]++;
      else if (m.reelPixelOffsets[0]! % REEL_SYMBOL_HEIGHT === 0 && (++d[2]! & 0x07) === 0) m.reelSpeed >>= 1;
      break;
    case RT_END_SUCCESS:
      if (displayAnimFinished(m)) m.reelTime = null;
      break;
    case RT_EXPLODE:
      destroySprites(m, [rt.gap, ...rt.machine, ...rt.numbers]);
      destroySprites(m, rt.bolts);
      destroyAura(m);
      rt.explosion = createSprite(m, 'rt_explosion', 'rtExplosion', 168, 80, 1, 6);
      m.sprites[rt.shadows[0]!]!.invisible = true;
      startSpriteAnimIfDifferent(m.sprites[rt.pikachu]!, 5);
      d[0]++;
      d[4] = 4;
      d[5] = 0;
      m.music = 'none';
      playFanfare(f, 'mus_too_bad');
      playSE(f, 'se_m_explosion');
      break;
    case RT_WAIT_EXPLODE:
      // The screen shakes, less every 32 frames; then the broken machine, the smoke and Pikachu's dizzy ducks.
      m.spriteOffsetY = d[4]!;
      m.bg1Vofs = d[4]!;
      if (d[5]! & 1) d[4] = -d[4]!;
      if ((++d[5]! & 0x1f) === 0) d[4]! >>= 1;
      if (d[4] === 0) {
        m.sprites[rt.explosion] = null;
        rt.ducks = [0, 0x40, 0x80, 0xc0].map((angle) => {
          const id = createSprite(m, 'rt_duck', 'rtDuck', 80 - m.spriteOffsetX, 68, 1, 0, true);
          m.sprites[id]!.data[0] = angle;
          return id;
        });
        rt.broken = createSprite(m, 'rt_broken', 'none', 168 - m.spriteOffsetX, 80, 1, 7, true);
        rt.smoke = createSprite(m, 'rt_smoke', 'rtSmoke', 168, 60, 1, 8);
        m.sprites[rt.shadows[0]!]!.invisible = false;
        d[0]++;
        d[5] = 0;
      }
      break;
    case RT_WAIT_SMOKE:
      m.spriteOffsetY = 0;
      m.bg1Vofs = 0;
      if (m.sprites[rt.smoke]?.data[7]) {
        d[0]++;
        m.sprites[rt.smoke] = null;
      }
      break;
    case RT_END_FAILURE:
      m.spriteOffsetX = 0;
      m.bg1Hofs = 0;
      m.music = 'corner';
      destroySprites(m, [rt.pikachu, rt.broken, ...rt.shadows, ...rt.ducks]);
      m.reelTime = null;
      break;
  }
}

function destroySprites(m: SlotMachine, ids: number[]) {
  for (const id of ids) m.sprites[id] = null;
}

/** DestroyReelTimePikachuAuraSprites: the aura's colour back to its own. */
function destroyAura(m: SlotMachine) {
  m.auraLight = 0;
  destroySprites(m, m.rt.aura);
}

// ---- The info screen (Task_InfoBox) ----

function openInfoBox(f: Frame, scene: number) {
  f.m.infoBox = { state: 0, scene };
  infoBoxTask(f);
}

/** Fade out, the info screen, fade in; B or SELECT: fade out, the machine and its display back, fade in. */
function infoBoxTask(f: Frame) {
  const m = f.m;
  const task = m.infoBox!;
  const waitFade = () => {
    if (!fadeActive(m)) task.state++;
  };
  switch (task.state) {
    case 0:
      beginFade(m, 0, 16);
      task.state++;
      break;
    case 2:
      destroyDisplayScene(f);
      m.bg2 = 'info';
      m.bg2Writes = {};
      m.bg3Shown = false;
      task.state++;
      break;
    case 4:
      m.infoText = true;
      beginFade(m, 16, 0);
      task.state++;
      break;
    case 6:
      if (isNew(f, SLOT_KEYS.b | SLOT_KEYS.select)) {
        m.infoText = false;
        beginFade(m, 0, 16);
        task.state++;
      }
      break;
    case 8:
      m.bg2 = 'menu';
      m.bg2Writes = {};
      m.bg3Shown = true;
      task.state++;
      break;
    case 10:
      createDisplayScene(f, task.scene);
      task.state++;
      break;
    case 12:
      loadPikaPowerMeter(m, m.pikaPowerBolts);
      beginFade(m, 16, 0);
      task.state++;
      break;
    case 14:
      m.infoBox = null;
      break;
    default:
      waitFade();
  }
}

// ---- The digital display (the right panel's scenes) ----

const DISPLAY_INSERT_BET = 0;
const DISPLAY_STOP_REEL = 1;
const DISPLAY_WIN = 2;
const DISPLAY_LOSE = 3;
const DISPLAY_REEL_TIME = 4;
const DISPLAY_BONUS_REG = 5;
const DISPLAY_BONUS_BIG = 6;

/** Each display position (sDigitalDisplay_SpriteCoords, sDigitalDisplay_SpriteCallbacks), by DIG_DISPINFO_*. */
const DISP_INFO: [x: number, y: number, callback: Callback][] = [
  [208, 56, 'ddStatic'], [184, 0, 'ddStop'], [200, 8, 'ddStop'], [216, 16, 'ddStop'], [232, 24, 'ddStop'], [208, 72, 'ddAButtonStop'],
  [208, 8, 'ddPokeballRocking'], [208, 64, 'ddStatic'], [208, 56, 'ddStatic'], [192, 88, 'ddSmoke'], [224, 88, 'ddSmokeNE'],
  [192, 120, 'ddSmokeSW'], [224, 120, 'ddSmokeSE'], [144, 56, 'ddReel'], [272, 88, 'ddTime'], [168, 112, 'ddReelTimeNumber'],
  [208, 84, 'ddStatic'], [208, 112, 'ddPokeballShining'], [188, 52, 'ddRegBonus'], [208, 52, 'ddRegBonus'], [228, 52, 'ddRegBonus'],
  [184, 72, 'ddRegBonus'], [196, 72, 'ddRegBonus'], [208, 72, 'ddRegBonus'], [220, 72, 'ddRegBonus'], [232, 72, 'ddRegBonus'],
  [188, 52, 'ddBigBonus'], [208, 52, 'ddBigBonus'], [228, 52, 'ddBigBonus'], [184, 72, 'ddBigBonus'], [196, 72, 'ddBigBonus'],
  [208, 72, 'ddBigBonus'], [220, 72, 'ddBigBonus'], [232, 72, 'ddBigBonus'], [0, 0, 'ddAButtonStart'],
];

/** The scenes (sDigitalDisplayScenes): each sprite's kind, display position and own number. */
const SCENES: [SlotSpriteKind, number, number][][] = [
  [['empty', 34, 0], ['dd_insert', 0, 0], ['dd_d_pad', 16, 0]],
  [['dd_stop_s', 1, 0], ['dd_stop_t', 2, 0], ['dd_stop_o', 3, 0], ['dd_stop_p', 4, 0], ['dd_a_button', 5, 0], ['dd_pokeball', 6, 0]],
  [['dd_win', 7, 0], ['dd_pokeball', 17, 0]],
  [['dd_lose', 8, 0], ['dd_smoke', 9, 0], ['dd_smoke', 10, 1], ['dd_smoke', 11, 2], ['dd_smoke', 12, 3]],
  [['dd_reel', 13, 0], ['dd_time', 14, 0], ['dd_number', 15, 0]],
  [['dd_reg_r', 18, 0], ['dd_reg_e', 19, 1], ['dd_reg_g', 20, 2], ['dd_bonus_b', 21, 3], ['dd_bonus_o', 22, 4], ['dd_bonus_n', 23, 5], ['dd_bonus_u', 24, 6], ['dd_bonus_s', 25, 7], ['dd_pokeball', 17, 0]],
  [['dd_big_b', 26, 0], ['dd_big_i', 27, 1], ['dd_big_g', 28, 2], ['dd_bonus_b', 29, 3], ['dd_bonus_o', 30, 4], ['dd_bonus_n', 31, 5], ['dd_bonus_u', 32, 6], ['dd_bonus_s', 33, 7], ['dd_pokeball', 17, 0]],
];

function createDisplayScene(f: Frame, id: number) {
  const m = f.m;
  destroyDisplayScene(f);
  m.display.scene = id;
  SCENES[id]!.forEach(([kind, info, own], i) => {
    const [x, y, callback] = DISP_INFO[info]!;
    m.display.sprites[i] = createDisplaySprite(m, kind, callback, x, y, own);
  });
}

function createDisplaySprite(m: SlotMachine, kind: SlotSpriteKind, callback: Callback, x: number, y: number, own: number) {
  const id = createSprite(m, kind, callback, x, y, 3, 16);
  const sprite = m.sprites[id]!;
  sprite.data[6] = own;
  sprite.data[7] = 1;
  if (kind === 'empty') sprite.invisible = true;
  return id;
}

/** DestroyDigitalDisplayScene: the scene's exit (its windows, mosaic or palette put back), its sprites gone. */
function destroyDisplayScene(f: Frame) {
  const m = f.m;
  switch (m.display.scene) {
    case DISPLAY_INSERT_BET:
      m.win0 = fullWindow();
      break;
    case DISPLAY_STOP_REEL:
      m.mosaic = 0;
      break;
    case DISPLAY_WIN:
    case DISPLAY_BONUS_REG:
    case DISPLAY_BONUS_BIG:
      m.displayPal = 3;
      break;
  }
  m.display.sprites = m.display.sprites.map((id) => {
    if (id !== NO_SPRITE) m.sprites[id] = null;
    return NO_SPRITE;
  });
}

const displayAnimFinished = (m: SlotMachine) => m.display.sprites.every((id) => id === NO_SPRITE || !m.sprites[id]?.data[7]);

// ---- Sprites (sprite.c's CreateSprite, AnimateSprites) ----

function makeSprite(kind: SlotSpriteKind, callback: Callback, x: number, y: number, priority: number, subpriority: number): SlotSprite {
  const affine = AFFINE_ANIMS[kind];
  return {
    kind,
    callback,
    x,
    y,
    x2: 0,
    y2: 0,
    priority,
    subpriority,
    coordOffset: false,
    invisible: false,
    hFlip: false,
    vFlip: false,
    mosaic: false,
    subspriteTableNum: 0,
    data: Array(8).fill(0),
    anim: newAnim(),
    affine: affine ? { cmd: 0, delay: 0, loop: 0, beginning: true, ended: false, xScale: 0x100, yScale: 0x100, rotation: 0 } : null,
  };
}

/** A sprite in the first free slot after the game's fixed ones (the reels' symbols, the numbers, the lines, the reels' background). */
function createSprite(m: SlotMachine, kind: SlotSpriteKind, callback: Callback, x: number, y: number, priority: number, subpriority: number, coordOffset = false) {
  let id = 29;
  while (m.sprites[id]) id++;
  const sprite = makeSprite(kind, callback, x, y, priority, subpriority);
  sprite.coordOffset = coordOffset;
  m.sprites[id] = sprite;
  return id;
}

function startSpriteAnim(sprite: SlotSprite, num: number) {
  sprite.anim.num = num;
  sprite.anim.beginning = true;
  sprite.anim.ended = false;
}

function startSpriteAnimIfDifferent(sprite: SlotSprite, num: number) {
  if (sprite.anim.num !== num) startSpriteAnim(sprite, num);
}

function animFrame(anim: AnimState, cmds: AnimCmd[]) {
  const cmd = cmds[anim.cmd] as readonly [number, number, boolean?];
  anim.delay = cmd[1] ? cmd[1] - 1 : 0;
  anim.image = cmd[0];
  anim.hFlip = !!cmd[2];
}

/** AnimateSprite: its animation (BeginAnim / ContinueAnim) and its affine animation. */
function animateSprite(sprite: SlotSprite) {
  const anim = sprite.anim;
  const cmds = (ANIMS[sprite.kind] ?? SINGLE_FRAME)[anim.num]!;
  if (anim.beginning) {
    anim.cmd = 0;
    anim.ended = false;
    anim.beginning = false;
    animFrame(anim, cmds);
  } else if (anim.delay) {
    if (!anim.paused) anim.delay--;
  } else if (!anim.paused) {
    anim.cmd++;
    const cmd = cmds[anim.cmd]!;
    if (cmd === 'end') {
      anim.cmd--;
      anim.ended = true;
    } else if ('jump' in cmd) {
      anim.cmd = cmd.jump;
      animFrame(anim, cmds);
    } else animFrame(anim, cmds);
  }
  if (sprite.affine) animateAffine(sprite.affine, AFFINE_ANIMS[sprite.kind]!);
}

function applyAffineFrame(affine: AffineState, cmd: readonly [number, number, number, number]) {
  // ApplyAffineAnimFrame: its steps added, or (lasting 0 frames) set; returns the frames it lasts after this one.
  if (cmd[3]) {
    addAffine(affine, cmd);
    return cmd[3] - 1;
  }
  affine.xScale = cmd[0];
  affine.yScale = cmd[1];
  affine.rotation = (cmd[2] << 8) & 0xffff;
  return 0;
}

function addAffine(affine: AffineState, cmd: readonly [number, number, number, number]) {
  affine.xScale += cmd[0];
  affine.yScale += cmd[1];
  affine.rotation = (affine.rotation + (cmd[2] << 8)) & 0xff00;
}

function animateAffine(affine: AffineState, cmds: AffineCmd[]) {
  if (affine.beginning) {
    affine.cmd = 0;
    affine.delay = 0;
    affine.loop = 0;
    affine.beginning = false;
    affine.ended = false;
    affine.delay = applyAffineFrame(affine, cmds[0] as readonly [number, number, number, number]);
    return;
  }
  continueAffine(affine, cmds);
}

function continueAffine(affine: AffineState, cmds: AffineCmd[]) {
  if (affine.delay) {
    affine.delay--;
    addAffine(affine, cmds[affine.cmd] as readonly [number, number, number, number]);
    return;
  }
  affine.cmd++;
  const cmd = cmds[affine.cmd]!;
  if (cmd === 'end') {
    affine.ended = true;
    affine.cmd--;
  } else if ('loop' in cmd) {
    if (affine.loop) affine.loop--;
    else affine.loop = cmd.loop;
    // JumpToTopOfAffineAnimLoop: back to the command after the loop's start.
    if (affine.loop) {
      affine.cmd--;
      while (affine.cmd > 0 && !(typeof cmds[affine.cmd - 1] === 'object' && 'loop' in (cmds[affine.cmd - 1] as object))) affine.cmd--;
      affine.cmd--;
    }
    continueAffine(affine, cmds);
  } else affine.delay = applyAffineFrame(affine, cmd);
}

// The trig table (gSineTable: sin × 256) and Sin/Cos (trig.c).
const SINE = Array.from({ length: 320 }, (_, i) => Math.round(Math.sin((i * Math.PI) / 128) * 256));
const sin = (angle: number, amplitude: number) => (SINE[angle & 0xff]! * amplitude) >> 8;
const cos = (angle: number, amplitude: number) => (SINE[(angle & 0xff) + 64]! * amplitude) >> 8;

/** The sprites' callbacks (SpriteCB_*). */
function spriteCallback(f: Frame, sprite: SlotSprite) {
  const m = f.m;
  const d = sprite.data;
  switch (sprite.callback) {
    case 'flashLine': {
      // SpriteCB_FlashMatchingLines: darker by 2/16 every 2 frames (4 while flashing in full), to 8/16 (4/16 after) and back.
      if (!d[1]) break;
      if (!d[3]!--) {
        d[7] = 0;
        d[3] = 1;
        d[4]! += d[5]!;
        const max = d[2] ? 8 : 4;
        if (d[4]! <= 0) {
          d[7] = 1;
          d[5] = -d[5]!;
          if (d[2]) d[2]--;
        } else if (d[4]! >= max) d[5] = -d[5]!;
        if (d[2]) d[3]! <<= 1;
      }
      break;
    }
    case 'ddStatic':
      d[7] = 0;
      break;
    case 'ddSmokeNE':
    case 'ddSmokeSW':
    case 'ddSmokeSE':
    case 'ddSmoke': {
      if (sprite.callback !== 'ddSmoke') {
        if (sprite.callback !== 'ddSmokeSW') sprite.hFlip = true;
        if (sprite.callback !== 'ddSmokeNE') sprite.vFlip = true;
      }
      const targetX = [4, -4, 4, -4];
      const targetY = [4, 4, -4, -4];
      if (d[1]!++ >= 16) {
        sprite.subspriteTableNum ^= 1;
        d[1] = 0;
      }
      sprite.x2 = sprite.subspriteTableNum ? targetX[d[6]!]! : 0;
      sprite.y2 = sprite.subspriteTableNum ? targetY[d[6]!]! : 0;
      break;
    }
    case 'ddReel':
      // REEL slides in from the left, TIME from the right, stay 90 frames and slide on out.
      if (d[0] === 0) {
        sprite.x += 4;
        if (sprite.x >= 240 - 32) {
          sprite.x = 240 - 32;
          d[0]++;
        }
      } else if (d[0] === 1) {
        if (++d[1]! > 90) d[0]++;
      } else if (d[0] === 2) {
        sprite.x += 4;
        if (sprite.x >= 240 + 32) d[0]++;
      } else d[7] = 0;
      break;
    case 'ddTime':
      if (d[0] === 0) {
        sprite.x -= 4;
        if (sprite.x <= 240 - 32) {
          sprite.x = 240 - 32;
          d[0]++;
        }
      } else if (d[0] === 1) {
        if (++d[1]! > 90) d[0]++;
      } else if (d[0] === 2) {
        sprite.x -= 4;
        if (sprite.x <= 144) d[0]++;
      } else d[7] = 0;
      break;
    case 'ddReelTimeNumber':
      if (d[0] === 0) {
        startSpriteAnim(sprite, Math.max(0, Math.min(4, m.reelTimeSpinsLeft - 1)));
        d[0]++;
      }
      if (d[0] === 1) {
        if (++d[1]! >= 4) {
          d[0]++;
          d[1] = 0;
        }
      } else if (d[0] === 2) {
        sprite.x += 4;
        if (sprite.x >= 240 - 32) {
          sprite.x = 240 - 32;
          d[0]++;
        }
      } else if (d[0] === 3) {
        if (++d[1]! > 90) d[0]++;
      } else if (d[0] === 4) {
        sprite.x += 4;
        if (sprite.x >= 240 + 8) d[0]++;
      } else d[7] = 0;
      break;
    case 'ddPokeballRocking':
      // The Poké Ball drops in, bounces to a stop, then rocks.
      if (d[0] === 0) {
        sprite.anim.paused = true;
        d[0]++;
      }
      if (d[0] === 1) {
        sprite.y += 8;
        if (sprite.y >= 0x70) {
          sprite.y = 0x70;
          d[1] = 16;
          d[0]++;
        }
      } else if (d[0] === 2) {
        if (d[2] === 0) {
          sprite.y -= d[1]!;
          d[1] = -d[1]!;
          if (++d[3]! >= 2) {
            d[1]! >>= 2;
            d[3] = 0;
            if (d[1] === 0) {
              d[0]++;
              d[7] = 0;
              sprite.anim.paused = false;
            }
          }
        }
        d[2] = (d[2]! + 1) & 7;
      }
      break;
    case 'ddStop':
      if (d[0] === 0) {
        if (++d[1]! > 8) d[0]++;
      } else if (d[0] === 1) {
        sprite.y += 2;
        if (sprite.y >= 0x30) {
          sprite.y = 0x30;
          d[0]++;
          d[7] = 0;
        }
      }
      break;
    case 'ddAButtonStop':
      // The A button comes in through a mosaic, from 6-pixel blocks to none.
      if (d[0] === 0) {
        sprite.invisible = true;
        if (++d[1]! > 0x20) {
          d[0]++;
          d[1] = 5;
          sprite.mosaic = true;
          sprite.invisible = false;
          startSpriteAnim(sprite, 1);
          m.mosaic = d[1]!;
        }
      } else if (d[0] === 1) {
        d[1]! -= d[2]! >> 8;
        if (d[1]! < 0) d[1] = 0;
        m.mosaic = d[1]!;
        d[2] = (d[2]! & 0xff) + 0x80;
        if (d[1] === 0) {
          d[0]++;
          d[7] = 0;
          sprite.mosaic = false;
          startSpriteAnim(sprite, 0);
        }
      }
      break;
    case 'ddPokeballShining':
      // The shine's streak crosses the ball (its palettes), then a pause.
      if (d[1]! < 3) {
        m.displayPal = d[1]!;
        if (++d[2]! >= 4) {
          d[1]!++;
          d[2] = 0;
        }
      } else {
        m.displayPal = 3;
        if (++d[2]! >= 25) {
          d[1] = 0;
          d[2] = 0;
        }
      }
      startSpriteAnimIfDifferent(sprite, 1);
      d[7] = 0;
      break;
    case 'ddRegBonus': {
      const xOffset = [0, -40, 0, 0, 48, 0, 24, 0];
      const yOffset = [-32, 0, -32, -48, 0, -48, 0, -48];
      const delay = [16, 12, 16, 0, 0, 4, 8, 8];
      if (d[0] === 0) {
        sprite.x2 = xOffset[d[6]!]!;
        sprite.y2 = yOffset[d[6]!]!;
        d[1] = delay[d[6]!]!;
        d[0]++;
      }
      if (d[0] === 1) {
        if (d[1]!-- === 0) d[0]++;
      } else if (d[0] === 2) {
        sprite.x2 -= Math.sign(sprite.x2) * 4;
        sprite.y2 -= Math.sign(sprite.y2) * 4;
        if (sprite.x2 === 0 && sprite.y2 === 0) d[0]++;
      }
      break;
    }
    case 'ddBigBonus': {
      const angles = [160, 192, 224, 104, 80, 64, 48, 24];
      if (d[0] === 0) {
        d[0]++;
        d[1] = 12;
      }
      sprite.x2 = cos(angles[d[6]!]!, d[1]!);
      sprite.y2 = sin(angles[d[6]!]!, d[1]!);
      if (d[1]) d[1]--;
      break;
    }
    case 'ddAButtonStart':
      // INSERT and the D-Pad uncovered from the sides in (window 0 hiding the sprites in it), then, once a coin is in,
      // the A button the same way.
      if (d[0] === 0) {
        m.win0 = { ...m.win0, top: 32, bottom: 136, objIn: false, objOut: true };
        sprite.invisible = true;
        d[0]++;
      }
      if (d[0] === 1) {
        d[1]! += 2;
        m.win0 = { ...m.win0, left: Math.min(208, d[1]! + 176), right: Math.max(208, 240 - d[1]!) };
        if (d[1]! > 51) {
          d[0]++;
          m.win0 = { ...m.win0, objIn: true };
        }
        break;
      }
      if (d[0] === 2) {
        if (m.bet === 0) break;
        const slot = m.display.sprites.indexOf(NO_SPRITE);
        if (slot >= 0) m.display.sprites[slot] = createDisplaySprite(m, 'dd_a_button', 'none', 208, 116, 0);
        m.win0 = { left: 192, right: 224, top: 104, bottom: 128, objIn: false, objOut: true };
        d[0]++;
        d[1] = 0;
      }
      if (d[0] === 3) {
        d[1]! += 2;
        m.win0 = { ...m.win0, left: Math.min(208, d[1]! + 192), right: Math.max(208, 240 - 16 - d[1]!) };
        if (d[1]! > 15) {
          d[0]++;
          m.win0 = { ...m.win0, objIn: true };
        }
      }
      break;
    case 'rtPikachu':
      // Cheering, it hops.
      sprite.x2 = sprite.y2 = 0;
      if (sprite.anim.num === 4) {
        sprite.x2 = sprite.y2 = 8;
        const a = sprite.anim;
        if ((a.cmd !== 0 && a.delay !== 0) || (a.cmd === 0 && a.delay === 0)) sprite.y2 = -8;
      }
      break;
    case 'rtNumbers': {
      const r0 = ((m.reeltimePixelOffset + d[7]!) & 0xffff) % 40;
      sprite.y = r0 + 59;
      startSpriteAnimIfDifferent(sprite, reelTimeSymbol(m, Math.trunc(r0 / 20)));
      break;
    }
    case 'rtBolt':
      if (d[0] !== 0) {
        d[0]!--;
        sprite.x2 = 0;
        sprite.y2 = 0;
        sprite.invisible = true;
      } else {
        sprite.invisible = false;
        sprite.x2 += d[1]!;
        sprite.y2 += d[2]!;
        if (++d[3]! >= 8) {
          d[0] = d[7]!;
          d[3] = 0;
        }
      }
      break;
    case 'rtAura':
      if (d[0] && --d[6]! <= 0) {
        m.auraLight = [16, 0][d[5]!]!;
        d[5] = (d[5]! + 1) & 1;
        d[6] = d[7]!;
      }
      break;
    case 'rtExplosion':
      sprite.y2 = m.spriteOffsetY;
      break;
    case 'rtDuck':
      // The ducks circle Pikachu's head, behind it on the far side.
      d[0] = (d[0]! - 2) & 0xff;
      sprite.x2 = cos(d[0]!, 20);
      sprite.y2 = sin(d[0]!, 6);
      sprite.subpriority = d[0]! >= 0x80 ? 2 : 0;
      if (++d[1]! >= 16) {
        sprite.hFlip = !sprite.hFlip;
        d[1] = 0;
      }
      break;
    case 'rtSmoke':
      // The smoke grows, blinks out and rises.
      if (d[0] === 0) {
        if (sprite.affine?.ended) d[0]++;
      } else if (d[0] === 1) {
        sprite.invisible = !sprite.invisible;
        if (++d[2]! >= 24) {
          d[0]++;
          d[2] = 0;
        }
      } else {
        sprite.invisible = true;
        if (++d[2]! >= 16) d[7] = 1;
      }
      d[1] = (d[1]! & 0xff) + 16;
      sprite.y2 -= d[1]! >> 8;
      break;
    case 'powerBolt':
      if (sprite.affine?.ended) d[7] = 1;
      break;
  }
}
