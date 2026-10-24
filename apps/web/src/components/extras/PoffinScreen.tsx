import { batterScale, berryInfo, cookFrame, cookTime, newCookGame, poffinName, poffinMusic, POT_CENTER, SLOW_SPEED, type CookEvents, type CookGame } from '@poke-tcg/campaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMusicCue } from '../MusicPlayer';
import { loadVolume } from './minigameSound';
import { MinigameVolume } from './MinigameVolume';
import { BURN_SOUNDS, LAP_SOUNDS, PoffinSound, SPILL_SOUNDS } from './poffinSound';

/** The Poffin the API made from the cooking (`extras.cook`), for the results. */
export interface CookResult {
  poffin: { type: number; flavors: number[]; smoothness: number; level: number };
}

// The DS's two screens, one above the other with the hinge between, drawn SCALE times over so pixels and text stay crisp.
const W = 256;
const SCREEN_H = 192;
const HINGE = 8;
const BOTTOM = SCREEN_H + HINGE;
const H = SCREEN_H * 2 + HINGE;
const SCALE = 3;
const FRAME_MS = 1000 / 30;
const random32 = () => Math.floor(Math.random() * 2 ** 32);

const DARK_GRAY = 'rgb(98,98,98)';
const LIGHT_GRAY = 'rgb(213,213,205)';
const FONT = '12px "Pokemon Emerald"';

// The game's messages (res/text/poffin_making.json).
const WARNINGS = ['It’ll burn! Stir it!', 'Too fast! Overflow!', 'It’ll burn! Hurry!', 'Slow down a little!', 'Quick! Quick!'];
/** Which warning a spill and a burn show, by phase (ov83_0223C600: messages 3 + these). */
const SPILL_WARNING = [1, 3, 0];
const BURN_WARNING = [0, 2, 4];
/** How long a warning shows (a SysTask of 30 frames). */
const WARNING_FRAMES = 30;

/** Which of the pot scene's pictures show in each phase (ov83_0223C480): the batters, the flames, and the batter fading into the next. */
const PHASE_LAYERS = [
  { batters: [0, 1], flames: 0, fading: 0 },
  { batters: [1, 2], flames: 1, fading: 1 },
  { batters: [2], flames: 2, fading: -1 },
];
/** The flames' flicker by phase (ov83_0223E51C): from this scale back to 1 over this many frames, over and over. */
const FLICKER_FROM = [0.98, 0.95, 0.92];
const FLICKER_FRAMES = [4, 3, 2];

/** A puff's kind of event, its phase's row (Unk_ov83_022404B0): end scale (min, random range), speed, start radius (min, random), distance (min, random), frames, sprite, animation, whether it stays (a scorch mark) and scales. */
interface PuffRow {
  s0: number;
  s1: number;
  v: number;
  r0: number;
  r0Rnd: number;
  dr: number;
  drRnd: number;
  frames: number;
  res: 'puff0' | 'puff1' | 'puff2';
  anim: number;
  persist: boolean;
  affine: boolean;
}
const smoke = (res: PuffRow['res'], anim: number): PuffRow => ({ s0: 0.5, s1: 1.5, v: 0, r0: 32, r0Rnd: 64, dr: 0, drRnd: 0, frames: 32, res, anim, persist: false, affine: false });
const scorch = (res: PuffRow['res']): PuffRow => ({ s0: 0.5, s1: 1.0, v: 0, r0: 0, r0Rnd: 8, dr: 0, drRnd: 24, frames: 16, res, anim: 2, persist: true, affine: true });
const drops = (res: PuffRow['res'], v: number): PuffRow => ({ s0: 0.5, s1: 1.5, v, r0: 32, r0Rnd: 64, dr: 32, drRnd: 64, frames: 16, res, anim: 0, persist: false, affine: false });
/** By phase × 3 + kind (0 the burn's warning, 1 a burn, 2 a spill); none for a spill in the last phase. */
const PUFFS: PuffRow[] = [smoke('puff0', 1), scorch('puff0'), drops('puff0', 2), smoke('puff1', 1), scorch('puff1'), drops('puff1', 4), smoke('puff2', 0), smoke('puff2', 1)];
const MAX_PUFFS = 8;

