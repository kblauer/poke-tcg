import {
  newSlotMachine,
  SLOT_KEYS,
  SLOT_LINES,
  slotAwaitingBet,
  slotAwaitingStop,
  slotFrame,
  slotLineDarkness,
  slotSpriteHFlip,
  slotSpriteImage,
  slotSymbolAtRest,
  type SlotMachine,
  type SlotMachineId,
  type SlotSprite,
} from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';
import { BUTTON } from '../../utils/styles';
import { useMusicHold } from '../MusicPlayer';
import { loadVolume } from './minigameSound';
import { MinigameVolume } from './MinigameVolume';
import { SlotSound } from './slotSound';

/** What the Game Corner gives a slot machine's screen. */
export interface SlotMachineScreenProps {
  /** Which of the Game Corner's 12 machines (0-11), as the game numbers them. */
  machine: number;
  /** Its luck today (slotMachineId): the machine id slot_machine.c plays with. */
  machineId: SlotMachineId;
  /** The account's coins as the screen opens: the screen keeps its own count from here, as the game does. */
  coins: number;
  /** A spin over: the coins bet (0 for a free one) and the coins paid out. The Game Corner settles it (`extras.coinRound`), in order. */
  onRound: (bet: number, payout: number) => void;
  /** The player left the machine. */
  onExit: () => void;
}

// The GBA's screen, drawn here pixel by pixel as its PPU does (its BGs from their tiles and tilemaps, its sprites, all in
// their palettes, the game's palette effects included), then SCALE times over on the canvas, the text in the site's font.
const W = 240;
const H = 160;
const SCALE = 4;
const FRAME_MS = 1000 / 60;
/** The game's Random(): 0-65535. */
const random16 = () => Math.floor(Math.random() * 0x10000);
const FONT = '12px "Pokemon Emerald"';
const ASSETS = '/extras/slots';

/** What tools/extras/emerald_slots.py writes in slots.json. */
interface SlotData {
  palettes: {
    bg: Record<string, number[]>;
    lights: number[][];
    obj: Record<'reel' | 'pikachu' | 'rtMisc' | 'machine' | 'misc' | 'explosion' | 'display', number[]>;
    shining: number[][];
  };
  tilemaps: { menu: number[]; info: number[]; reelTimeWindow: number[] };
  /** Each sprite's frames: their place in sprites.png and their top left corner from the sprite's position. */
  frames: Record<string, [x: number, y: number, w: number, h: number, ox: number, oy: number][]>;
}

/** An image's pixels as palette indexes (each a grey of index × 17). */
interface Indexed {
  w: number;
  h: number;
  px: Uint8Array;
}

interface Assets {
  data: SlotData;
  tiles: Indexed;
  msgbox: Indexed;
  frame: Indexed;
  sprites: Indexed;
}

async function loadIndexed(src: string): Promise<Indexed> {
  const blob = await (await fetch(src)).blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const px = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < px.length; i++) px[i] = Math.round(rgba[i * 4]! / 17);
  return { w: bitmap.width, h: bitmap.height, px };
}

async function loadAssets(): Promise<Assets> {
  const [data, tiles, msgbox, frame, sprites] = await Promise.all([
    fetch(`${ASSETS}/slots.json`).then((r) => r.json() as Promise<SlotData>),
    loadIndexed(`${ASSETS}/tiles.png`),
    loadIndexed(`${ASSETS}/msgbox.png`),
    loadIndexed(`${ASSETS}/frame.png`),
    loadIndexed(`${ASSETS}/sprites.png`),
  ]);
  return { data, tiles, msgbox, frame, sprites };
}

