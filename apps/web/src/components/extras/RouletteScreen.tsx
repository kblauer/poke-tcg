import { newRouletteGame, rouletteFrame, rouletteSelectionAt, type RouletteGame, type RouletteInput, type RoulettePalette } from '@poke-tcg/campaign';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { CHOICE_BUTTON } from '../../utils/styles';
import { useMusicHold } from '../MusicPlayer';
import { loadVolume } from './minigameSound';
import { MinigameVolume } from './MinigameVolume';
import { H, initialPalette, renderRoulette, W, type RouletteAssets, type RouletteData } from './rouletteDraw';
import { RouletteSound } from './rouletteSound';

/** What the Game Corner gives the roulette's screen. */
export interface RouletteScreenProps {
  /** The table played: 0 the left one (a bet is 1 coin), 1 the right one (3 coins). */
  table: 0 | 1;
  /** The account's coins as the screen opens: the screen keeps its own count from here, as the game does. */
  coins: number;
  /** A round over: the coins bet and the coins paid back (0 for a loss). The Game Corner settles it (`extras.coinRound`), in order. */
  onRound: (bet: number, payout: number) => void;
  /** The player left the table. */
  onExit: () => void;
}

// The GBA's screen, drawn SCALE times over on the canvas so the text stays crisp when it's scaled to fit.
const SCALE = 4;
const FRAME_MS = 1000 / 60;
/** The game's Random(): 0-65535. */
const random16 = () => Math.floor(Math.random() * 0x10000);

// The standard text palette's colours (graphics/interface/std_menu.pal): dark grey on a light grey shadow.
const DARK_GRAY = 'rgb(98,98,98)';
const LIGHT_GRAY = 'rgb(213,213,205)';
const FONT = '12px "Pokemon Emerald"';

/** An image's pixels as indexes (greyscale, `scale` times the index). */
async function indexes(src: string, scale: number) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(rgba[i * 4]! / scale);
  return { px: out, width: img.width };
}

/** roulette.json, tiles.png and wheel-map.png (tools/extras/emerald_roulette.py), as the drawing reads them. */
async function loadAssets(): Promise<RouletteAssets> {
  const [data, tiles, wheel] = await Promise.all([
    fetch('/extras/roulette/roulette.json').then((r) => r.json() as Promise<RouletteData>),
    indexes('/extras/roulette/tiles.png', 17),
    indexes('/extras/roulette/wheel-map.png', 1),
  ]);
  // tiles.png is 32 tiles a row: each tile's 64 pixels together.
  const count = (tiles.px.length / 64) | 0;
  const flat = new Uint8Array(count * 64);
  for (let t = 0; t < count; t++)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) flat[t * 64 + y * 8 + x] = tiles.px[((t >> 5) * 8 + y) * tiles.width + (t & 31) * 8 + x]!;
  return { data, tiles: flat, wheel: wheel.px };
}

/** A window: the standard frame round its box (in screen pixels, the frame outside it, as the game draws it). */
function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgb(98,98,98)';
  ctx.fillRect(x - 5, y - 6, w + 10, h + 12);
  ctx.fillStyle = 'rgb(164,197,246)';
  ctx.fillRect(x - 4, y - 5, w + 8, h + 10);
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(x - 2, y - 3, w + 4, h + 6);
}

/** Text with the game's shadow (a pixel right and down). */
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = LIGHT_GRAY;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = DARK_GRAY;
  ctx.fillText(text, x, y);
}

/**
 * The Game Corner's roulette (RouletteScreen's), as Emerald plays it (src/roulette.c): the table's question, then the
 * board (the wheel on the left, the grid of bets on the right), played with campaign's `rouletteFrame` 60 frames a
 * second and drawn as the GBA draws it (the wheel an affine BG turned with the wheel, the grid a BG sliding off and on,
 * the sprites with their priorities, Shroomish's shadow see-through, the palettes flashing and fading). Arrows (the
 * D-pad), Z, Enter or Space (A), X, Backspace or Escape (B); a click on a square bets on it, on YES or NO answers; the
 * buttons under the screen are the GBA's for touch. Each ball's bet and payout go to `onRound`, leaving to `onExit`.
 */
