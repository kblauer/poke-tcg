import { afterFlip, boardTotals, displayLevel, MAX_COINS, maxPayout, VOLTORB, voltorbFlipMusic, type VoltorbBoard, type VoltorbCard } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';
import { useMusicCue } from '../MusicPlayer';
import { loadVolume } from './minigameSound';
import { MinigameVolume } from './MinigameVolume';
import { VOLTORB_FLIP_TEXT } from './voltorbFlipText';
import { EFFECTS, FANFARES, VoltorbFlipSound, type VoltorbFlipSoundName } from './voltorbFlipSound';

/** The API's next board (extras.voltorbRound): none while the Coin Case is full. */
export type VoltorbRound = { full: true; coins: number } | { full: false; coins: number; board: VoltorbBoard; levelsGained: number };

const W = 256;
const SCREEN_H = 192;
const HINGE = 8;
const BOTTOM = SCREEN_H + HINGE;
const H = SCREEN_H * 2 + HINGE;
const SCALE = 3;
// The game runs at 30 frames a second (the main loop waits two VBlanks), its sprites animating once a frame.
const FRAME_MS = 1000 / 30;
const FONT = '12px "Pokemon Emerald"';
const DARK = 'rgb(82,82,90)';
const SHADOW = 'rgb(206,206,198)';
const WHITE = 'rgb(255,255,255)';
// The palette fades (BeginNormalPaletteFade): entering and leaving, and the top screen's between the info screens.
const FADE_FRAMES = 12;
const TOP_FADE_FRAMES = 8;
const T = VOLTORB_FLIP_TEXT;

// The workflows (VoltorbFlipTaskId), in the game's order.
const COIN_CASE_FULL = 0;
const NEW_ROUND = 1;
const SELECT_MAIN_MENU = 2;
const SELECT_GAME_INFO = 3;
const HOW_TO_PLAY = 4;
const HINT = 5;
const ABOUT_MEMO = 6;
const RENDER_BOARD = 7;
const AWAIT_BOARD_INTERACT = 8;
const FLIP_CARD = 9;
const WIN_ROUND = 10;
const AWARD_COINS = 11;
const REVEAL_BOARD = 12;
const MEMO_TOUCH = 13;
const MEMO_BUTTONS = 14;
const QUIT_ROUND = 15;
const TERMINATE = -1;

// The input codes (VoltorbFlipInput): the 25 cards, then Open Memo and Quit, and the wrap-arounds.
const INPUT_MEMO = 25;
const INPUT_QUIT = 26;
const COL4_ROWLAST = 27;
const COL0_ROWLAST = 28;

// The sprites (VoltorbFlipSpriteID): the card cursor, the flipping card, Open Memo, Quit, the memo window, its four
// toggles, its back button, the memo cursor, and the top screen's two (about memos).
const S_CURSOR = 0;
const S_FLIP = 1;
const S_MEMO_BUTTON = 2;
const S_QUIT = 3;
const S_MEMO = 4;
const S_TOGGLE = [5, 6, 7, 8];
const S_MEMO_BACK = 9;
const S_MEMO_CURSOR = 10;
const S_SUB = [11, 12];
// Each sprite's place, animation and draw priority (VoltorbFlip_CreateSprites; lower priorities in front).
const SPRITES: [x: number, y: number, anim: number, priority: number][] = [
  [0, 0, 18, 1],
  [0, 0, 0, 0],
  [0xe0, 0x28, 5, 2],
  [0xe0, 0xb0, 2, 2],
  [0x80, 0x60, 20, 5],
  [0xc8, 0x50, 12, 4],
  [0xe0, 0x50, 15, 4],
  [0xc8, 0x68, 14, 4],
  [0xe0, 0x68, 13, 4],
  [0xe0, 0x80, 16, 3],
  [0xc8, 0x50, 18, 1],
  [0x48, 0x38, 0, 0],
  [0x88, 0x28, 0, 0],
];
// The cells drawn again in palette 4 (the cursor's while the memo is open): cell → its copy.
const PALETTE_4: Record<number, number> = { 11: 40, 14: 41, 8: 42 };

// The memo marks (MEMO_VOLTORB … MEMO_THREE) and, for each toggle, its off and on animations (sMemoInputGridDrawParam)
// and the mark's tile on the card (sMemoRenderOverrides).
const MEMO_FLAGS = [1, 2, 4, 8];
const MEMO_ANIMS = [[12, 8], [15, 11], [14, 10], [13, 9]];
const MEMO_MARKS: [dx: number, dy: number, tile: number][] = [[0, 0, 0x21], [2, 0, 0x22], [0, 2, 0x23], [2, 2, 0x24]];
// Each card type's tiles (sCardFaceUpTileIDs): at 45° and face up; the card's back is 23, at 45° 119, edge on 26.
const FACE_TILES = [[0x77, 0x17], [0x74, 0x14], [0x71, 0x11], [0x6e, 0x0e], [0x6b, 0x0b]];
const BACK = 23;

// The touch screen's buttons (sTouchscreenHitboxes): each card, Open Memo and Quit, as [top, bottom, left, right];
// and the memo window's (sMemoTouchscreenHitboxes): its four toggles, its back button, Open Memo and Quit.
const CARD_HITS = Array.from({ length: 25 }, (_, i) => [8 + 32 * Math.floor(i / 5), 32 + 32 * Math.floor(i / 5), 8 + 32 * (i % 5), 32 + 32 * (i % 5)]);
const BOARD_HITS = [...CARD_HITS, [8, 72, 192, 256], [160, 192, 192, 256]];
const MEMO_HITS = [[80, 104, 200, 224], [80, 104, 224, 248], [104, 128, 200, 224], [104, 128, 224, 248], [128, 152, 224, 248], [8, 72, 192, 256], [160, 192, 192, 256]];
// The D-pad's moves from each place (sDpadButtonSpecs): up, down, left, right.
const DPAD: [number, number, number, number][] = [
  ...Array.from({ length: 25 }, (_, i): [number, number, number, number] => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    return [(i + 20) % 25, (i + 5) % 25, col === 0 ? (row < 3 ? INPUT_MEMO : INPUT_QUIT) : i - 1, col === 4 ? (row < 3 ? INPUT_MEMO : INPUT_QUIT) : i + 1];
  }),
  [INPUT_MEMO, INPUT_QUIT, COL4_ROWLAST, COL0_ROWLAST],
  [INPUT_MEMO, INPUT_QUIT, COL4_ROWLAST, COL0_ROWLAST],
];
// The board cursor's place for each input (the D-pad boxes' corners), and the memo cursor's for each button (sMemoCursorPos).
const FOCUS_AT = (i: number): [number, number] => (i < 25 ? [8 + 32 * (i % 5), 8 + 32 * Math.floor(i / 5)] : i === INPUT_MEMO ? [224, 40] : [224, 176]);
const MEMO_CURSOR_AT: [number, number][] = [[200, 80], [224, 80], [200, 104], [224, 104], [224, 128]];

type Key = 'A' | 'B' | 'X' | 'up' | 'down' | 'left' | 'right';
type Outcome = 'quit' | 'won' | 'lost';

interface Sprite {
  anim: number;
  t: number;
  draw: boolean;
  x: number;
  y: number;
  pal4: boolean;
}
interface SpriteMeta {
  cells: ({ ox: number; oy: number; w: number; h: number; x: number } | null)[];
  anims: { frames: [cell: number, frames: number][]; loop: boolean }[];
}
type Sheets = { backdrop: { top: string; bottom: string }; main: SpriteMeta; sub: SpriteMeta };

/** A text printer (the main window's): its text, how far it's printed, the 2 lines showing, and whether it waits for a press. */
interface Printer {
  text: string;
  pos: number;
  lines: [string, string];
  line: 0 | 1;
  wait: 'scroll' | 'clear' | null;
  done: boolean;
}
/** A card flip animation (VFCardFlipAnim): a card, every card turned up or every card turned back, column by column. */
interface FlipAnim {
  mode: 'single' | 'reveal' | 'clear';
  card: number;
  step: number;
  frame: number;
  row: number;
}
interface Brightness {
  from: number;
  to: number;
  t: number;
  n: number;
}