// The reels' overlay on BG 3 (LoadSlotMachineReelOverlay: sReelOverlay_Tilemap's entries), shading their top and bottom.
const REEL_OVERLAY = (() => {
  const map = Array<number>(1024).fill(0);
  const t = [0x2051, 0x2851, 0x2061, 0x2861, 0x20be, 0x28be, 0x20bf];
  for (let x = 4; x < 18; x += 5) {
    for (let dx = 0; dx < 4; dx++) {
      map[x + dx + 5 * 32] = t[0]!;
      map[x + dx + 13 * 32] = t[1]!;
      map[x + dx + 6 * 32] = t[2]!;
      map[x + dx + 12 * 32] = t[3]!;
    }
    map[x + 6 * 32] = t[4]!;
    map[x + 12 * 32] = t[5]!;
    for (let y = 7; y <= 11; y++) map[x + y * 32] = t[6]!;
  }
  return map;
})();

// The text windows on BG 0: the message box (WIN_MSG: 2,15, 27x4 tiles; DrawDialogueFrame, the message box's tiles at
// 0x200 in palette 15) and the YES/NO window (22,8, 5x4; the standard frame's tiles at 0x214 in palette 14), each filled
// with colour 1 of palette 15. FILL marks the windows' insides.
const DLG = 0x200;
const STD = 0x214;
const FILL = -1;
const MSG_WIN = { left: 2, top: 15, width: 27, height: 4 };
const YES_NO_WIN = { left: 22, top: 8, width: 5, height: 4 };

function dialogueFrame(map: number[]) {
  const { left: l, top: t, width: w, height: h } = MSG_WIN;
  const put = (x: number, y: number, entry: number) => (map[y * 32 + x] = entry);
  const row = (y: number, flip: number) => {
    put(l - 2, y, (DLG + 1) | flip);
    put(l - 1, y, (DLG + 3) | flip);
    for (let x = l; x < l + w - 1; x++) put(x, y, (DLG + 4) | flip);
    put(l + w - 1, y, (DLG + 5) | flip);
    put(l + w, y, (DLG + 6) | flip);
  };
  row(t - 1, 0);
  for (let y = t; y < t + 5; y++) {
    put(l - 2, y, DLG + 7);
    for (let x = l - 1; x < l + w; x++) put(x, y, DLG + 9);
    put(l + w, y, DLG + 10);
  }
  row(t + h, 0x800);
  for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) put(x, y, FILL);
}

function standardFrame(map: number[]) {
  const { left: l, top: t, width: w, height: h } = YES_NO_WIN;
  const put = (x: number, y: number, tile: number) => (map[y * 32 + x] = (STD + tile) | (14 << 12));
  put(l - 1, t - 1, 0);
  for (let x = l; x < l + w; x++) put(x, t - 1, 1);
  put(l + w, t - 1, 2);
  for (let y = t; y < t + h; y++) {
    put(l - 1, y, 3);
    put(l + w, y, 5);
  }
  put(l - 1, t + h, 6);
  for (let x = l; x < l + w; x++) put(x, t + h, 7);
  put(l + w, t + h, 8);
  for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) map[y * 32 + x] = FILL;
}

// The game's texts (src/strings.c).
const MESSAGES = {
  need3: ["You don't have three COINS."],
  maxCoins: ["You've got 9,999 COINS."],
  noCoins: ["You've run out of COINS.", 'Game over!'],
  quit: ['Quit the game?'],
};
const REEL_TIME_HELP = ['REEL TIME', "Here's your chance to take", 'aim and nail marks!', 'Reel Time continues for the', 'awarded number of spins.', 'It all ends on a Big Bonus.'];

/** The lines' palette slots in BG palette 4 (sMatchLinePalOffsets: the diagonals swapped) and their lit colours (RGB(…)). */
const LINE_OFFSETS = [10, 11, 12, 14, 13];
const LINE_LIT = [17 | (28 << 5) | (31 << 10), 31 | (29 << 5) | (16 << 10), 31 | (29 << 5) | (16 << 10), 31 | (21 << 5) | (18 << 10), 31 | (21 << 5) | (18 << 10)];