export function RouletteScreen({ table, coins, onRound, onExit }: RouletteScreenProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<RouletteGame | null>(null);
  const pending = useRef<RouletteInput>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [betting, setBetting] = useState(false);
  const hold = useMusicHold();
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const onRoundRef = useRef(onRound);
  onRoundRef.current = onRound;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  // The coins as the screen opened: the game counts from them (a later change of the prop is the Game Corner's settling).
  const startCoins = useRef(coins);

  // The sounds (rouletteSound.ts), made with the screen and closed with it; their volume, the slider under the screen.
  const sound = useRef<RouletteSound | null>(null);
  const [volume, setVolume] = useState(loadVolume);
  useEffect(() => {
    const s = new RouletteSound(loadVolume());
    sound.current = s;
    return () => {
      s.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => sound.current?.setVolume(volume), [volume]);

  /** A button pressed: kept for the next frame (JOY_NEW). */
  const press = useCallback((input: RouletteInput) => {
    sound.current?.resume();
    pending.current = { ...pending.current, ...input };
  }, []);

  useEffect(() => {
    const keys: Record<string, keyof RouletteInput> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      z: 'a',
      Z: 'a',
      Enter: 'a',
      ' ': 'a',
      x: 'b',
      X: 'b',
      Backspace: 'b',
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const key = keys[e.key];
      if (!key) return;
      e.preventDefault();
      press({ [key]: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);
  useEscape(useCallback(() => press({ b: true }), [press]));

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    Promise.all([loadAssets(), document.fonts?.load(FONT).catch(() => undefined)])
      .then(([assets]) => {
        if (stopped) return;
        const g = newRouletteGame(table, startCoins.current, new Date().getHours());
        game.current = g;
        const palette = initialPalette(assets.data);
        setLoading(false);
        let last = performance.now();
        let spare = 0;
        const loop = (t: number) => {
          if (stopped) return;
          spare = Math.min(spare + t - last, 250);
          last = t;
          while (spare >= FRAME_MS && g.task !== 'gone') {
            const input = pending.current;
            pending.current = {};
            for (const e of rouletteFrame(g, input, random16, palette)) {
              if (e.type === 'sound') sound.current?.start(e.name);
              else if (e.type === 'stopSound') sound.current?.stop(e.name);
              else if (e.type === 'cry') sound.current?.start(`cry_${e.species}`);
              else if (e.type === 'fanfare') holdRef.current(true);
              else if (e.type === 'fanfareEnd') holdRef.current(false);
              else if (e.type === 'round') onRoundRef.current(e.bet, e.payout);
              else if (e.type === 'exit') {
                holdRef.current(false);
                sound.current?.stopAll();
                stopped = true;
                onExitRef.current();
                return;
              }
            }
            spare -= FRAME_MS;
          }
          setBetting(g.task === 'handleBetGridInput');
          draw(canvas.current?.getContext('2d') ?? null, g, assets, palette);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e: Error) => setFailure(e.message));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [table]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={W * SCALE}
        height={H * SCALE}
        onPointerDown={(e) => {
          e.preventDefault();
          const g = game.current;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const y = ((e.clientY - r.top) / r.height) * H;
          if (g?.yesNo !== null && g?.yesNo !== undefined && x >= 168 && x < 208 && y >= 72 && y < 104) {
            // The YES/NO window, a line 16px.
            press({ answer: y < 88 ? 'yes' : 'no' });
            return;
          }
          if (g?.task === 'handleBetGridInput') {
            const selection = rouletteSelectionAt(Math.floor(x / 8), Math.floor(y / 8));
            if (selection !== null) {
              press({ select: selection });
              return;
            }
          }
          press({ a: true });
        }}
        className="mx-auto block aspect-[3/2] w-full max-w-[960px] cursor-pointer touch-none select-none rounded-lg bg-black ring-1 ring-slate-600 [image-rendering:pixelated]"
        aria-label="The Game Corner's roulette: click a square of the grid to bet on it"
      />
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1" aria-label="The GBA's buttons">
          {(
            [
              ['left', '←', 'Left'],
              ['up', '↑', 'Up'],
              ['down', '↓', 'Down'],
              ['right', '→', 'Right'],
            ] as const
          ).map(([key, label, name]) => (
            <button key={key} type="button" className={`${CHOICE_BUTTON} w-9`} onPointerDown={(e) => (e.preventDefault(), press({ [key]: true }))} aria-label={name} title={name}>
              {label}
            </button>
          ))}
          <button type="button" className={`${CHOICE_BUTTON} ml-2 w-9 font-semibold`} onPointerDown={(e) => (e.preventDefault(), press({ a: true }))} title="A (Z, Enter or Space)">
            A
          </button>
          <button type="button" className={`${CHOICE_BUTTON} w-9 font-semibold`} onPointerDown={(e) => (e.preventDefault(), press({ b: true }))} title="B (X, Backspace or Escape)">
            B
          </button>
        </div>
        <MinigameVolume volume={volume} onChange={setVolume} onTouch={() => sound.current?.resume()} />
      </div>
      <p className="mx-auto max-w-[960px] text-xs text-slate-400">
        {failure
          ? `The roulette couldn't be set up: ${failure}`
          : loading
            ? 'Sitting down at the table…'
            : betting
              ? 'Arrows to choose a bet and A (Z, Enter or Space) to place it, or click a square: a Pokémon of a colour pays ×12, a Pokémon (column) or a colour (row) more the more of it the ball has hit this round.'
              : 'A (Z, Enter, Space or a click) to go on; B (X, Backspace or Escape) answers No.'}
      </p>
    </div>
  );
}

/** The GBA-sized canvas each frame's pixels are put in before they're scaled up (one for every screen). */
let small: HTMLCanvasElement | null = null;

/** The frame: the GBA's screen (rouletteDraw.ts), scaled up; then the windows and their text, and the palette fades over all. */
function draw(ctx: CanvasRenderingContext2D | null, g: RouletteGame, assets: RouletteAssets, palette: RoulettePalette) {
  if (!ctx) return;
  const image = ctx.createImageData(W, H);
  renderRoulette(g, assets, palette, new Uint32Array(image.data.buffer));
  // The pixels drawn small, then scaled up crisp; the windows' text drawn at the canvas's own size.
  if (!small) {
    small = document.createElement('canvas');
    small.width = W;
    small.height = H;
  }
  small.getContext('2d')!.putImageData(image, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W * SCALE, H * SCALE);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  if (g.coinsWindow !== null) {
    drawWindow(ctx, 8, 8, 64, 16);
    shadowText(ctx, `${String(g.coinsWindow).padStart(4, ' ')} COINS`, 72, 9, 'right');
  }
  if (g.message) {
    drawWindow(ctx, 24, 120, 192, 32);
    g.message.forEach((line, i) => shadowText(ctx, line, 24, 121 + 16 * i));
  }
  if (g.yesNo !== null) {
    drawWindow(ctx, 168, 72, 40, 32);
    shadowText(ctx, 'YES', 176, 73);
    shadowText(ctx, 'NO', 176, 89);
    shadowText(ctx, '▶', 168, g.yesNo ? 89 : 73);
  }
  // The palette fades (the screen's brightness, BLDY), over everything.
  if (g.darkness) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, g.darkness / 16)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