interface Scene {
  stage: 'loading' | 'fadeIn' | 'play' | 'fadeOut' | 'failed';
  frame: number;
  // The task engine (VoltorbFlipTaskEngine).
  wf: number;
  wfState: number;
  taskState: number;
  next: number | null;
  // The round (VoltorbFlipGameState): the board, the cards flipped (in order) and their memos, the coins.
  board: VoltorbBoard | null;
  flipped: boolean[];
  memo: number[];
  flips: number[];
  payout: number;
  level: number;
  levelsGained: number;
  coins: number;
  // The app (VoltorbFlipAppData).
  hasPlayed: boolean;
  printedMore: boolean;
  memoOpen: boolean;
  dimmed: boolean;
  memoDimmed: boolean;
  payoutShown: number;
  coinsShown: number;
  levelShown: number;
  vars: string[];
  // The input handler (VoltorbFlipInputHandler).
  focus: number;
  selectedRow: number;
  memoButton: number;
  lastMemoButton: number;
  ihMemoOpen: boolean;
  memoFocused: boolean;
  touchNew: boolean;
  // What's drawn: each card's tiles, the numbers beside the board (none: zeros), the memo marks, the sprites, the top
  // screen, the windows and menus, and the screens' brightness and fades.
  cardTile: number[];
  totals: ReturnType<typeof boardTotals> | null;
  marks: number[];
  sprites: Sprite[];
  top: 'coins' | 'howto' | 'hint' | 'memo';
  printer: Printer | null;
  small: string | null;
  menu: { items: string[]; cursor: number; keys: boolean } | null;
  yesNo: { cursor: number } | null;
  dim: Brightness;
  memoDim: Brightness;
  topFade: Brightness;
  fade: number;
  flipAnim: FlipAnim | null;
  // Input this frame (gSystem.newKeys, System_GetTouchNew).
  touch: { x: number; y: number } | null;
  keys: Set<Key>;
  // The API: the next board once it comes, the settling of a round, or what stopped the game.
  round: VoltorbRound | null;
  failure: string | null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

/** An animation's cell `t` frames in (a looping one round again, another holding its last), and whether it's still going (Sprite_IsAnimated). */
function animCell(anim: SpriteMeta['anims'][number], t: number) {
  const total = anim.frames.reduce((n, [, f]) => n + f, 0);
  let left = anim.loop && total ? t % total : t;
  for (const [cell, frames] of anim.frames) {
    if (left < frames) return { cell, going: true };
    left -= frames;
  }
  return { cell: anim.frames.at(-1)![0], going: anim.loop };
}

const brightness = (b: Brightness) => b.from + (b.to - b.from) * Math.min(1, b.t / Math.max(1, b.n));
const fill = (text: string, vars: string[]) => text.replace(/\{(\d)\}/g, (_, i: string) => vars[Number(i)] ?? '');
const hit = (rects: number[][], x: number, y: number) => rects.findIndex(([top, bottom, left, right]) => y >= top! && y < bottom! && x >= left! && x < right!);

const PICTURES = ['board', 'tiles', 'digits', 'top_coins', 'top_hint', 'top_howto', 'top_memo', 'sprites', 'sprites_sub'] as const;
type Images = Record<(typeof PICTURES)[number], HTMLImageElement>;

/**
 * Voltorb Flip's screen (VoltorbFlip's), as HeartGold and SoulSilver play it at the Goldenrod Game Corner, ported frame by
 * frame from the pokeheartgold decompilation's src/voltorb_flip/: the DS's two screens, the task engine and its
 * workflows (the menu, Game Info's three screens, the board, flipping, the memo, quitting, winning, the payout and the
 * reveal), its sprites, animations and sounds. The API makes each board (`onRound`) and settles each round (`onSettle`);
 * Quit at the menu leaves the game (`onExit`). Auto play plays HeartGold and SoulSilver's Game Corner music.
 */
export function VoltorbFlipScreen({ playerName, onRound, onSettle, onExit }: { playerName: string; onRound: (restart: boolean) => Promise<VoltorbRound>; onSettle: (flips: number[], outcome: Outcome) => Promise<{ coins: number }>; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const sheets = useRef<Sheets | null>(null);
  const sound = useRef<VoltorbFlipSound | null>(null);
  const [stage, setStage] = useState<Scene['stage']>('loading');
  // Why the game stopped (the API turned a round down, or the game couldn't load): shown under the screen.
  const [failure, setFailureState] = useState<string | null>(null);
  const failed = useRef(false);
  const setFailure = (message: string) => {
    failed.current = true;
    setFailureState(message);
  };
  const [volume, setVolume] = useState(loadVolume);
  useMusicCue(stage === 'play' || stage === 'fadeIn' ? voltorbFlipMusic() : null);
  const calls = useRef({ onRound, onSettle, onExit, playerName });
  calls.current = { onRound, onSettle, onExit, playerName };

  useEffect(() => {
    const s = new VoltorbFlipSound(loadVolume());
    sound.current = s;
    return () => {
      s.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => sound.current?.setVolume(volume), [volume]);

  const play = (name: VoltorbFlipSoundName) => sound.current?.play(name);
  const sePlaying = (...names: VoltorbFlipSoundName[]) => sound.current?.isPlaying(...(names.length ? names : EFFECTS)) ?? false;
  const fanfarePlaying = () => sound.current?.isPlaying(...FANFARES) ?? false;

  // The keyboard: the arrows the D-pad, Space, Enter or Z the A button, Backspace or X the B button, M or C the X button.
  useEffect(() => {
    const keyOf: Record<string, Key> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'A', Enter: 'A', z: 'A', Z: 'A', Backspace: 'B', x: 'B', X: 'B', m: 'X', M: 'X', c: 'X', C: 'X' };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const key = keyOf[e.key];
      if (!key) return;
      e.preventDefault();
      sound.current?.resume();
      if (failed.current) return calls.current.onExit();
      scene.current?.keys.add(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    Promise.all([
      Promise.all(PICTURES.map((n) => loadImage(`/extras/voltorb-flip/${n}.png`))),
      fetch('/extras/voltorb-flip/sprites.json').then((r) => r.json() as Promise<Sheets>),
      calls.current.onRound(true),
      document.fonts?.load(FONT).catch(() => undefined),
    ])
      .then(([loaded, meta, round]) => {
        if (stopped) return;
        sheets.current = meta;
        const images = Object.fromEntries(PICTURES.map((n, i) => [n, loaded[i]!])) as Images;
        scene.current = newScene(round);
        setStage('fadeIn');
        let last = performance.now();
        let spare = 0;
        const loop = (t: number) => {
          if (stopped) return;
          spare = Math.min(spare + t - last, 250);
          last = t;
          while (spare >= FRAME_MS) {
            step(scene.current!);
            spare -= FRAME_MS;
          }
          draw(canvas.current?.getContext('2d') ?? null, scene.current!, images);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e: Error) => {
        if (stopped) return;
        setFailure(e.message);
        setStage('failed');
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  function newScene(round: VoltorbRound): Scene {
    return {
      stage: 'fadeIn',
      frame: 0,
      wf: COIN_CASE_FULL,
      wfState: 0,
      taskState: 0,
      next: null,
      board: null,
      flipped: Array(25).fill(false),
      memo: Array(25).fill(0),
      flips: [],
      payout: 0,
      level: 7,
      levelsGained: 0,
      coins: round.coins,
      hasPlayed: false,
      printedMore: false,
      memoOpen: false,
      dimmed: false,
      memoDimmed: false,
      payoutShown: 0,
      coinsShown: round.coins,
      levelShown: 1,
      vars: [],
      focus: 0,
      selectedRow: 0,
      memoButton: 0,
      lastMemoButton: 0,
      ihMemoOpen: false,
      memoFocused: false,
      touchNew: false,
      cardTile: Array(25).fill(BACK),
      totals: null,
      marks: Array(25).fill(0),
      sprites: SPRITES.map(([x, y, anim]) => ({ anim, t: 0, draw: false, x, y, pal4: false })),
      top: 'coins',
      printer: null,
      small: null,
      menu: null,
      yesNo: null,
      dim: { from: 0, to: 0, t: 0, n: 1 },
      memoDim: { from: 0, to: 0, t: 0, n: 1 },
      topFade: { from: 0, to: 0, t: 0, n: 1 },
      fade: 1,
      flipAnim: null,
      touch: null,
      keys: new Set(),
      round,
      failure: null,
    };
  }

  /** One of the game's frames: the task engine, the text printer, the sprites' animations and the fades. */
  function step(s: Scene) {
    s.frame++;
    if (s.stage === 'fadeIn') {
      // VoltorbFlip_Init: the sprites set up (Open Memo and Quit shown, the memo cursor in palette 4, the top screen's second sprite half way through), then both screens fade in.
      if (s.frame === 1) {
        s.sprites[S_MEMO_BUTTON]!.draw = true;
        s.sprites[S_QUIT]!.draw = true;
        s.sprites[S_MEMO_CURSOR]!.pal4 = true;
        s.sprites[S_SUB[1]!]!.t = 32;
        setFocus(s, 0);
      }
      s.fade = Math.max(0, 1 - s.frame / FADE_FRAMES);
      if (s.frame >= FADE_FRAMES) {
        s.stage = 'play';
        setStage('play');
      }
    } else if (s.stage === 'play') {
      if (run(s)) {
        s.stage = 'fadeOut';
        s.frame = 0;
        setStage('fadeOut');
      }
      printerTick(s);
    } else if (s.stage === 'fadeOut') {
      s.fade = Math.min(1, s.frame / FADE_FRAMES);
      if (s.frame === FADE_FRAMES) calls.current.onExit();
    }
    for (const sp of s.sprites) sp.t++;
    for (const b of [s.dim, s.memoDim, s.topFade]) b.t++;
    s.touch = null;
    s.keys.clear();
  }

  // The task engine (VoltorbFlipTaskEngine_Run): a workflow's setup (over frames), begin (one frame), main (over
  // frames), end (one frame) and tidy (over frames), then the next workflow.
  function run(s: Scene): boolean {
    const w = WORKFLOWS[s.wf]!;
    if (s.wfState === 0) {
      if (w.setup) {
        if (w.setup(s)) {
          s.taskState = 0;
          s.wfState = 1;
        }
        return false;
      }
      s.wfState = 1;
    }
    if (s.wfState === 1) {
      w.begin?.(s);
      s.wfState = 2;
    }
    if (s.wfState === 2) {
      if (w.main(s)) {
        s.taskState = 0;
        w.end?.(s);
        s.wfState = 3;
      }
      return false;
    }
    if (s.wfState === 3) {
      if (w.tidy) {
        if (w.tidy(s)) {
          s.taskState = 0;
          s.wfState = 4;
        }
        return false;
      }
    }
    s.wf = s.next!;
    s.next = null;
    if (s.wf === TERMINATE) return true;
    s.wfState = 0;
    s.taskState = 0;
    return false;
  }
  const enqueue = (s: Scene, wf: number) => (s.next = wf);
  const pressed = (s: Scene) => s.touch !== null || s.keys.size > 0;

  // --- The text windows and menus ---

  /** VoltorbFlip_PrintTextWindow: a message in the main window, printed a letter a frame. */
  function printText(s: Scene, msg: number) {
    s.small = null;
    let text = fill(T[msg]!, s.vars);
    // The Coin Case holds 9,999 coins here (the account's, the Game Corner's), not HeartGold's 50,000.
    if (msg === 14) text = text.replace('50,000', MAX_COINS.toLocaleString('en-US'));
    s.printer = { text, pos: 0, lines: ['', ''], line: 0, wait: null, done: false };
  }
  /** The printer's frame: a letter (or, on a press, the rest of the box), or a press awaited to scroll a line (\f) or clear the box (\r). */
  function printerTick(s: Scene) {
    const p = s.printer;
    if (!p || p.done) return;
    if (p.wait) {
      if (!pressed(s)) return;
      if (p.wait === 'scroll') p.lines = [p.lines[1], ''];
      else p.lines = ['', ''];
      p.line = p.wait === 'scroll' ? 1 : 0;
      p.wait = null;
      if (p.pos >= p.text.length) p.done = true;
      return;
    }
    const n = pressed(s) ? Infinity : 1;
    for (let k = 0; k < n && p.pos < p.text.length; k++) {
      const c = p.text[p.pos++]!;
      if (c === '\n') p.line = 1;
      else if (c === '\f' || c === '\r') {
        p.wait = c === '\f' ? 'scroll' : 'clear';
        return;
      } else p.lines[p.line] += c;
    }
    if (p.pos >= p.text.length) p.done = true;
  }
  const printerFinished = (s: Scene) => !s.printer || s.printer.done;
  /** BgClearTilemapBufferAndCommit(3): the windows, menus and prompts gone. */
  function clearBg3(s: Scene) {
    s.printer = null;
    s.small = null;
    s.menu = null;
    s.yesNo = null;
  }
  /** VoltorbFlip_PrintMessageToSmallWindow: a line in the small window, all at once. */
  const printSmall = (s: Scene, msg: number) => {
    s.printer = null;
    s.small = fill(T[msg]!, s.vars);
  };
  const dim = (s: Scene) => {
    if (!s.dimmed) s.dim = { from: brightness(s.dim), to: 8, t: 0, n: 4 };
    s.dimmed = true;
  };
  const undim = (s: Scene) => {
    s.dim = { from: brightness(s.dim), to: 0, t: 0, n: 4 };
    s.dimmed = false;
  };

  /** The touch screen list menus (VoltorbFlip_CreateListMenu): the main menu's or Game Info's items. */
  const openMenu = (s: Scene, which: 0 | 1) => (s.menu = { items: (which === 0 ? [17, 18, 19] : [21, 22, 23, 24]).map((m) => T[m]!), cursor: 0, keys: false });
  /** The list menu's input: an item's index, −2 for B, −1 for none. */
  function menuInput(s: Scene): number {
    const m = s.menu;
    if (!m) return -1;
    if (s.touch) {
      const top = (17 - m.items.length * 3) * 8;
      const i = Math.floor((s.touch.y - top) / 24);
      if (s.touch.x >= 136 && s.touch.x < 240 && i >= 0 && i < m.items.length) {
        play('se_dp_decide');
        s.menu = null;
        return i;
      }
      return -1;
    }
    if (s.keys.has('up') || s.keys.has('down')) {
      m.cursor = (m.cursor + (s.keys.has('up') ? m.items.length - 1 : 1)) % m.items.length;
      m.keys = true;
      play('se_dp_select');
    } else if (s.keys.has('A')) {
      play('se_dp_decide');
      s.menu = null;
      return m.cursor;
    } else if (s.keys.has('B')) {
      play('se_dp_decide');
      s.menu = null;
      return -2;
    }
    return -1;
  }
  /** The YES/NO prompt's input (YesNoPrompt_HandleInput). */
  function yesNoInput(s: Scene): 'yes' | 'no' | null {
    const p = s.yesNo;
    if (!p) return null;
    if (s.touch && s.touch.x >= 200 && s.touch.x < 248 && s.touch.y >= 80 && s.touch.y < 136) {
      play('se_dp_decide');
      return s.touch.y < 108 ? 'yes' : 'no';
    }
    if (s.keys.has('up') || s.keys.has('down')) {
      p.cursor = 1 - p.cursor;
      play('se_dp_select');
    } else if (s.keys.has('A')) {
      play('se_dp_decide');
      return p.cursor === 0 ? 'yes' : 'no';
    } else if (s.keys.has('B')) {
      play('se_dp_decide');
      return 'no';
    }
    return null;
  }

  // --- The sprites ---

  const setAnim = (s: Scene, i: number, anim: number) => Object.assign(s.sprites[i]!, { anim, t: 0 });
  const setAnimNoRestart = (s: Scene, i: number, anim: number) => s.sprites[i]!.anim !== anim && setAnim(s, i, anim);
  const animating = (s: Scene, i: number) => animCell(sheets.current!.main.anims[s.sprites[i]!.anim]!, s.sprites[i]!.t).going;
  /** ov122_021E7F70: Quit's, Open Memo's and the memo back button's animations over. */
  const buttonsIdle = (s: Scene) => !animating(s, S_QUIT) && !animating(s, S_MEMO_BUTTON) && !animating(s, S_MEMO_BACK);

  // --- The input handler (voltorb_flip_input.c) ---

  /** VoltorbFlipInputHandler_UpdateBoardCursorAnim: a card's frame, the pencil (greyed while the memo's buttons have the keys), or a button's frame. */
  function updateCursorAnim(s: Scene, focus: number) {
    const anim = focus < 25 ? (s.memoFocused ? 24 : s.ihMemoOpen ? 23 : 18) : focus === INPUT_MEMO ? 7 : 4;
    s.sprites[S_CURSOR]!.pal4 = s.ihMemoOpen;
    setAnimNoRestart(s, S_CURSOR, anim);
  }
  function setFocus(s: Scene, focus: number) {
    updateCursorAnim(s, focus);
    [s.sprites[S_CURSOR]!.x, s.sprites[S_CURSOR]!.y] = FOCUS_AT(focus);
    s.focus = focus;
  }
  const setGridCursor0 = (s: Scene) => setFocus(s, 0);
  const setMemoCursor = (s: Scene) => ([s.sprites[S_MEMO_CURSOR]!.x, s.sprites[S_MEMO_CURSOR]!.y] = MEMO_CURSOR_AT[s.memoButton]!);
  function setMemoCursor0(s: Scene) {
    s.memoButton = 0;
    s.lastMemoButton = 0;
    setMemoCursor(s);
  }
  function setBoardFocused(s: Scene, on: boolean) {
    s.sprites[S_CURSOR]!.draw = on;
    if (!on) s.focus = 0;
  }
  function setIhMemoOpen(s: Scene, open: boolean) {
    s.ihMemoOpen = open;
    updateCursorAnim(s, s.focus);
  }
  function setMemoFocused(s: Scene, focused: boolean) {
    s.memoFocused = focused;
    updateCursorAnim(s, s.focus);
    s.sprites[S_MEMO_CURSOR]!.draw = focused;
  }
  const inGrid = (s: Scene) => s.focus !== INPUT_MEMO && s.focus !== INPUT_QUIT;

  /** VoltorbFlipInputHandler_HandleInput: 0 nothing, 1 a card (or a memo button), 2 Quit, 3 B, 4 the memo, 5-8 a memo toggle. */
  function handleInput(s: Scene): number {
    return s.memoFocused ? inputMemo(s) : inputNoMemo(s);
  }
  function inputNoMemo(s: Scene): number {
    if (s.touch) {
      const i = hit(BOARD_HITS, s.touch.x, s.touch.y);
      if (i >= 0) {
        s.touchNew = true;
        if (i === INPUT_MEMO) return 4;
        if (i === INPUT_QUIT) return 2;
        // VoltorbFlipInputCB_OnTouch: the cursor to the card touched.
        if (i !== s.focus) {
          setFocus(s, i);
          play('se_dp_select');
        }
        return 1;
      }
    }
    s.touchNew = false;
    if (s.keys.has('A')) {
      if (s.focus === INPUT_MEMO) {
        setGridCursor0(s);
        return 4;
      }
      return s.focus === INPUT_QUIT ? 2 : 1;
    }
    if (s.keys.has('X')) {
      if (!inGrid(s)) setGridCursor0(s);
      return 4;
    }
    if (s.keys.has('B')) return 3;
    const dir = (['up', 'down', 'left', 'right'] as const).findIndex((k) => s.keys.has(k));
    if (dir >= 0) {
      // VoltorbFlipInputCB_OnKeyMove: wrapping from the buttons back to the last row used.
      let next = DPAD[s.focus]![dir]!;
      if (next === COL4_ROWLAST) next = s.selectedRow * 5 + 4;
      else if (next === COL0_ROWLAST) next = s.selectedRow * 5;
      if (next < 25) s.selectedRow = Math.floor(next / 5);
      if (next !== s.focus) {
        setFocus(s, next);
        play('se_dp_select');
      }
      return 0;
    }
    if (s.ihMemoOpen && inGrid(s) && s.touch) {
      const i = hit(MEMO_HITS, s.touch.x, s.touch.y);
      if (i >= 0 && i < 4) return 5 + i;
    }
    return 0;
  }
  function inputMemo(s: Scene): number {
    s.touchNew = false;
    if (s.keys.has('X')) return 4;
    if (s.keys.has('B')) {
      s.memoButton = 4;
      setMemoCursor(s);
      return 3;
    }
    if (s.keys.has('A')) {
      if (s.memoButton === 4) return 3;
      return 1;
    }
    // VoltorbFlipInputHandler_HandleDpad: the memo window's buttons.
    const last = s.memoButton;
    if (s.keys.has('down')) s.memoButton = Math.min(4, last + 2);
    else if (s.keys.has('left')) s.memoButton = Math.max(0, last - 1);
    else if (s.keys.has('up')) s.memoButton = last === 4 && (s.lastMemoButton === 2 || s.lastMemoButton === 3) ? s.lastMemoButton : Math.max(0, last - 2);
    else if (s.keys.has('right')) s.memoButton = Math.min(4, last + 1);
    if (last !== s.memoButton) {
      s.lastMemoButton = last;
      setMemoCursor(s);
      play('se_dp_select');
    }
    s.touchNew = true;
    if (s.touch) {
      const i = hit(MEMO_HITS, s.touch.x, s.touch.y);
      if (i === 4) {
        s.memoButton = 4;
        setMemoCursor(s);
        return 3;
      }
      if (i === 5) return 4;
      if (i === 6) return 2;
      if (i >= 0) {
        s.memoButton = i;
        setMemoCursor(s);
        return 1;
      }
    }
    return 0;
  }

  // --- The board's drawing (BG0's cards, BG2's numbers and marks) and its flips ---

  const cardType = (s: Scene, id: number): VoltorbCard => s.board?.cards[id] ?? 1;
  /** DrawCardFaceUp's tiles for each step: the back at 45°, edge on, the face at 45°, the face. */
  const faceUpTile = (type: VoltorbCard, step: number) => [119, 26, FACE_TILES[type]![0]!, FACE_TILES[type]![1]!][step]!;
  /** DrawCardFaceDown's: the face at 45°, edge on, the back at 45°, the back. */
  const faceDownTile = (type: VoltorbCard, step: number) => [FACE_TILES[type]![0]!, 26, 119, BACK][step]!;
  function setFlipAnim(s: Scene, card: number, mode: FlipAnim['mode']) {
    s.flipAnim = { mode, card, step: 0, frame: 0, row: mode === 'clear' ? 0 : 5 };
    if (mode === 'single') s.marks[card] = 0;
    else if (mode === 'reveal') s.marks = Array(25).fill(0);
  }
  /** VFCardFlipAnim_Play: a step two frames in three, 4 steps a card (and a column at a time when clearing); true when over. */
  function playFlipAnim(s: Scene): boolean {
    const a = s.flipAnim!;
    if (a.frame % 3 !== 0) {
      let sounded = true;
      if (a.mode === 'single') s.cardTile[a.card] = faceUpTile(cardType(s, a.card), a.step);
      else if (a.mode === 'reveal') {
        sounded = false;
        for (let i = 0; i < 25; i++) {
          if (s.flipped[i]) continue;
          sounded = true;
          s.cardTile[i] = faceUpTile(cardType(s, i), a.step);
        }
      } else for (let i = 0; i < 5; i++) s.cardTile[a.row + 5 * i] = faceDownTile(cardType(s, a.row + 5 * i), a.step);
      if (a.step === 0 && sounded) play('se_gs_paneru_mekuru');
      if (++a.step >= 4) {
        a.step = 0;
        if (++a.row >= 5) return true;
      }
    }
    a.frame++;
    return false;
  }
  /** VoltorbFlip_PrintBoardVoltorbsAndPoints: the numbers beside the board (zeros between rounds), the marks cleared. */
  function printTotals(s: Scene) {
    s.totals = s.board ? boardTotals(s.board.cards) : null;
    s.marks = Array(25).fill(0);
  }

  // --- The memo window ---

  function animateOpenMemo(s: Scene) {
    setMemoCursor0(s);
    setIhMemoOpen(s, true);
    s.sprites[S_MEMO]!.draw = true;
    setAnim(s, S_MEMO, 20);
    s.memoOpen = true;
    play('se_dp_card2');
  }
  function animateCloseMemo(s: Scene) {
    setIhMemoOpen(s, false);
    setMemoCursor0(s);
    setMemoSpritesDraw(s, false);
    setAnim(s, S_MEMO, 21);
    play('se_dp_card2');
  }
  function setMemoSpritesDraw(s: Scene, on: boolean) {
    for (const i of S_TOGGLE) s.sprites[i]!.draw = on;
    s.sprites[S_MEMO_BACK]!.draw = on && s.wf === MEMO_BUTTONS;
  }
  /** VoltorbFlip_UpdateMemoInputPanelStates: the toggles lit for the marks on the card under the cursor. */
  function updateMemoPanel(s: Scene) {
    if (inGrid(s)) {
      MEMO_FLAGS.forEach((flag, i) => setAnimNoRestart(s, S_TOGGLE[i]!, MEMO_ANIMS[i]![(s.memo[s.focus]! & flag) === flag ? 1 : 0]!));
      setMemoSpritesDraw(s, true);
    } else setMemoSpritesDraw(s, false);
  }
  /** VoltorbFlip_TryToggleCardMemo: a mark on or off the card (not a flipped one); true for the back button. */
  function toggleMemo(s: Scene, card: number, button: number): boolean {
    if (s.flipped[card]) {
      play('se_dp_box03');
      return false;
    }
    play('se_dp_box01');
    if (button === 4) return true;
    s.memo[card]! ^= MEMO_FLAGS[button]!;
    s.marks[card] = s.memo[card]!;
    return false;
  }
  /** VoltorbFlipTaskEngine_Memo_SetUp: the memo window slides open if it's shut. */
  function memoSetUp(s: Scene): boolean {
    if (s.taskState === 0) {
      if (s.memoOpen) return true;
      animateOpenMemo(s);
      s.taskState++;
      return false;
    }
    return !animating(s, S_MEMO);
  }

  // --- The top screen ---

  /** VoltorbFlip_PrintCoins: the payout's or the Coin Case's five digits. */
  const printCoins = (s: Scene, which: 'total' | 'payout', amount: number) => {
    if (which === 'total') s.coinsShown = amount;
    else s.payoutShown = amount;
  };
  /** VoltorbFlip_TutorialScreenTransition: the top screen fades out, `render` changes it, it fades in. */
  function topTransition(s: Scene, render: () => void): boolean {
    if (s.taskState === 0) {
      s.topFade = { from: 0, to: 1, t: 0, n: TOP_FADE_FRAMES };
      s.taskState++;
    } else if (s.taskState === 1) {
      if (s.topFade.t >= s.topFade.n) {
        render();
        s.topFade = { from: 1, to: 0, t: 0, n: TOP_FADE_FRAMES };
        s.taskState++;
      }
    } else if (s.topFade.t >= s.topFade.n) return true;
    return false;
  }
  function renderTop(s: Scene, top: Scene['top']) {
    s.top = top;
    for (const i of S_SUB) s.sprites[i]!.draw = top === 'memo';
  }
  /** VoltorbFlip_PrintAndAwaitMessage: the screen dimmed and a message printed; true once it's done. */
  function printAndAwait(s: Scene, msg: number): boolean {
    if (s.taskState === 0) {
      dim(s);
      printText(s, msg);
      s.taskState++;
      return false;
    }
    return printerFinished(s);
  }

  // --- The API ---

  /** A round's end: settled, then the next board asked for; the game waits for both at its next round (COIN_CASE_FULL). */
  function settle(s: Scene, outcome: Outcome) {
    s.round = null;
    const flips = [...s.flips];
    calls.current
      .onSettle(flips, outcome)
      .then(() => calls.current.onRound(false))
      .then((round) => (s.round = round))
      .catch((e: Error) => (s.failure = e.message));
  }

  // --- The workflows (sVoltorbFlipWorkflows) ---

  type Task = (s: Scene) => boolean;
  const tutorialTidy: Task = (s) => {
    if (topTransition(s, () => renderTop(s, 'coins'))) {
      enqueue(s, SELECT_GAME_INFO);
      return true;
    }
    return false;
  };
  const WORKFLOWS: Record<number, { setup?: Task; begin?: (s: Scene) => void; main: Task; end?: (s: Scene) => void; tidy?: Task }> = {
    [COIN_CASE_FULL]: {
      // The board from the API (not in the game: its board is made at once).
      setup: (s) => {
        if (s.failure && s.stage !== 'failed') {
          s.stage = 'failed';
          setStage('failed');
          setFailure(s.failure);
        }
        if (!s.round) return false;
        s.coins = s.round.coins;
        return true;
      },
      begin: (s) => {
        if (s.coins >= MAX_COINS) {
          printText(s, 14);
          enqueue(s, TERMINATE);
        } else enqueue(s, NEW_ROUND);
      },
      main: (s) => printerFinished(s),
    },
    [NEW_ROUND]: {
      begin: (s) => {
        const round = s.round as Extract<VoltorbRound, { full: false }>;
        s.board = round.board;
        s.level = round.board.level;
        s.levelsGained = round.levelsGained;
        enqueue(s, SELECT_MAIN_MENU);
        if (!s.hasPlayed) return;
        s.levelShown = displayLevel(s.level);
        s.vars = [String(s.levelShown)];
        if (s.levelsGained > 0) {
          dim(s);
          printText(s, 41);
          play('se_gs_slot01');
        } else if (s.levelsGained < 0) {
          dim(s);
          printText(s, 43);
          play('se_gs_slot03');
        }
      },
      main: (s) => {
        if (!s.hasPlayed) return true;
        if (s.taskState === 0) {
          if (!printerFinished(s)) return false;
          if (s.levelsGained > 0) {
            if (s.printedMore) return true;
            s.printedMore = true;
            printText(s, 42);
            s.taskState++;
            return false;
          }
          return true;
        }
        return printerFinished(s);
      },
      // The game means to wait here while SLOT01 and SLOT02 play, but its test (one not playing, or the other) passes at once.
      tidy: (s) => {
        clearBg3(s);
        return true;
      },
    },
    [SELECT_MAIN_MENU]: {
      setup: (s) => {
        if (s.taskState === 0) dim(s);
        s.vars = [String(displayLevel(s.level))];
        return printAndAwait(s, s.hasPlayed ? 16 : 15);
      },
      begin: (s) => openMenu(s, 0),
      main: (s) => {
        const i = menuInput(s);
        if (i === 0) {
          undim(s);
          enqueue(s, RENDER_BOARD);
          return true;
        }
        if (i === 1) {
          enqueue(s, SELECT_GAME_INFO);
          return true;
        }
        if (i === 2 || i === -2) {
          enqueue(s, TERMINATE);
          return true;
        }
        return false;
      },
    },
    [SELECT_GAME_INFO]: {
      setup: (s) => printAndAwait(s, 20),
      begin: (s) => openMenu(s, 1),
      main: (s) => {
        const i = menuInput(s);
        if (i < 0 && i !== -2) return false;
        enqueue(s, i === 0 ? HOW_TO_PLAY : i === 1 ? HINT : i === 2 ? ABOUT_MEMO : SELECT_MAIN_MENU);
        return true;
      },
    },
    [HOW_TO_PLAY]: { setup: (s) => topTransition(s, () => renderTop(s, 'howto')), main: (s) => printAndAwait(s, 25), tidy: tutorialTidy },
    [HINT]: { setup: (s) => topTransition(s, () => renderTop(s, 'hint')), main: (s) => printAndAwait(s, 26), tidy: tutorialTidy },
    [ABOUT_MEMO]: { setup: (s) => topTransition(s, () => renderTop(s, 'memo')), main: (s) => printAndAwait(s, 27), tidy: tutorialTidy },
    [RENDER_BOARD]: {
      main: (s) => {
        clearBg3(s);
        printTotals(s);
        setBoardFocused(s, true);
        enqueue(s, AWAIT_BOARD_INTERACT);
        return true;
      },
    },
    [AWAIT_BOARD_INTERACT]: {
      main: (s) => {
        const input = handleInput(s);
        if (input === 1) {
          if (s.flipped[s.focus]) play('se_dp_box03');
          else {
            enqueue(s, FLIP_CARD);
            return true;
          }
        } else if (input === 4) {
          play('se_dp_select');
          setAnim(s, S_MEMO_BUTTON, 6);
          enqueue(s, s.touchNew ? MEMO_TOUCH : MEMO_BUTTONS);
          return true;
        } else if (input === 2 || input === 3) {
          play('se_dp_decide');
          setAnim(s, S_QUIT, 3);
          enqueue(s, QUIT_ROUND);
          return true;
        }
        return false;
      },
      tidy: buttonsIdle,
    },
    [FLIP_CARD]: {
      // VoltrbFlipWorkflow_CardFlipEffect_SetUp: when the card's row and column both hide Voltorbs and three in four of
      // the cards left in either are Voltorbs, "Is this what you're expecting?!" and a fanfare.
      setup: (s) => {
        if (s.taskState === 0) {
          const id = s.focus;
          const t = boardTotals(s.board!.cards);
          const col = id % 5;
          const row = Math.floor(id / 5);
          const inCol = t.voltorbsPerCol[col]!;
          const inRow = t.voltorbsPerRow[row]!;
          if (inCol && inRow) {
            const flippedInCol = [0, 1, 2, 3, 4].filter((r) => s.flipped[r * 5 + col]).length;
            const flippedInRow = [0, 1, 2, 3, 4].filter((c) => s.flipped[row * 5 + c]).length;
            if (Math.floor((100 * inCol) / (5 - flippedInCol)) >= 75 || Math.floor((inRow * 100) / (5 - flippedInRow)) >= 75) {
              printSmall(s, 29);
              play('me_cardgame1');
            }
          }
          s.taskState++;
          return false;
        }
        return !fanfarePlaying();
      },
      begin: (s) => {
        setFlipAnim(s, s.focus, 'single');
        play('se_gs_paneru_mekuru');
      },
      main: (s) => {
        const id = s.focus;
        const type = cardType(s, id);
        switch (s.taskState) {
          case 0:
            if (playFlipAnim(s)) s.taskState++;
            return false;
          case 1: {
            const flip = s.sprites[S_FLIP]!;
            flip.draw = true;
            flip.x = ((id % 5) * 4 + 1) * 8 + 12;
            flip.y = (Math.floor(id / 5) * 4 + 1) * 8 + 12;
            s.flipped[id] = true;
            s.memo[id] = 0;
            s.flips.push(id);
            if (type === VOLTORB) {
              setAnim(s, S_FLIP, 1);
              play('se_gs_coin_hazure');
            } else {
              const before = s.payout;
              s.payout = afterFlip(before, type);
              s.vars = [String(type), String(s.payout)];
              setAnim(s, S_FLIP, 0);
              if (before === 0) printSmall(s, 30);
              else if (type > 1) printSmall(s, 31);
              else return true;
            }
            s.taskState++;
            return false;
          }
          case 2:
            if (!sePlaying()) s.taskState++;
            return false;
          case 3:
            if (type === VOLTORB) {
              play('me_cardgame2');
              printSmall(s, 32);
              printCoins(s, 'payout', 0);
              s.taskState++;
            } else if (addCoinsToPayout(s)) s.taskState++;
            return false;
          default:
            return type === VOLTORB ? !fanfarePlaying() : pressed(s);
        }
      },
      end: (s) => {
        if (cardType(s, s.focus) === VOLTORB) {
          settle(s, 'lost');
          enqueue(s, REVEAL_BOARD);
        } else if (s.payout === maxPayout(s.board!.cards)) enqueue(s, WIN_ROUND);
        else enqueue(s, AWAIT_BOARD_INTERACT);
        clearBg3(s);
      },
    },
    [WIN_ROUND]: {
      main: (s) => {
        if (s.taskState === 0) {
          printText(s, 33);
          dim(s);
          play('me_mushitori3');
          s.taskState++;
        }
        if (!fanfarePlaying() && printerFinished(s)) {
          settle(s, 'won');
          enqueue(s, AWARD_COINS);
          return true;
        }
        return false;
      },
    },
    [AWARD_COINS]: {
      main: (s) => {
        if (s.taskState === 0) {
          s.vars = [String(s.payout), calls.current.playerName];
          printText(s, 40);
          dim(s);
          play('se_gs_coin_payout_one');
          s.taskState++;
        }
        if (s.taskState === 1) {
          if (awardPayout(s)) s.taskState++;
          return false;
        }
        if (!sePlaying() && printerFinished(s)) {
          clearBg3(s);
          undim(s);
          enqueue(s, REVEAL_BOARD);
          return true;
        }
        return false;
      },
    },
    [REVEAL_BOARD]: {
      main: (s) => {
        switch (s.taskState) {
          case 0:
            setFlipAnim(s, 0, 'reveal');
            play('se_gs_paneru_mekuru');
            s.taskState++;
            return false;
          case 1:
            if (playFlipAnim(s)) s.taskState++;
            return false;
          case 2:
            if (pressed(s)) {
              setFlipAnim(s, 0, 'clear');
              s.taskState++;
            }
            return false;
          default:
            if (playFlipAnim(s)) {
              enqueue(s, COIN_CASE_FULL);
              return true;
            }
            return false;
        }
      },
      // VoltorbFlipGameState_UpdateHistoryAndReset (the history is the API's), the board's numbers back to zeros.
      end: (s) => {
        s.board = null;
        s.flipped = Array(25).fill(false);
        s.memo = Array(25).fill(0);
        s.flips = [];
        s.payout = 0;
        setBoardFocused(s, false);
        setGridCursor0(s);
        printCoins(s, 'payout', 0);
        printCoins(s, 'total', s.coins);
        printTotals(s);
        s.hasPlayed = true;
      },
    },
    [MEMO_TOUCH]: {
      setup: memoSetUp,
      main: (s) => {
        const input = handleInput(s);
        if (input === 1) {
          play('se_dp_select');
          if (!s.touchNew) {
            enqueue(s, MEMO_BUTTONS);
            return true;
          }
        } else if (input === 3 || input === 4) {
          play('se_dp_select');
          s.memoOpen = false;
          setAnim(s, S_MEMO_BUTTON, 6);
          enqueue(s, AWAIT_BOARD_INTERACT);
          return true;
        } else if (input === 2) {
          play('se_dp_decide');
          s.memoOpen = false;
          setAnim(s, S_QUIT, 3);
          enqueue(s, QUIT_ROUND);
          return true;
        } else if (input >= 5) toggleMemo(s, s.focus, input - 5);
        else updateMemoPanel(s);
        return false;
      },
      tidy: (s) => memoTidy(s),
    },
    [MEMO_BUTTONS]: {
      setup: (s) => {
        if (s.taskState === 0) {
          if (!s.memoDimmed) s.memoDim = { from: 0, to: 6, t: 0, n: 1 };
          s.memoDimmed = true;
          setMemoFocused(s, true);
        }
        return memoSetUp(s);
      },
      main: (s) => {
        const input = handleInput(s);
        if (input === 1) {
          if (toggleMemo(s, s.focus, s.memoButton)) {
            enqueue(s, MEMO_TOUCH);
            return true;
          }
        } else if (input === 4) {
          play('se_dp_select');
          s.memoOpen = false;
          setAnim(s, S_MEMO_BUTTON, 6);
          enqueue(s, AWAIT_BOARD_INTERACT);
          return true;
        } else if (input === 3) {
          play('se_dp_button3');
          setAnim(s, S_MEMO_BACK, 17);
          enqueue(s, MEMO_TOUCH);
          return true;
        } else if (input === 2) {
          play('se_dp_decide');
          s.memoOpen = false;
          setAnim(s, S_QUIT, 3);
          enqueue(s, QUIT_ROUND);
          return true;
        } else updateMemoPanel(s);
        return false;
      },
      tidy: (s) => memoTidy(s),
    },
    [QUIT_ROUND]: {
      setup: (s) => {
        if (s.taskState === 0) {
          s.vars = [String(s.payout)];
          dim(s);
          printText(s, s.payout === 0 ? 37 : 34);
          s.taskState++;
          return false;
        }
        return printerFinished(s);
      },
      begin: (s) => (s.yesNo = { cursor: 0 }),
      main: (s) => {
        const answer = yesNoInput(s);
        if (answer === 'yes') {
          settle(s, 'quit');
          if (s.payout === 0) {
            clearBg3(s);
            undim(s);
            enqueue(s, REVEAL_BOARD);
          } else enqueue(s, AWARD_COINS);
          s.yesNo = null;
          return true;
        }
        if (answer === 'no') {
          clearBg3(s);
          undim(s);
          enqueue(s, s.memoOpen ? MEMO_TOUCH : AWAIT_BOARD_INTERACT);
          return true;
        }
        return false;
      },
    },
  };

  /** VoltorbFlipTaskEngine_Memo_TidyUp: the buttons' animations waited for, the memo's keys given back, and the window closed if it was shut. */
  function memoTidy(s: Scene): boolean {
    if (s.taskState === 0) {
      updateMemoPanel(s);
      s.taskState++;
    }
    if (s.taskState === 1) {
      if (!buttonsIdle(s)) return false;
      if (s.wf === MEMO_BUTTONS) {
        setMemoCursor0(s);
        setMemoFocused(s, false);
        s.memoDim = { from: brightness(s.memoDim), to: 0, t: 0, n: 1 };
        s.memoDimmed = false;
      }
      s.taskState++;
      return false;
    }
    if (s.taskState === 2) {
      if (s.memoOpen) return true;
      animateCloseMemo(s);
      s.taskState++;
      return false;
    }
    if (animating(s, S_MEMO)) return false;
    s.sprites[S_MEMO]!.draw = false;
    return true;
  }

  /** VoltorbFlip_AddCoinsToPayout: the payout counted up a coin a frame (a ping every 4), or at once on a press. */
  function addCoinsToPayout(s: Scene): boolean {
    if (pressed(s)) printCoins(s, 'payout', s.payout);
    else if (s.payout > s.payoutShown) {
      if (s.payoutShown % 4 === 0) play('se_gs_okozukai');
      printCoins(s, 'payout', s.payoutShown + 1);
    } else {
      play('se_gs_okozukai');
      return true;
    }
    return false;
  }
  /** VoltorbFlip_AwardPayoutToPlayer: the payout moved into the Coin Case a coin a frame, or all at once on a press or when it's full. */
  function awardPayout(s: Scene): boolean {
    if (s.payout > 0 && !pressed(s) && s.coins < MAX_COINS) {
      const left = s.payout;
      s.payout--;
      s.coins = Math.min(MAX_COINS, s.coins + 1);
      printCoins(s, 'payout', left - 1);
      printCoins(s, 'total', s.coins);
      if (left % 4 === 0) play('se_gs_coin_payout_one');
      return false;
    }
    s.coins = Math.min(MAX_COINS, s.coins + s.payout);
    s.payout = 0;
    printCoins(s, 'payout', 0);
    printCoins(s, 'total', s.coins);
    play('se_gs_coin_payout_last');
    return true;
  }

  // --- Drawing ---

  function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour = DARK, shadow = SHADOW, align: CanvasTextAlign = 'left') {
    ctx.textAlign = align;
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }
  /** A text window's message, its {ALN_CENTER} lines centred, at (x, y) in a box `w` wide, a line every 16 pixels. */
  function windowText(ctx: CanvasRenderingContext2D, msg: string, x: number, y: number, w: number, white = false) {
    fill(msg, [calls.current.playerName]).split('\n').forEach((line, i) => {
      const centred = line.startsWith('{ALN_CENTER}');
      const text = line.replace('{ALN_CENTER}', '');
      shadowText(ctx, text, centred ? x + w / 2 : x, y + 16 * i, white ? WHITE : DARK, white ? DARK : SHADOW, centred ? 'center' : 'left');
    });
  }
  /** A framed window (DrawFrameAndWindow2), in screen pixels. */
  function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = 'rgb(74,74,82)';
    ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    ctx.fillStyle = 'rgb(140,206,247)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = WHITE;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  }
  function tile(ctx: CanvasRenderingContext2D, img: HTMLImageElement, t: number, x: number, y: number) {
    ctx.drawImage(img, (t % 32) * 8, Math.floor(t / 32) * 8, 8, 8, x, y, 8, 8);
  }
  function sprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, meta: SpriteMeta, sp: Sprite) {
    let { cell } = animCell(meta.anims[sp.anim]!, sp.t);
    if (sp.pal4 && PALETTE_4[cell] !== undefined) cell = PALETTE_4[cell]!;
    const c = meta.cells[cell];
    if (c) ctx.drawImage(img, c.x, 0, c.w, c.h, sp.x - c.ox, sp.y - c.oy, c.w, c.h);
  }

  function draw(ctx: CanvasRenderingContext2D | null, s: Scene, img: Images) {
    if (!ctx) return;
    const meta = sheets.current!;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    drawTop(ctx, s, img, meta);
    ctx.fillStyle = 'rgb(30,30,36)';
    ctx.fillRect(0, SCREEN_H, W, HINGE);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, BOTTOM, W, SCREEN_H);
    ctx.clip();
    ctx.translate(0, BOTTOM);
    drawBottom(ctx, s, img, meta);
    ctx.restore();
    if (s.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${s.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** The top screen (the sub engine): the coins screen, or one of Game Info's, and its fade. */
  function drawTop(ctx: CanvasRenderingContext2D, s: Scene, img: Images, meta: Sheets) {
    ctx.fillStyle = meta.backdrop.top;
    ctx.fillRect(0, 0, W, SCREEN_H);
    ctx.drawImage(img[`top_${s.top}`], 0, 0);
    if (s.top === 'coins') {
      windowText(ctx, fill(T[0]!, [String(s.levelShown)]), 8, 8, 240, true);
      windowText(ctx, T[1]!, 8, 24, 240, true);
      windowText(ctx, T[2]!, 104, 52, 144, true);
      windowText(ctx, T[3]!, 104, 84, 144, true);
      windowText(ctx, T[4]!, 8, 112, 152);
      windowText(ctx, T[5]!, 8, 152, 152);
      for (const [amount, y] of [[s.coinsShown, 112], [s.payoutShown, 152]] as const) {
        String(amount).padStart(5, '0').split('').forEach((d, i) => ctx.drawImage(img.digits, Number(d) * 16, 0, 16, 32, 168 + 16 * i, y, 16, 32));
      }
    } else if (s.top === 'howto') {
      windowText(ctx, T[8]!, 8, 120, 56);
      windowText(ctx, T[11]!, 8, 40, 240);
      windowText(ctx, T[12]!, 80, 112, 168);
      windowText(ctx, T[13]!, 80, 152, 168);
    } else if (s.top === 'hint') windowText(ctx, T[9]!, 8, 136, 240);
    else {
      windowText(ctx, T[6]!, 16, 64, 48);
      windowText(ctx, T[10]!, 8, 128, 240);
      for (const i of S_SUB) if (s.sprites[i]!.draw) sprite(ctx, img.sprites_sub, meta.sub, s.sprites[i]!);
    }
    const f = brightness(s.topFade);
    if (f > 0) {
      ctx.fillStyle = `rgba(0,0,0,${f})`;
      ctx.fillRect(0, 0, W, SCREEN_H);
    }
  }

  /** The bottom screen (the main engine): BG0's board, the sprites, BG1's labels, BG2's numbers and marks, the flipping card, the dimming, then BG3's windows. */
  function drawBottom(ctx: CanvasRenderingContext2D, s: Scene, img: Images, meta: Sheets) {
    ctx.fillStyle = meta.backdrop.bottom;
    ctx.fillRect(0, 0, W, SCREEN_H);
    ctx.drawImage(img.board, 0, 0);
    // Each card's 3x3 tiles in place of the board's (what's see-through in them shows the backdrop).
    s.cardTile.forEach((base, id) => {
      const x = ((id % 5) * 4 + 1) * 8;
      const y = (Math.floor(id / 5) * 4 + 1) * 8;
      ctx.fillStyle = meta.backdrop.bottom;
      ctx.fillRect(x, y, 24, 24);
      for (let k = 0; k < 9; k++) tile(ctx, img.tiles, base + Math.floor(k / 3) * 32 + (k % 3), x + (k % 3) * 8, y + Math.floor(k / 3) * 8);
    });
    const memoDim = brightness(s.memoDim);
    if (memoDim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${memoDim / 16})`;
      ctx.fillRect(0, 0, W, SCREEN_H);
    }
    const order = s.sprites.map((sp, i) => ({ sp, i })).filter(({ i }) => i <= S_MEMO_CURSOR && i !== S_FLIP);
    order.sort((a, b) => SPRITES[b.i]![3] - SPRITES[a.i]![3] || b.i - a.i);
    for (const { sp } of order) if (sp.draw) sprite(ctx, img.sprites, meta.main, sp);
    windowText(ctx, T[s.ihMemoOpen ? 7 : 6]!, 200, 32, 48);
    windowText(ctx, T[8]!, 200, 168, 48);
    // BG2: each row's points (22,1+4i) and Voltorbs (23,2+4i), each column's (2+4i,21) and (3+4i,22); the marks.
    const t = s.totals ?? { pointsPerRow: [0, 0, 0, 0, 0], pointsPerCol: [0, 0, 0, 0, 0], voltorbsPerRow: [0, 0, 0, 0, 0], voltorbsPerCol: [0, 0, 0, 0, 0] };
    for (let i = 0; i < 5; i++) {
      tile(ctx, img.tiles, Math.floor(t.pointsPerRow[i]! / 10) + 1, 22 * 8, (1 + 4 * i) * 8);
      tile(ctx, img.tiles, (t.pointsPerRow[i]! % 10) + 1, 23 * 8, (1 + 4 * i) * 8);
      tile(ctx, img.tiles, t.voltorbsPerRow[i]! + 203, 23 * 8, (2 + 4 * i) * 8);
      tile(ctx, img.tiles, t.voltorbsPerRow[i]! + 235, 23 * 8, (3 + 4 * i) * 8);
      tile(ctx, img.tiles, Math.floor(t.pointsPerCol[i]! / 10) + 1, (2 + 4 * i) * 8, 21 * 8);
      tile(ctx, img.tiles, (t.pointsPerCol[i]! % 10) + 1, (3 + 4 * i) * 8, 21 * 8);
      tile(ctx, img.tiles, t.voltorbsPerCol[i]! + 203, (3 + 4 * i) * 8, 22 * 8);
      tile(ctx, img.tiles, t.voltorbsPerCol[i]! + 235, (3 + 4 * i) * 8, 23 * 8);
    }
    s.marks.forEach((m, id) =>
      MEMO_FLAGS.forEach((flag, k) => {
        if (m & flag) tile(ctx, img.tiles, MEMO_MARKS[k]![2], ((id % 5) * 4 + 1 + MEMO_MARKS[k]![0]) * 8, (Math.floor(id / 5) * 4 + 1 + MEMO_MARKS[k]![1]) * 8);
      }),
    );
    if (s.sprites[S_FLIP]!.draw) sprite(ctx, img.sprites, meta.main, s.sprites[S_FLIP]!);
    const dimLevel = brightness(s.dim);
    if (dimLevel > 0) {
      ctx.fillStyle = `rgba(0,0,0,${dimLevel / 16})`;
      ctx.fillRect(0, 0, W, SCREEN_H);
    }
    drawWindows(ctx, s);
  }

  /** BG3: the main text window (16,152), the small one (16,168), the list menu and the YES/NO prompt. */
  function drawWindows(ctx: CanvasRenderingContext2D, s: Scene) {
    if (s.stage === 'failed') {
      frame(ctx, 16, 152, 216, 32);
      shadowText(ctx, 'Voltorb Flip stopped:', 16, 152);
      shadowText(ctx, (s.failure ?? '').slice(0, 34), 16, 168);
      return;
    }
    if (s.printer) {
      frame(ctx, 16, 152, 216, 32);
      shadowText(ctx, s.printer.lines[0], 16, 152);
      shadowText(ctx, s.printer.lines[1], 16, 168);
      if (s.printer.wait && s.frame % 16 < 10) shadowText(ctx, '▼', 222, 168);
    } else if (s.small) {
      frame(ctx, 16, 168, 216, 16);
      shadowText(ctx, s.small, 16, 168);
    }
    if (s.menu) {
      const top = (17 - s.menu.items.length * 3) * 8;
      s.menu.items.forEach((item, i) => {
        const y = top + 24 * i;
        const lit = s.menu!.keys && s.menu!.cursor === i;
        ctx.fillStyle = 'rgb(74,74,82)';
        ctx.fillRect(137, y + 1, 102, 22);
        ctx.fillStyle = lit ? 'rgb(255,214,99)' : 'rgb(239,239,231)';
        ctx.fillRect(138, y + 2, 100, 20);
        shadowText(ctx, item, 188, y + 5, DARK, SHADOW, 'center');
      });
    }
    if (s.yesNo) {
      (['YES', 'NO'] as const).forEach((label, i) => {
        const y = 80 + 28 * i;
        ctx.fillStyle = 'rgb(74,74,82)';
        ctx.fillRect(200, y, 48, 26);
        ctx.fillStyle = s.yesNo!.cursor === i ? 'rgb(255,214,99)' : 'rgb(239,239,231)';
        ctx.fillRect(201, y + 1, 46, 24);
        shadowText(ctx, label, 224, y + 6, DARK, SHADOW, 'center');
      });
    }
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={W * SCALE}
        height={H * SCALE}
        onPointerDown={(e) => {
          e.preventDefault();
          sound.current?.resume();
          if (failed.current) return calls.current.onExit();
          const s = scene.current;
          if (!s) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const y = ((e.clientY - r.top) / r.height) * H - BOTTOM;
          // Only the bottom screen is a touch screen.
          if (y >= 0) s.touch = { x: Math.max(0, Math.min(W - 1, x)), y: Math.max(0, Math.min(SCREEN_H - 1, y)) };
        }}
        className="mx-auto block w-full max-w-[512px] cursor-pointer touch-none select-none rounded-lg bg-black ring-1 ring-slate-600 [image-rendering:pixelated]"
        style={{ aspectRatio: `${W} / ${H}` }}
        aria-label="Voltorb Flip: tap the cards on the bottom screen to flip them"
      />
      <div className="mx-auto flex max-w-[512px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-400">
          {failure ? `The game stopped: ${failure}. Tap the screen or press a key to leave.` : stage === 'loading' ? 'Shuffling the cards…' : 'Tap the bottom screen, or the arrows, Space (A), X (B) and M (memo).'}
        </p>
        <MinigameVolume volume={volume} onChange={setVolume} onTouch={() => sound.current?.resume()} />
      </div>
    </div>
  );
}