/** Which sprite palette each kind of sprite uses. */
function paletteOf(kind: string): keyof SlotData['palettes']['obj'] | 'aura' {
  if (kind.startsWith('dd_')) return 'display';
  if (kind === 'symbol' || kind === 'reel_bg') return 'reel';
  if (kind === 'rt_pikachu') return 'pikachu';
  if (kind === 'rt_antennae') return 'rtMisc';
  if (kind === 'rt_machine' || kind === 'rt_broken') return 'machine';
  if (kind === 'rt_explosion') return 'explosion';
  if (kind === 'rt_aura') return 'aura';
  return 'misc';
}

const channels = (c: number) => [c & 31, (c >> 5) & 31, (c >> 10) & 31] as const;
const pack = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);
/** MultiplyPaletteRGBComponents: each channel less its `n`/16. */
const darken = (c: number, n: number) => pack(...(channels(c).map((v) => v - ((v * n) >> 4)) as [number, number, number]));
/** MultiplyInvertedPaletteRGBComponents: each channel `n`/16 of the way to 31. */
const lighten = (c: number, n: number) => pack(...(channels(c).map((v) => v + (((31 - v) * n) >> 4)) as [number, number, number]));
/** BlendPalette toward black by the fade's `y`/16. */
const fadeColor = (c: number, y: number) => pack(...(channels(c).map((v) => v + ((-v * y) >> 4)) as [number, number, number]));
/** A 15-bit colour as the canvas's RGBA (little-endian ABGR), its 5 bits widened to 8. */
const RGBA = (() => {
  const lut = new Uint32Array(32768);
  for (let c = 0; c < 32768; c++) {
    const [r, g, b] = channels(c).map((v) => (v << 3) | (v >> 2));
    lut[c] = 0xff000000 | (b! << 16) | (g! << 8) | r!;
  }
  return lut;
})();
const css = (c: number) => {
  const [r, g, b] = channels(c).map((v) => (v << 3) | (v >> 2));
  return `rgb(${r},${g},${b})`;
};

/** A sprite to draw: its frame in the sheet, its top left on screen, flips, palette, order and effects. */
interface Obj {
  frame: [number, number, number, number, number, number];
  x: number;
  y: number;
  hFlip: boolean;
  vFlip: boolean;
  pal: number[];
  priority: number;
  order: number;
  sortY: number;
  mosaic: number;
  /** An affine sprite's inverse matrix (8.8), drawn double size round its centre. */
  affine?: { cx: number; cy: number; pa: number; pb: number; pc: number; pd: number };
}

/**
 * A slot machine at the Mauville Game Corner, as Emerald plays it (src/slot_machine.c; the game's logic is campaign's
 * `slotFrame`, 60 frames a second): Down (or the Bet button) puts in a coin, R (Max bet) three, A (Z, Enter, Space, a click
 * or a tap) spins and stops each reel in turn; SELECT (Shift) shows the Reel Time help; B (X, Backspace) asks to quit;
 * START (S) pays a win out at once. The coins are the screen's own, from `coins`; each spin's bet and payout go to
 * `onRound` (a Replay's spin bets 0). Fanfares and Reel Time's song pause the site's music while they play.
 */