interface Puff {
  row: PuffRow;
  t: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  v0: { x: number; y: number };
  endScale: number;
  x: number;
  y: number;
  scale: number;
  /** A scorch mark riding on the batter: its angle round the pot's centre, its distance out. */
  ride?: { angle: number; r: number };
  shrink?: { from: number; t: number };
}

type Stage = 'loading' | 'fadeIn' | 'drop' | 'splash' | 'wait' | 'pen' | 'count' | 'cook' | 'done' | 'fadeOut' | 'results' | 'putAway' | 'again' | 'failed';

interface Scene {
  stage: Stage;
  frame: number;
  game: CookGame;
  batterAngle: number;
  simAngle: number;
  flicker: { from: number; t: number; n: number };
  /** The arrows: an announcement of a new way (blinks 3 times), and a reminder while stirring the wrong way (blinks on). */
  announce: { way: 0 | 1; t: number } | null;
  reminder: { way: 0 | 1; t: number } | null;
  warning: { text: string; t: number; kind: 'spill' | 'burn' } | null;
  puffs: Puff[];
  topMessage: string | null;
  berry: { x: number; y: number } | null;
  splash: { t: number } | null;
  done: { t: number } | null;
  countFrame: number;
  yes: boolean;
}

interface SpriteMeta {
  cells: ({ ox: number; oy: number; w: number; h: number; x: number } | null)[];
  anims: [cell: number, frames: number][][];
}
type Sheets = Record<'interface' | 'done' | 'puff0' | 'puff1' | 'puff2', SpriteMeta>;
const PICTURES = ['tablecloth', 'pot', 'batter0', 'batter1', 'batter2', 'flames0', 'flames1', 'flames2', 'top_screen', 'textbox', 'interface', 'done', 'puff0', 'puff1', 'puff2', 'arrow_r', 'arrow_l', 'poffins'] as const;
type Images = Record<(typeof PICTURES)[number], HTMLImageElement> & { berry: HTMLImageElement };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

/** An animation's cell `t` frames in (it holds its last cell when it ends; a 0-frame step ends it), and whether it's over. */
function animCell(anim: [number, number][], t: number) {
  let left = t;
  for (const [cell, frames] of anim) {
    if (frames <= 0) return { cell, over: true };
    if (left < frames) return { cell, over: false };
    left -= frames;
  }
  return { cell: anim.at(-1)![0], over: true };
}
const animLength = (anim: [number, number][]) => anim.reduce((n, [, f]) => n + Math.max(0, f), 0);

/** The DS's sine and cosine of an angle (65536 a turn). */
const sinIdx = (a: number) => Math.sin(((a & 0xffff) / 0x10000) * Math.PI * 2);
const cosIdx = (a: number) => Math.cos(((a & 0xffff) / 0x10000) * Math.PI * 2);
/** The game's ease (ov83_0223DA34): from `start` at `v0` a frame to `end` in `n` frames, its acceleration fixed. */
const ease = (start: number, end: number, v0: number, n: number, t: number) => {
  const a = (2 * (end - start - v0 * n)) / (n * n);
  return start + v0 * t + (a * t * t) / 2;
};

function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = LIGHT_GRAY;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = DARK_GRAY;
  ctx.fillText(text, x, y);
}

/** A window: the standard frame round its box (in screen pixels). */
function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgb(98,98,98)';
  ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  ctx.fillStyle = 'rgb(246,197,123)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
}