export function SlotMachineScreen({ machine, machineId, coins, onRound, onExit }: SlotMachineScreenProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hint, setHint] = useState<'bet' | 'stop' | 'menu' | 'other'>('other');
  const onRoundRef = useRef(onRound);
  onRoundRef.current = onRound;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const hold = useMusicHold();
  const holdRef = useRef(hold);
  holdRef.current = hold;
  // The machine is made once, with the coins the screen opened with (the game reads them as it starts).
  const startCoins = useRef(coins);
  const startId = useRef(machineId);

  // The sounds (slotSound.ts), made with the screen and closed with it; their volume, the slider under the screen.
  const sound = useRef<SlotSound | null>(null);
  const [volume, setVolume] = useState(loadVolume);
  useEffect(() => {
    const s = new SlotSound(loadVolume());
    sound.current = s;
    return () => {
      s.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => sound.current?.setVolume(volume), [volume]);

  // The buttons pressed since the last frame, and those held down (keys, the canvas, the buttons under it).
  const input = useRef({ pressed: 0, held: 0 });
  const press = (key: number) => {
    sound.current?.resume();
    input.current.pressed |= key;
    input.current.held |= key;
  };
  const release = (key: number) => (input.current.held &= ~key);

  useEffect(() => {
    const keyOf = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'z':
        case 'Z':
        case 'Enter':
        case ' ':
          return SLOT_KEYS.a;
        case 'x':
        case 'X':
        case 'Backspace':
          return SLOT_KEYS.b;
        case 'Shift':
          return SLOT_KEYS.select;
        case 's':
        case 'S':
          return SLOT_KEYS.start;
        case 'r':
        case 'R':
          return SLOT_KEYS.r;
        case 'ArrowUp':
          return SLOT_KEYS.up;
        case 'ArrowDown':
          return SLOT_KEYS.down;
        case 'ArrowLeft':
          return SLOT_KEYS.left;
        case 'ArrowRight':
          return SLOT_KEYS.right;
      }
      return 0;
    };
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const key = keyOf(e);
      if (!key) return;
      e.preventDefault();
      if (e.repeat) return;
      press(key);
    };
    const onUp = (e: KeyboardEvent) => release(keyOf(e));
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let held = false;
    let roulette = false;
    let lastHint = '';
    loadAssets()
      .then((assets) => {
        if (stopped) return;
        const m = newSlotMachine(startId.current, startCoins.current, random16);
        const screen = document.createElement('canvas');
        screen.width = W;
        screen.height = H;
        const screenCtx = screen.getContext('2d')!;
        const image = screenCtx.createImageData(W, H);
        const pixels = new Uint32Array(image.data.buffer);
        setLoaded('ready');
        let last = performance.now();
        let spare = 0;
        const loop = (t: number) => {
          if (stopped) return;
          spare = Math.min(spare + t - last, 250);
          last = t;
          while (spare >= FRAME_MS) {
            spare -= FRAME_MS;
            const frameInput = { pressed: input.current.pressed, held: input.current.held };
            input.current.pressed = 0;
            for (const e of slotFrame(m, frameInput, random16)) {
              if ('sound' in e) sound.current?.play(e.sound);
              else if ('fanfare' in e) sound.current?.play(e.fanfare);
              else if ('round' in e) onRoundRef.current(e.round.bet, e.round.payout);
              else if ('exit' in e) {
                stopped = true;
                onExitRef.current();
                return;
              }
            }
            // A fanfare pauses the map's music (PlayFanfare), and Reel Time plays its own song instead of it.
            const wantHold = !!m.fanfare || m.music !== 'corner';
            if (wantHold !== held) {
              held = wantHold;
              holdRef.current(held);
            }
            const wantRoulette = m.music === 'roulette' && !m.fanfare;
            if (wantRoulette !== roulette) {
              roulette = wantRoulette;
              if (roulette) sound.current?.startRoulette();
              else sound.current?.stopLoop();
            }
          }
          const nextHint = slotAwaitingBet(m) ? 'bet' : slotAwaitingStop(m) ? 'stop' : m.yesNo !== null ? 'menu' : 'other';
          if (nextHint !== lastHint) {
            lastHint = nextHint;
            setHint(nextHint);
          }
          draw(m, assets, pixels);
          screenCtx.putImageData(image, 0, 0);
          const ctx = canvas.current?.getContext('2d');
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(screen, 0, 0, W * SCALE, H * SCALE);
            drawText(ctx, m, assets);
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => setLoaded('failed'));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const button = (label: string, key: number, title: string) => (
    <button
      type="button"
      className={`${BUTTON} touch-none select-none`}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        press(key);
      }}
      onPointerUp={() => release(key)}
      onPointerLeave={() => release(key)}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={W * SCALE}
        height={H * SCALE}
        onPointerDown={(e) => {
          e.preventDefault();
          press(SLOT_KEYS.a);
        }}
        onPointerUp={() => release(SLOT_KEYS.a)}
        onPointerLeave={() => release(SLOT_KEYS.a)}
        className="mx-auto block aspect-[3/2] w-full max-w-[960px] cursor-pointer touch-none select-none rounded-lg bg-black ring-1 ring-slate-600 [image-rendering:pixelated]"
        aria-label={`Slot machine ${machine + 1}: a click or a tap is the A button`}
      />
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-center gap-2">
        {button('▲', SLOT_KEYS.up, 'Up (the arrow keys)')}
        {button('Bet 1 ▼', SLOT_KEYS.down, 'Bet a coin: Down (the arrow keys)')}
        {button('Max bet', SLOT_KEYS.r, 'Bet 3 coins: R')}
        {button(hint === 'stop' ? 'Stop' : 'A', SLOT_KEYS.a, 'A: spin, stop a reel, answer (Z, Enter, Space, or a click on the screen)')}
        {button('Pay out', SLOT_KEYS.start, 'START: pay a win out at once (S)')}
        {button('Info', SLOT_KEYS.select, 'SELECT: the Reel Time help (Shift)')}
        {button(hint === 'menu' ? 'No' : 'Quit', SLOT_KEYS.b, 'B: quit, or no (X, Backspace)')}
      </div>
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-400">
          {loaded === 'loading'
            ? 'Taking a seat at the slot machine…'
            : loaded === 'failed'
              ? "The slot machine couldn't be loaded."
              : hint === 'bet'
                ? 'Down puts in a coin (3 at most, R all 3), A spins. SELECT: help, B: quit.'
                : hint === 'stop'
                  ? 'A (or a click) stops the next reel.'
                  : hint === 'menu'
                    ? 'Up and down to choose, A to answer.'
                    : 'A to go on; hold A to pay out faster, START to pay out at once.'}
        </p>
        <MinigameVolume volume={volume} onChange={setVolume} onTouch={() => sound.current?.resume()} />
      </div>
    </div>
  );
}

/** The screen's palettes this frame: the BGs' and each sprite palette, with the game's palette effects and the fade. */
function palettes(m: SlotMachine, data: SlotData) {
  const y = m.fade.y;
  const bg: number[][] = [];
  for (const [n, pal] of Object.entries(data.palettes.bg)) bg[Number(n)] = [...pal];
  if (m.lightsPal >= 0) bg[1] = [...data.palettes.lights[m.lightsPal]!];
  const lines = [...bg[4]!];
  for (let line = 0; line < SLOT_LINES; line++) {
    const color = m.lineLit[line] ? LINE_LIT[line]! : bg[4]![10 + line]!;
    lines[LINE_OFFSETS[line]!] = darken(color, slotLineDarkness(m, line));
  }
  bg[4] = lines;
  const o = data.palettes.obj;
  const obj: Record<string, number[]> = { ...o, display: m.displayPal < 3 ? data.palettes.shining[m.displayPal]! : o.display };
  obj.aura = o.misc.map((c, i) => (i === 3 ? lighten(c, m.auraLight) : c));
  const fade = (pal: number[]) => pal.map((c) => fadeColor(c, y));
  return {
    bg: bg.map((p) => (p ? fade(p) : p)),
    obj: Object.fromEntries(Object.entries(obj).map(([k, p]) => [k, fade(p)])) as Record<string, number[]>,
  };
}