const berryLabel = (id: string) => `${berryInfo(id)?.name ?? id} Berry`;
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Poffin cooking's screen (PoffinCooking's), as Platinum plays it alone at the Poffin House (src/overlay083): the DS's
 * two screens, the berry dropping into the pot, the stylus hint and the 1, 2, 3, START countdown, then the cooking
 * (campaign's `cookFrame`, 30 frames a second): drag round the pot (the bottom screen) the way the arrow says, the
 * batter turning, cooking through 3 phases, spilling if stirred flat out and burning if too slow; then DONE!, the
 * results (time, spills, burns, the Poffin: `onCook`, the API's `extras.cook`), and "Would you like to keep cooking
 * Poffins?" (`onDone`). Auto play plays Platinum's Poffins theme.
 */
export function PoffinScreen({ berry, playerName, onCook, onDone }: { berry: string; playerName: string; onCook: (cooked: { frames: number; spills: number; burns: number }) => Promise<CookResult>; onDone: (again: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const result = useRef<CookResult | null>(null);
  const failure = useRef<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  useMusicCue(stage === 'loading' || stage === 'failed' || stage === 'again' ? null : poffinMusic());
  const onCookRef = useRef(onCook);
  onCookRef.current = onCook;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const sheets = useRef<Sheets | null>(null);
  const sound = useRef<PoffinSound | null>(null);
  const [volume, setVolume] = useState(loadVolume);
  useEffect(() => {
    const s = new PoffinSound(loadVolume());
    sound.current = s;
    return () => {
      s.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => sound.current?.setVolume(volume), [volume]);
  const name = useMemo(() => berryLabel(berry), [berry]);

  const go = (s: Scene, next: Stage) => {
    s.stage = next;
    s.frame = 0;
    setStage(next);
  };

  // A tap or A: on through the results and the questions.
  const press = useRef<(yes?: boolean) => void>(() => {});
  press.current = (yes) => {
    const s = scene.current;
    sound.current?.resume();
    if (!s) return;
    if (s.stage === 'results' && s.frame > 62 && result.current) go(s, 'putAway');
    else if (s.stage === 'putAway') go(s, 'again');
    else if (s.stage === 'again') onDoneRef.current(yes ?? s.yes);
    else if (s.stage === 'failed') onDoneRef.current(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const s = scene.current;
      if (s?.stage === 'again' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        s.yes = !s.yes;
        e.preventDefault();
      } else if ([' ', 'Enter', 'a', 'A', 'z', 'Z'].includes(e.key)) {
        e.preventDefault();
        press.current();
      } else if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace') && s?.stage === 'again') press.current(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    Promise.all([
      Promise.all(PICTURES.map((n) => loadImage(`/extras/poffin/${n}.png`))),
      loadImage(`/extras/poffin/berries/${berry}.png`),
      fetch('/extras/poffin/sprites.json').then((r) => r.json() as Promise<Sheets>),
      document.fonts?.load(FONT).catch(() => undefined),
    ])
      .then(([loaded, berryPic, meta]) => {
        if (stopped) return;
        sheets.current = meta;
        const images = { ...(Object.fromEntries(PICTURES.map((n, i) => [n, loaded[i]!])) as Record<(typeof PICTURES)[number], HTMLImageElement>), berry: berryPic };
        scene.current = {
          stage: 'fadeIn',
          frame: 0,
          game: newCookGame(random32),
          batterAngle: 0,
          simAngle: 0,
          flicker: { from: 1, t: 0, n: 4 },
          announce: null,
          reminder: null,
          warning: null,
          puffs: [],
          topMessage: null,
          berry: null,
          splash: null,
          done: null,
          countFrame: -1,
          yes: true,
        };
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
        failure.current = e.message;
        setStage('failed');
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [berry]);

  /** One of the game's frames (30 a second), the scene changed in place. */
  function step(s: Scene) {
    s.frame++;
    const meta = sheets.current!;
    switch (s.stage) {
      case 'fadeIn':
        if (s.frame >= 6) go(s, 'drop');
        break;
      case 'drop': {
        // The berry goes in (ov83_0223DB4C …): 10 frames' wait, then 33 frames from (64,−32) to (96,88), speeding up.
        const t = s.frame - 10;
        if (t < 0) break;
        if (t === 0) s.topMessage = `The ${name} went in!`;
        if (t <= 32) s.berry = { x: ease(64, 96, 0, 32, t), y: ease(-32, 88, 0, 32, t) };
        if (t === 32) {
          s.berry = null;
          s.splash = { t: 0 };
          sound.current?.play('nm09');
          go(s, 'splash');
        }
        break;
      }
      case 'splash':
        s.splash!.t++;
        if (s.splash!.t >= animLength(meta.interface.anims[1]!)) {
          s.splash = null;
          s.topMessage = null;
          go(s, 'wait');
        }
        break;
      case 'wait':
        if (s.frame >= 24) go(s, 'pen');
        break;
      case 'pen':
        if (s.frame >= animLength(meta.interface.anims[2]!)) go(s, 'count');
        break;
      case 'count': {
        // The countdown's sounds as its numbers (NM10) and START (NM10_2) show (ov83_0223B9EC).
        const anim = meta.interface.anims[0]!;
        let left = s.frame;
        let f = 0;
        while (f < anim.length - 1 && left >= anim[f]![1]) {
          left -= anim[f]![1];
          f++;
        }
        if (Math.trunc((f + 1) / 3) !== Math.trunc((s.countFrame + 1) / 3) && s.countFrame >= 0) sound.current?.play(f < 10 ? 'nm10' : 'nm10_2');
        s.countFrame = f;
        if (s.frame >= animLength(anim)) {
          s.flicker = { from: 1, t: 0, n: 4 };
          go(s, 'cook');
        }
        break;
      }
      case 'cook':
        cook(s, cookFrame(s.game, touch.current, random32));
        if (s.game.over) {
          // DONE! (ov83_0223BCEC): the arrows and flames go, the sounds stop, and the Poffin is made.
          sound.current?.stopAll();
          sound.current?.play('nm13');
          s.announce = s.reminder = s.warning = null;
          s.done = { t: 0 };
          onCookRef
            .current({ frames: s.game.frames, spills: s.game.spills, burns: s.game.burns })
            .then((r) => (result.current = r))
            .catch((e: Error) => (failure.current = e.message));
          go(s, 'done');
        }
        break;
      case 'done':
        s.done!.t++;
        if (s.done!.t >= animLength(meta.done.anims[0]!)) go(s, 'fadeOut');
        break;
      case 'fadeOut':
        if (s.frame >= 6) go(s, failure.current ? 'failed' : 'results');
        break;
      case 'results':
        if (failure.current) go(s, 'failed');
        // The results' lines, then the Poffin, a second apart (each with NM14), and on after 20 seconds.
        if (s.frame === 31 || (s.frame === 62 && result.current)) sound.current?.play('nm14');
        if (s.frame === 62 && !result.current) s.frame--;
        if (s.frame > 62 + 600) go(s, 'putAway');
        break;
      case 'putAway':
        if (s.frame > 150) go(s, 'again');
        break;
    }
    // The puffs and scorch marks move on whatever the stage.
    s.puffs = s.puffs.filter((p) => movePuff(s, p, meta));
  }

  /** A cooking frame's pictures and sounds (ov83_0223C3E8 and what it calls). */
  function cook(s: Scene, events: CookEvents) {
    const game = s.game;
    const phase = Math.min(game.phase, 2);
    // The batter turns by its speed (and the flames flicker).
    s.batterAngle += game.speed;
    const angle = game.angle & 0xffff;
    if ((game.speed >= 0 && s.simAngle > angle) || (game.speed < 0 && s.simAngle < angle)) sound.current?.play(LAP_SOUNDS[phase]!);
    s.simAngle = angle;
    if (++s.flicker.t > s.flicker.n) s.flicker = { from: FLICKER_FROM[phase]!, t: 0, n: FLICKER_FRAMES[phase]! };
    // The arrows: a new way announced (3 blinks), else a reminder while it goes the wrong way.
    if (events.newDirection) {
      s.announce = { way: game.direction, t: 0 };
      s.reminder = null;
      sound.current?.play('nm12_2');
    }
    if (s.announce && ++s.announce.t >= 17 * 3) s.announce = null;
    const going = game.speed < 0 ? 1 : 0;
    if (going === game.direction || game.speed === 0 || s.announce) s.reminder = null;
    else if (!s.reminder || s.reminder.way !== game.direction) {
      s.reminder = { way: game.direction, t: 0 };
      sound.current?.play('nm12_2');
    } else s.reminder.t++;
    // Warnings (none while an arrow shows): a spill's or a burn's, for 30 frames, not again until it's gone.
    if (s.warning && ++s.warning.t >= WARNING_FRAMES) s.warning = null;
    if (s.reminder || s.announce) s.warning = null;
    else {
      if (events.spill && s.warning?.kind !== 'spill') s.warning = { text: WARNINGS[SPILL_WARNING[phase]!]!, t: 0, kind: 'spill' };
      if (events.burn && s.warning?.kind !== 'burn') s.warning = { text: WARNINGS[BURN_WARNING[phase]!]!, t: 0, kind: 'burn' };
    }
    // Puffs and their sounds (ov83_0223C6D4); scorch marks shrink away once it's going fast enough again.
    if (events.spill) {
      addPuff(s, phase * 3 + 2);
      sound.current?.play(SPILL_SOUNDS[phase]!);
    }
    if (events.burn === 'burn') {
      addPuff(s, phase * 3 + 1);
      sound.current?.play(BURN_SOUNDS[phase]!);
    } else if (events.burn === 'warning') addPuff(s, phase * 3);
    if (Math.abs(game.speed) > SLOW_SPEED) for (const p of s.puffs) if (p.ride && !p.shrink) p.shrink = { from: p.scale, t: 0 };
  }

  /** A puff (ov83_0223EDDC): from a random angle round the pot, out from its centre. */
  function addPuff(s: Scene, index: number) {
    const row = PUFFS[index];
    if (!row) return;
    if (s.puffs.length >= MAX_PUFFS) s.puffs.shift();
    const angle = random32() & 0xffff;
    const r0 = row.r0 + (random32() % row.r0Rnd);
    const r1 = r0 + row.dr + (row.drRnd ? random32() % row.drRnd : 0);
    const sin = sinIdx(angle);
    const cos = cosIdx(angle);
    const start = { x: POT_CENTER.x + sin * r0, y: POT_CENTER.y + cos * r0 };
    s.puffs.push({
      row,
      t: 0,
      start,
      end: { x: POT_CENTER.x + sin * r1, y: POT_CENTER.y + cos * r1 },
      v0: { x: sin * row.v, y: cos * row.v },
      endScale: row.s0 + (random32() % Math.round(row.s1 * 4096)) / 4096,
      x: start.x,
      y: start.y,
      scale: row.affine ? 0.1 : 1,
    });
  }

  /** A puff's frame: false once it's gone. */
  function movePuff(s: Scene, p: Puff, meta: Sheets) {
    const anim = meta[p.row.res].anims[p.row.anim]!;
    if (p.shrink) {
      p.shrink.t++;
      p.scale = p.shrink.from + (0.05 - p.shrink.from) * Math.min(1, p.shrink.t / 8);
      if (p.shrink.t >= 8) return false;
    }
    if (p.ride) {
      // Riding on the batter: round the pot's centre as it turns.
      p.ride.angle += s.stage === 'cook' ? s.game.speed : 0;
      p.x = POT_CENTER.x + Math.cos((p.ride.angle / 0x10000) * Math.PI * 2) * p.ride.r;
      p.y = POT_CENTER.y + Math.sin((p.ride.angle / 0x10000) * Math.PI * 2) * p.ride.r;
      return true;
    }
    p.t++;
    const n = p.row.frames;
    const t = Math.min(p.t, n);
    p.x = ease(p.start.x, p.end.x, p.v0.x, n, t);
    p.y = ease(p.start.y, p.end.y, p.v0.y, n, t);
    if (p.row.affine) p.scale = ease(0.1, p.endScale, 0, n, t);
    const animOver = p.t >= animLength(anim);
    if (p.t >= n && animOver) {
      if (!p.row.persist) return false;
      const dx = p.x - POT_CENTER.x;
      const dy = p.y - POT_CENTER.y;
      p.ride = { angle: (Math.atan2(dy, dx) / (Math.PI * 2)) * 0x10000, r: Math.hypot(dx, dy) };
    }
    return true;
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
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const y = ((e.clientY - r.top) / r.height) * H - BOTTOM;
          const s = scene.current;
          if (s?.stage === 'again' && y >= 0) {
            // The YES/NO menu (192,64 on the bottom screen, a line 16px).
            if (x >= 184 && y >= 60 && y < 100) return press.current(y < 80);
          }
          if (y >= 0) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touch.current = { x: Math.max(0, Math.min(W - 1, x)), y: Math.max(0, Math.min(SCREEN_H - 1, y)) };
          }
          press.current();
        }}
        onPointerMove={(e) => {
          if (!touch.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const y = ((e.clientY - r.top) / r.height) * H - BOTTOM;
          touch.current = { x: Math.max(0, Math.min(W - 1, x)), y: Math.max(0, Math.min(SCREEN_H - 1, y)) };
        }}
        onPointerUp={() => (touch.current = null)}
        onPointerCancel={() => (touch.current = null)}
        className="mx-auto block w-full max-w-[512px] cursor-pointer touch-none select-none rounded-lg bg-black ring-1 ring-slate-600 [image-rendering:pixelated]"
        style={{ aspectRatio: `${W} / ${H}` }}
        aria-label="Poffin cooking: drag round the pot on the bottom screen the way the arrow points"
      />
      <div className="mx-auto flex max-w-[512px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-400">
          {stage === 'cook' ? 'Drag round the pot (the bottom screen) the way the arrow points: fast enough not to burn it, not so fast it spills.' : stage === 'again' ? 'Tap YES or NO, or up and down and Space.' : stage === 'loading' ? 'Heating the pot…' : 'Tap or press Space to go on.'}
        </p>
        <MinigameVolume volume={volume} onChange={setVolume} onTouch={() => sound.current?.resume()} />
      </div>
    </div>
  );

  /** Both screens: the top's picture and message; the bottom's pot scene, sprites, warning and windows. */
  function draw(ctx: CanvasRenderingContext2D | null, s: Scene, img: Images) {
    if (!ctx) return;
    const meta = sheets.current!;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    // The top screen.
    ctx.drawImage(img.top_screen, 0, 0);
    if (s.topMessage) {
      drawWindow(ctx, 32, 152, 184, 32);
      shadowText(ctx, s.topMessage, 34, 154);
    }
    ctx.fillStyle = 'rgb(30,30,36)';
    ctx.fillRect(0, SCREEN_H, W, HINGE);
    // The bottom screen.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, BOTTOM, W, SCREEN_H);
    ctx.clip();
    ctx.translate(0, BOTTOM);
    const resultsShowing = s.stage === 'results' || s.stage === 'putAway' || s.stage === 'again' || s.stage === 'failed';
    if (!resultsShowing) drawPot(ctx, s, img);
    // Sprites: scorch marks, then puffs (behind the warning's box), the warning, then the arrows and the interface's.
    for (const p of [...s.puffs].sort((a, b) => Number(b.row.persist) - Number(a.row.persist))) drawSprite(ctx, img[p.row.res], meta[p.row.res], animCell(meta[p.row.res].anims[p.row.anim]!, p.t).cell, p.x, p.y, p.scale);
    if (s.warning && s.stage === 'cook') {
      ctx.drawImage(img.textbox, 0, 0);
      shadowText(ctx, s.warning.text, 128, 90, 'center');
    }
    const arrow = s.announce ?? s.reminder;
    // The arrow (its origin at 48,56: the 'l' one is the 'r' one mirrored round its middle), blinking 8 frames on, 9 off.
    if (arrow && arrow.t % 17 < 8) ctx.drawImage(img[arrow.way === 0 ? 'arrow_r' : 'arrow_l'], POT_CENTER.x - 48, POT_CENTER.y - 56);
    if (s.berry) ctx.drawImage(img.berry, Math.round(s.berry.x) - 32, Math.round(s.berry.y) - 32);
    if (s.splash) drawSprite(ctx, img.interface, meta.interface, animCell(meta.interface.anims[1]!, s.splash.t).cell, 96, 88, 1);
    if (s.stage === 'pen') drawSprite(ctx, img.interface, meta.interface, animCell(meta.interface.anims[2]!, s.frame).cell, 168, 60, 1);
    if (s.stage === 'count') drawSprite(ctx, img.interface, meta.interface, animCell(meta.interface.anims[0]!, s.frame).cell, 128, 96, 1);
    if (s.done) drawSprite(ctx, img.done, meta.done, animCell(meta.done.anims[0]!, s.done.t).cell, 128, 96, 1);
    if (resultsShowing) drawResults(ctx, s, img);
    // Fades: in from white at the start; to black after DONE!, and in again on the results.
    const fade = s.stage === 'fadeIn' ? { color: '255,255,255', a: 1 - s.frame / 6 } : s.stage === 'fadeOut' ? { color: '0,0,0', a: s.frame / 6 } : s.stage === 'results' && s.frame < 6 ? { color: '0,0,0', a: 1 - s.frame / 6 } : null;
    if (fade) {
      ctx.fillStyle = `rgba(${fade.color},${Math.max(0, Math.min(1, fade.a))})`;
      ctx.fillRect(0, 0, W, SCREEN_H);
    }
    ctx.restore();
    if (s.stage === 'fadeIn') {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - s.frame / 6)})`;
      ctx.fillRect(0, 0, W, SCREEN_H);
    }
  }

  /** The pot scene (the 3D layer's quads, back to front): the tablecloth, the flames, the batters, the pot, each round (128,96). */
  function drawPot(ctx: CanvasRenderingContext2D, s: Scene, img: Images) {
    const game = s.game;
    const cooking = s.stage === 'cook';
    const layers = PHASE_LAYERS[Math.min(game.phase, 2)]!;
    const about = (draw: () => void, rotate: number, scale: number) => {
      ctx.save();
      ctx.translate(POT_CENTER.x, POT_CENTER.y);
      ctx.rotate(rotate);
      ctx.scale(scale, scale);
      ctx.translate(-POT_CENTER.x, -POT_CENTER.y);
      draw();
      ctx.restore();
    };
    ctx.drawImage(img.tablecloth, 0, 0);
    if (cooking) {
      const flicker = s.flicker.from + (1 - s.flicker.from) * (s.flicker.t / s.flicker.n);
      about(() => ctx.drawImage(img[`flames${layers.flames}` as 'flames0'], 0, 0), 0, flicker);
    }
    const batters = cooking || s.stage === 'done' ? layers.batters : [0, 1];
    const rotate = (s.batterAngle / 0x10000) * Math.PI * 2;
    const scale = cooking ? batterScale(game.speed) : 1;
    for (const b of [...batters].sort((a, c) => c - a)) {
      const fading = cooking && b === layers.fading;
      if (fading && game.fade <= 0) continue;
      ctx.globalAlpha = fading ? game.fade / 31 : 1;
      about(() => ctx.drawImage(img[`batter${b}` as 'batter0'], 64, 32), rotate, scale);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img.pot, 0, 0);
  }

  /** A sprite's cell (its origin at x, y), scaled about its origin. */
  function drawSprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement, meta: SpriteMeta, cellIndex: number, x: number, y: number, scale: number) {
    const cell = meta.cells[cellIndex];
    if (!cell) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.drawImage(image, cell.x, 0, cell.w, cell.h, -cell.ox, -cell.oy, cell.w, cell.h);
    ctx.restore();
  }

  /** The results (ov83_0223BF74): the time, spills and burns, then the Poffin; putting it away; keep cooking? */
  function drawResults(ctx: CanvasRenderingContext2D, s: Scene, img: Images) {
    const game = s.game;
    const made = result.current;
    if (s.stage === 'failed') {
      drawWindow(ctx, 16, 16, 216, 40);
      shadowText(ctx, 'The cooking stopped:', 18, 18);
      shadowText(ctx, (failure.current ?? '').slice(0, 34), 18, 34);
      return;
    }
    if (s.stage === 'results') {
      drawWindow(ctx, 16, 8, 224, 120);
      shadowText(ctx, 'RESULTS', 128, 8, 'center');
      if (s.frame > 31) {
        const t = cookTime(game.frames);
        const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
        shadowText(ctx, 'Time', 16, 32);
        shadowText(ctx, `${pad2(t.minutes)}:${pad2(t.seconds)}:${pad2(t.hundredths)}`, 176, 32);
        shadowText(ctx, 'Overflowed', 16, 56);
        shadowText(ctx, times(game.spills), 176, 56);
        shadowText(ctx, 'Burned', 16, 76);
        shadowText(ctx, times(game.burns), 176, 76);
      }
      drawWindow(ctx, 16, 144, 224, 40);
      shadowText(ctx, 'Poffins made:', 16, 144);
      if (s.frame > 62 && made) {
        shadowText(ctx, `${poffinName(made.poffin)} Lv. ${made.poffin.level} x 1`, 32, 168);
        // The Poffin's sprite at (128,144) (ov83_0223F730).
        ctx.drawImage(img.poffins, made.poffin.type * 64, 0, 64, 64, 128 - 32, 144 - 32, 64, 64);
      }
      return;
    }
    const poffin = made ? poffinName(made.poffin) : 'Poffin';
    if (s.stage === 'putAway') {
      drawWindow(ctx, 16, 16, 216, 40);
      shadowText(ctx, `${playerName} put away the`, 18, 18);
      shadowText(ctx, `${poffin}(s) in the case.`, 18, 34);
      return;
    }
    drawWindow(ctx, 16, 16, 216, 40);
    shadowText(ctx, 'Would you like to keep cooking', 18, 18);
    shadowText(ctx, 'Poffins?', 18, 34);
    drawWindow(ctx, 192, 64, 48, 32);
    shadowText(ctx, 'YES', 204, 64);
    shadowText(ctx, 'NO', 204, 80);
    shadowText(ctx, '▶', 194, s.yes ? 64 : 80);
  }
}