/** One BG layer: each pixel its 15-bit colour, or -1 where it's see-through. */
function drawBg(out: Int32Array, map: (i: number) => number, tiles: (entry: number) => [Indexed, number], pals: number[][], hofs = 0, vofs = 0) {
  out.fill(-1);
  for (let y = 0; y < H; y++) {
    const my = (y + vofs) & 255;
    for (let x = 0; x < W; x++) {
      const mx = (x + hofs) & 255;
      const entry = map((my >> 3) * 32 + (mx >> 3));
      if (entry === FILL) {
        out[y * W + x] = pals[15]![1]!;
        continue;
      }
      const [sheet, tile] = tiles(entry);
      const tx = entry & 0x400 ? 7 - (mx & 7) : mx & 7;
      const ty = entry & 0x800 ? 7 - (my & 7) : my & 7;
      const sx = (tile % 16) * 8 + tx;
      const sy = Math.floor(tile / 16) * 8 + ty;
      if (sy >= sheet.h) continue;
      const v = sheet.px[sy * sheet.w + sx]!;
      if (v) out[y * W + x] = pals[entry >> 12]?.[v] ?? 0;
    }
  }
}

const layers = Array.from({ length: 4 }, () => new Int32Array(W * H));
const objColor = new Int32Array(W * H);
const objPriority = new Int8Array(W * H);

/** The frame, as the GBA would show it: the BGs and sprites by priority, BG 3 blended over the reels, window 0. */
function draw(m: SlotMachine, assets: Assets, pixels: Uint32Array) {
  const { data } = assets;
  const pals = palettes(m, data);
  const menuTiles = (entry: number): [Indexed, number] => {
    const tile = entry & 0x3ff;
    if (tile >= STD) return [assets.frame, tile - STD];
    if (tile >= DLG) return [assets.msgbox, tile - DLG];
    return [assets.tiles, tile];
  };
  // BG 0: the text windows.
  const bg0 = Array<number>(1024).fill(0);
  if (m.message) dialogueFrame(bg0);
  if (m.yesNo !== null) standardFrame(bg0);
  for (let i = 0; i < 1024; i++) {
    const tile = bg0[i]! & 0x3ff;
    if (bg0[i] !== FILL && tile >= DLG && tile < STD) bg0[i] = bg0[i]! | (15 << 12);
  }
  drawBg(layers[0]!, (i) => bg0[i]!, menuTiles, pals.bg);
  // BG 1: Reel Time's window, sliding in and shaking.
  drawBg(layers[1]!, (i) => (m.bg1[i] ? data.tilemaps.reelTimeWindow[m.bg1[i]! - 1]! : 0), menuTiles, pals.bg, m.bg1Hofs, m.bg1Vofs);
  // BG 2: the machine (or the info screen), with the game's writes over it.
  const bg2 = m.bg2 === 'menu' ? data.tilemaps.menu : data.tilemaps.info;
  drawBg(layers[2]!, (i) => m.bg2Writes[i] ?? bg2[i] ?? 0, menuTiles, pals.bg);
  // BG 3: the reels' shading.
  if (m.bg3Shown) drawBg(layers[3]!, (i) => REEL_OVERLAY[i]!, menuTiles, pals.bg);
  else layers[3]!.fill(-1);

  drawSprites(m, assets, pals.obj);

  const backdrop = pals.bg[0]![0]!;
  const win = m.win0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // The two front layers: lower priority numbers in front; a sprite in front of a BG of its own priority.
      let top = backdrop;
      let topKey = 99;
      let topLayer = -2;
      let second = backdrop;
      let secondKey = 99;
      let secondLayer = -2;
      const consider = (color: number, key: number, layer: number) => {
        if (key < topKey) {
          second = top;
          secondKey = topKey;
          secondLayer = topLayer;
          top = color;
          topKey = key;
          topLayer = layer;
        } else if (key < secondKey) {
          second = color;
          secondKey = key;
          secondLayer = layer;
        }
      };
      const inWin = x >= win.left && x < win.right && y >= win.top && y < win.bottom;
      if (objColor[i]! >= 0 && (inWin ? win.objIn : win.objOut)) consider(objColor[i]!, objPriority[i]! * 8, -1);
      const bgPriority = [0, 1, 2, 1];
      for (let b = 0; b < 4; b++) {
        const c = layers[b]![i]!;
        if (c >= 0) consider(c, bgPriority[b]! * 8 + 1 + b, b);
      }
      let color = top;
      // BLDCNT: BG 3 over a sprite blends, 9/16 of it and 8/16 of the sprite (BLDALPHA 9, 8).
      if (topLayer === 3 && secondLayer === -1 && secondKey < 99) {
        const [r1, g1, b1] = channels(top);
        const [r2, g2, b2] = channels(second);
        color = pack(Math.min(31, (r1 * 9 + r2 * 8) >> 4), Math.min(31, (g1 * 9 + g2 * 8) >> 4), Math.min(31, (b1 * 9 + b2 * 8) >> 4));
      }
      pixels[i] = RGBA[color]!;
    }
  }
}

/** The sprites (OAM): the game's own (the reels' symbols and background, the coin numbers) and the machine's, front first. */
function drawSprites(m: SlotMachine, assets: Assets, pals: Record<string, number[]>) {
  const frames = assets.data.frames;
  const objs: Obj[] = [];
  const add = (kind: string, image: number, cx: number, cy: number, priority: number, order: number, extra: Partial<Obj> = {}) => {
    const frame = frames[kind]?.[image];
    if (!frame) return;
    const [, , w, h, ox, oy] = frame;
    const hFlip = !!extra.hFlip;
    const vFlip = !!extra.vFlip;
    objs.push({
      frame,
      x: cx + (hFlip ? -(ox + w) : ox),
      y: cy + (vFlip ? -(oy + h) : oy),
      hFlip,
      vFlip,
      pal: pals[paletteOf(kind)]!,
      priority,
      order,
      sortY: cy,
      mosaic: 0,
      ...extra,
    });
  };
  // The reels' symbols (SpriteCB_ReelSymbol): 5 a reel down its 120-pixel window, and their white background.
  for (let reel = 0; reel < 3; reel++) {
    for (let j = 0; j < 120; j += 24) {
      const d2 = (m.reelPixelOffsets[reel]! + j) % 120;
      add('symbol', slotSymbolAtRest(m, reel, Math.floor(d2 / 24)), 48 + reel * 40, m.reelShockOffsets[reel]! + 28 + d2, 3, 14);
    }
  }
  add('reel_bg', 0, 88, 72, 3, 15);
  // The credit and payout counters (SpriteCB_CoinNumber): 4 digits each.
  for (let i = 0, mult = 1; mult <= 9999; i++, mult *= 10) {
    add('digit', Math.floor((m.coins % (mult * 10)) / mult), 203 - 7 * i, 23, 2, 13);
    add('digit', Math.floor((m.payout % (mult * 10)) / mult), 235 - 7 * i, 23, 2, 13);
  }
  for (const s of m.sprites) {
    if (!s || s.invisible || s.kind === 'flash_line' || s.kind === 'empty') continue;
    const cx = s.x + s.x2 + (s.coordOffset ? m.spriteOffsetX : 0);
    const cy = s.y + s.y2 + (s.coordOffset ? m.spriteOffsetY : 0);
    add(s.kind, slotSpriteImage(s), cx, cy, s.priority, s.subpriority, {
      hFlip: slotSpriteHFlip(s),
      vFlip: s.vFlip,
      mosaic: s.mosaic ? m.mosaic : 0,
      affine: affineOf(s, cx, cy),
    });
  }
  // SortSprites: by priority, then the lower on screen in front.
  objs.sort((a, b) => a.priority * 256 + a.order - (b.priority * 256 + b.order) || b.sortY - a.sortY);
  objColor.fill(-1);
  const sheet = assets.sprites;
  for (let n = objs.length - 1; n >= 0; n--) {
    const o = objs[n]!;
    const [fx, fy, w, h] = o.frame;
    const plot = (x: number, y: number, sx: number, sy: number) => {
      if (x < 0 || x >= W || y < 0 || y >= H || sx < 0 || sy < 0 || sx >= w || sy >= h) return;
      const v = sheet.px[(fy + sy) * sheet.w + fx + sx]!;
      if (!v) return;
      objColor[y * W + x] = o.pal[v]!;
      objPriority[y * W + x] = o.priority;
    };
    if (o.affine) {
      // Double size: the box twice the sprite's, round its centre; each pixel's texel by the inverse matrix.
      const { cx, cy, pa, pb, pc, pd } = o.affine;
      for (let dy = -h; dy < h; dy++) {
        for (let dx = -w; dx < w; dx++) {
          const tx = ((pa * dx + pb * dy) >> 8) + (w >> 1);
          const ty = ((pc * dx + pd * dy) >> 8) + (h >> 1);
          plot(cx + dx, cy + dy, tx, ty);
        }
      }
      continue;
    }
    const block = o.mosaic + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = o.x + x;
        const py = o.y + y;
        // OBJ mosaic: each block shows its top left pixel.
        const mx = block > 1 ? px - ((px % block) + block) % block - o.x : x;
        const my = block > 1 ? py - ((py % block) + block) % block - o.y : y;
        plot(px, py, o.hFlip ? w - 1 - mx : mx, o.vFlip ? h - 1 - my : my);
      }
    }
  }
}

/** An affine sprite's matrix (ObjAffineSet: the scale's inverse, the rotation), from its affine animation's state. */
function affineOf(s: SlotSprite, cx: number, cy: number): Obj['affine'] {
  if (!s.affine) return undefined;
  const theta = (s.affine.rotation / 0x10000) * Math.PI * 2;
  const xs = s.affine.xScale ? 0x10000 / s.affine.xScale : 0;
  const ys = s.affine.yScale ? 0x10000 / s.affine.yScale : 0;
  return {
    cx,
    cy,
    pa: Math.round(xs * Math.cos(theta)),
    pb: Math.round(-xs * Math.sin(theta)),
    pc: Math.round(ys * Math.sin(theta)),
    pd: Math.round(ys * Math.cos(theta)),
  };
}

/** Text with the game's shadow (a pixel right and down), in screen pixels. */
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, shadow: string) {
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** The windows' text (BG 0), in the font's colours from the faded palettes. */
function drawText(ctx: CanvasRenderingContext2D, m: SlotMachine, assets: Assets) {
  const bg = assets.data.palettes.bg;
  const color = (pal: string, i: number) => css(fadeColor(bg[pal]![i]!, m.fade.y));
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  // The message box's: dark grey on light grey (palette 15's colours 2 and 3).
  const dark = color('15', 2);
  const light = color('15', 3);
  if (m.message) MESSAGES[m.message].forEach((line, i) => shadowText(ctx, line, MSG_WIN.left * 8, MSG_WIN.top * 8 + 1 + 16 * i, dark, light));
  if (m.yesNo !== null) {
    const x = YES_NO_WIN.left * 8;
    const y = YES_NO_WIN.top * 8 + 1;
    shadowText(ctx, 'YES', x + 8, y, dark, light);
    shadowText(ctx, 'NO', x + 8, y + 16, dark, light);
    shadowText(ctx, '▶', x, y + 16 * m.yesNo, dark, light);
  }
  // The Reel Time help (WIN_INFO, 1,3): white on dark grey, a black shadow (palette 13).
  if (m.infoText) {
    REEL_TIME_HELP.forEach((line, i) => {
      const x = 8 + 2;
      const y = 24 + 5 + 16 * i;
      ctx.fillStyle = color('13', 3);
      ctx.fillRect(x, y - 1, Math.ceil(ctx.measureText(line).width) + 1, 16);
      shadowText(ctx, line, x, y, color('13', 1), color('13', 2));
    });
  }
}
