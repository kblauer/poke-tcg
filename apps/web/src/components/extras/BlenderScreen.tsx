import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import {
  ARROW_FALL_ROTATION,
  berryInfo,
  BLENDER_OPPONENTS,
  BLENDER_PLAYERS,
  blenderFrame,
  blenderMusic,
  blenderRanking,
  newBlenderGame,
  opponentBerries,
  PLAYER_ARROW_POS,
  POKEBLOCK_NAMES,
  speedToRpm,
  type BlenderGame,
  type BlenderHit,
  type PokeblockColor,
} from '@poke-tcg/campaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMusicCue, useMusicSettings } from '../MusicPlayer';
import { BlenderSound, loadVolume, saveVolume } from './blenderSound';

/** The Pokéblock the API made from the blend (`extras.blend`), for the end of the game. */
export interface BlendResult {
  pokeblock: { color: string; flavors: number[]; feel: number; level: number };
  record: number;
  newRecord: boolean;
}

// The GBA's screen, drawn SCALE times over on the canvas so its pixels (and the names' text) stay crisp when it's scaled to fit.
const W = 240;
const H = 160;
const SCALE = 4;
const FRAME_MS = 1000 / 60;
/** The game's Random(): 0-65535. */
const random16 = () => Math.floor(Math.random() * 0x10000);

// The standard text palette's colours (graphics/interface/std_menu.pal): dark grey on a light grey shadow; the player's name red.
const DARK_GRAY = 'rgb(98,98,98)';
const LIGHT_GRAY = 'rgb(213,213,205)';
const RED = 'rgb(230,8,8)';
const LIGHT_RED = 'rgb(255,189,115)';
const FONT = '12px "Pokemon Emerald"';

/** Each player's arrow's flips (top left, top right, bottom left, bottom right: the arrow drawn pointing at the centre). */
const ARROW_FLIPS: [boolean, boolean][] = [[true, true], [false, true], [true, false], [false, false]];
/** Which way from each arrow its score symbols show (sPlayerArrowQuadrant). */
const QUADRANT: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
/** The thrown berries' start, bounce speed and speeds by arrow (sBerrySpriteData: x, y, bounce speed, x speed, y speed). */
const THROWS: [number, number, number, number, number][] = [[-10, 20, 10, 2, 1], [250, 20, 10, -2, 1], [-10, 140, 10, 2, -1], [250, 140, 10, -2, -1]];
/** The player's arrow's flash when they press (frames of arrow.png and how long each shows): flash, lit, flash, then lit. */
const FLASH: [number, number][] = [[3, 2], [2, 5], [3, 3]];
/** A particle's frames and durations (sAnim_SparkleCrossToX). */
const SPARKLE: [number, number][] = [[0, 3], [1, 4], [3, 5], [1, 4], [0, 3]];

type Stage = 'loading' | 'throw' | 'drop' | 'land' | 'countdown' | 'play' | 'slow' | 'ranking' | 'results' | 'made' | 'again' | 'failed';

interface Sprite {
  kind: 'berry' | 'score' | 'particle';
  x: number;
  y: number;
  t: number;
  // A thrown berry's motion (SpriteCB_Berry) and spin; a particle's speed; a score's symbol.
  targetY?: number;
  bounceSpeed?: number;
  yUp?: number;
  bounces?: number;
  xSpeed?: number;
  yDown?: number;
  spin?: number;
  berry?: string;
  score?: BlenderHit['score'];
  dx?: number;
  dy?: number;
  px?: number;
  py?: number;
}

interface Scene {
  stage: Stage;
  frame: number;
  game: BlenderGame;
  /** The centre's zoom as it drops in (the game's affine scale: 80 to 256, 256 being its size). */
  centerScale: number;
  showCenter: boolean;
  /** Dropping in, the centre is drawn over the frame; landed, under it (its BG's priority). */
  centerOnTop: boolean;
  /** The players' arrows lit and their names shown (once the centre lands). */
  lit: boolean;
  shakeX: number;
  shakeY: number;
  thrown: number;
  sprites: Sprite[];
  /** The player's arrow's flash: frames since they pressed, or -1. */
  flash: number;
  pressed: boolean;
  countdown: { anim: number; state: number; y: number; delay: number } | null;
  start: { state: number; y: number; delay: number } | null;
  yes: boolean;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

const IMAGES = ['outer', 'center', 'arrow', 'score', 'particles', 'countdown', 'start', 'digits', 'bar'] as const;
type Images = Record<(typeof IMAGES)[number], HTMLImageElement> & { berries: Record<string, HTMLImageElement> };

/** Text with the game's shadow (a pixel right and down). */
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, shadow: string, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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

const pad = (n: number, width: number, fill = ' ') => String(n).padStart(width, fill);
const berryLabel = (id: string) => `${(berryInfo(id)?.name ?? id).toUpperCase()} BERRY`;
const blockLabel = (color: string) => `${(POKEBLOCK_NAMES[color as PokeblockColor] ?? color).toUpperCase()} POKéBLOCK`;

/**
 * The Berry Blender's screen (BerryBlender's), as Emerald plays it (src/berry_blender.c): the berries thrown in, the
 * centre dropping in, the 3-2-1 countdown and START, then the game (campaign's `blenderFrame`, 60 frames a second): a
 * click, a tap, Space, Enter or A (the Z or A key) presses when the arrow passes the player's arrow (top left). When the
 * bar is full the blender slows to a stop, then the ranking, the results, and the Pokéblock made (`onBlend`, the API's
 * `extras.blend`, called as it stops), and "Would you like to blend another BERRY?": `onDone(true)` for another,
 * `onDone(false)` to stop. Auto play plays the Cycling theme while it spins.
 */
export function BlenderScreen({ berry, playerName, onBlend, onDone }: { berry: string; playerName: string; onBlend: (maxRpm: number) => Promise<BlendResult>; onDone: (again: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const result = useRef<BlendResult | null>(null);
  const failure = useRef<string | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const names = useMemo(() => [playerName, ...BLENDER_OPPONENTS], [playerName]);
  const berries = useMemo(() => [berry, ...opponentBerries(berry)], [berry]);
  const soundtrack = useMusicSettings()?.soundtrack ?? 'original';
  useMusicCue(stage === 'play' || stage === 'slow' ? blenderMusic(soundtrack) : null);
  const onBlendRef = useRef(onBlend);
  onBlendRef.current = onBlend;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The sounds (blenderSound.ts), made with the screen and closed with it; their volume, the slider under the screen.
  const sound = useRef<BlenderSound | null>(null);
  const [volume, setVolume] = useState(loadVolume);
  useEffect(() => {
    const s = new BlenderSound(loadVolume());
    sound.current = s;
    return () => {
      s.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => sound.current?.setVolume(volume), [volume]);
  // The volume before the speaker silenced it, for turning it back on.
  const loudBefore = useRef(0);

  // A press: A in the game. What it does depends on where the blend is.
  const press = useRef<(yes?: boolean) => void>(() => {});
  press.current = (yes) => {
    const s = scene.current;
    sound.current?.resume();
    if (!s) return;
    if (s.stage === 'play') s.pressed = true;
    else if (s.stage === 'ranking' && s.frame > 47 + 21) {
      sound.current?.play('se_select');
      go(s, 'results');
    } else if (s.stage === 'results' && s.frame > 23 && (result.current || failure.current)) {
      // The Pokéblock's fanfare as it's made (Task_PlayPokeblockFanfare).
      if (!failure.current) sound.current?.play('mus_level_up');
      go(s, failure.current ? 'failed' : 'made');
    }
    else if (s.stage === 'made') go(s, 'again');
    else if (s.stage === 'failed') onDoneRef.current(false);
    else if (s.stage === 'again') onDoneRef.current(yes ?? s.yes);
  };
  const go = (s: Scene, next: Stage) => {
    s.stage = next;
    s.frame = 0;
    setStage(next);
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
      } else if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace') && s?.stage === 'again') {
        press.current(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let images: Images | null = null;
    Promise.all([
      Promise.all(IMAGES.map((n) => loadImage(`/extras/blender/${n}.png`))),
      Promise.all(berries.map((b) => loadImage(`/extras/berry-pics/${b}.png`))),
      document.fonts?.load(FONT).catch(() => undefined),
    ])
      .then(([loaded, pics]) => {
        if (stopped) return;
        images = { ...(Object.fromEntries(IMAGES.map((n, i) => [n, loaded[i]!])) as Record<(typeof IMAGES)[number], HTMLImageElement>), berries: Object.fromEntries(berries.map((b, i) => [b, pics[i]!])) };
        scene.current = {
          stage: 'throw',
          frame: 0,
          game: { ...newBlenderGame(), speed: 0 },
          centerScale: 80,
          showCenter: false,
          centerOnTop: true,
          lit: false,
          shakeX: 0,
          shakeY: 0,
          thrown: 0,
          sprites: [],
          flash: -1,
          pressed: false,
          countdown: null,
          start: null,
          yes: true,
        };
        setStage('throw');
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
          draw(canvas.current?.getContext('2d') ?? null, scene.current!, images!);
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
  }, [berries]);

  /** One of the game's frames, the scene changed in place. */
  function step(s: Scene) {
    s.frame++;
    const game = s.game;
    switch (s.stage) {
      case 'throw':
        // Each player's berry thrown in, 61 frames apart (CB2_StartBlenderLocal's states 11 and 12).
        if ((s.frame - 1) % 61 === 0 && s.thrown < BLENDER_PLAYERS) {
          const [x, y, bounce, xSpeed, yDown] = THROWS[s.thrown]!;
          s.sprites.push({ kind: 'berry', berry: berries[s.thrown], x, y, t: 0, targetY: y, bounceSpeed: bounce, yUp: 10, bounces: 0, xSpeed, yDown, spin: s.thrown & 1 ? 1 : -1 });
          s.thrown++;
        } else if (s.frame > 61 * BLENDER_PLAYERS) {
          game.arrowPos = (0 - ARROW_FALL_ROTATION) & 0xffff;
          s.showCenter = true;
          sound.current?.play('se_fall');
          go(s, 'drop');
        }
        break;
      case 'drop':
        // The centre falls in, turning, from 80 to 256 (state 14).
        game.arrowPos = (game.arrowPos + 0x200) & 0xffff;
        s.centerScale += 4;
        if (s.centerScale > 255) {
          s.centerScale = 256;
          game.arrowPos = 0;
          s.centerOnTop = false;
          s.lit = true;
          sound.current?.play('se_truck_door');
          go(s, 'land');
        }
        break;
      case 'land':
        // The screen shakes as it lands (UpdateBlenderLandScreenShake), 20 frames.
        for (const axis of ['shakeX', 'shakeY'] as const) {
          const strength = s.frame < 10 ? 16 : 8;
          if (s[axis] === 0) s[axis] = (random16() % strength) - strength / 2;
          else s[axis] -= Math.sign(s[axis]);
        }
        if (s.frame >= 20) {
          s.shakeX = s.shakeY = 0;
          s.countdown = { anim: 0, state: 0, y: 0, delay: 0 };
          go(s, 'countdown');
        }
        break;
      case 'countdown': {
        // 3, 2, 1 drop in and out (SpriteCB_CountdownNumber), then START (SpriteCB_Start).
        const c = s.countdown;
        if (c) {
          if (c.state === 0 && (c.y += 8) > 88) {
            c.y = 88;
            c.state = 1;
            sound.current?.play('se_ball_bounce_1');
          } else if (c.state === 1 && ++c.delay > 20) {
            c.state = 2;
            c.delay = 0;
          } else if (c.state === 2 && (c.y += 4) > 176) {
            if (++c.anim === 3) {
              s.countdown = null;
              s.start = { state: 0, y: 0, delay: 0 };
            } else Object.assign(c, { state: 0, y: -16 });
          }
        } else if (s.start) {
          const st = s.start;
          if (st.state === 0 && (st.y += 8) > 92) {
            st.y = 92;
            st.state = 1;
            sound.current?.play('se_pin');
          } else if (st.state === 1 && ++st.delay > 20) st.state = 2;
          else if (st.state === 2 && (st.y += 4) > 176) {
            s.start = null;
            game.speed = 0x80;
            // The blender's whirring starts with the game (state 21), at the least speed's pitch.
            sound.current?.setPitch(0);
            sound.current?.startLoop();
            go(s, 'play');
          }
        }
        break;
      }
      case 'play': {
        const pressed = s.pressed;
        s.pressed = false;
        if (pressed) s.flash = 0;
        const hits = blenderFrame(game, pressed, random16);
        for (const hit of hits) addHit(s, hit);
        // A score's sound, and the whirring's pitch raised (or lowered) with the speed (UpdateSpeedFromHit's UpdateHitPitch).
        if (hits.length) sound.current?.setPitch(2 * (game.speed - 0x80));
        if (game.over) go(s, 'slow');
        break;
      }
      case 'slow':
        // The blender winds down (CB2_EndBlenderGame's state 2), then the Pokéblock is made.
        game.arrowPos = (game.arrowPos + game.speed) & 0xffff;
        game.speed -= 32;
        for (const axis of ['bgX', 'bgY'] as const) game[axis] -= Math.sign(game[axis]);
        sound.current?.setPitch(2 * (Math.max(0, game.speed) - 0x80));
        if (game.speed <= 0) {
          game.speed = 0;
          sound.current?.stopLoop();
          onBlendRef
            .current(game.maxRpm)
            .then((r) => (result.current = r))
            .catch((e: Error) => (failure.current = e.message));
          go(s, 'ranking');
        }
        break;
    }
    if (s.flash >= 0 && ++s.flash > 10) s.flash = -1;
    s.sprites = s.sprites.filter((sp) => moveSprite(sp));
  }

  /** A score's symbol (CreateScoreSymbolSprite) and its sparkles (CreateParticleSprites). */
  function addHit(s: Scene, hit: BlenderHit) {
    const [ax, ay] = PLAYER_ARROW_POS[hit.player]!;
    const [qx, qy] = QUADRANT[hit.player]!;
    s.sprites.push({ kind: 'score', score: hit.score, x: ax - 10 * qx, y: ay - 10 * qy, t: 0 });
    sound.current?.play(hit.score === 'best' ? 'se_ice_stairs' : hit.score === 'good' ? 'se_success' : 'se_failure');
    const count = (random16() % 2) + 1;
    for (let i = 0; i < count; i++) {
      // The sine table's angle from the arrow's position's low byte, as the game does.
      const angle = (((s.game.arrowPos + (random16() % 20)) & 0xff) / 256) * Math.PI * 2;
      s.sprites.push({ kind: 'particle', x: Math.trunc(Math.cos(angle) * 64) + 120, y: Math.trunc(Math.sin(angle) * 64) + 80, t: 0, dx: 16 - (random16() % 32), dy: 16 - (random16() % 32), px: 0, py: 0 });
    }
  }

  /** A sprite's frame: false once it's gone. */
  function moveSprite(sp: Sprite) {
    sp.t++;
    if (sp.kind === 'berry') {
      sp.x += sp.xSpeed!;
      sp.y -= sp.yUp!;
      sp.y += sp.yDown!;
      sp.targetY! += sp.yDown!;
      sp.yUp!--;
      if (sp.targetY! < sp.y) {
        sp.bounceSpeed = sp.yUp = sp.bounceSpeed! - 1;
        if (++sp.bounces! > 3) return false;
        sound.current?.play('se_ball_tray_exit');
      }
      return true;
    }
    if (sp.kind === 'particle') {
      sp.px! += sp.dx!;
      sp.py! += sp.dy!;
      return sp.t < SPARKLE.reduce((n, [, d]) => n + d, 0);
    }
    return sp.t < 20;
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={W * SCALE}
        height={H * SCALE}
        onPointerDown={(e) => {
          e.preventDefault();
          const s = scene.current;
          if (s?.stage === 'again') {
            // The YES/NO window: which line was clicked (it's at 168,72 on the screen, a line 16px).
            const r = e.currentTarget.getBoundingClientRect();
            const y = ((e.clientY - r.top) / r.height) * H;
            if (y >= 66 && y < 106) {
              press.current(y < 86);
              return;
            }
          }
          press.current();
        }}
        className="mx-auto block aspect-[3/2] w-full max-w-[960px] cursor-pointer touch-none select-none rounded-lg bg-black ring-1 ring-slate-600 [image-rendering:pixelated]"
        aria-label="The Berry Blender: click, tap or press Space as the arrow passes yours (top left)"
      />
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-400">
          {stage === 'play' ? 'Click, tap or press Space when the spinning arrow lines up with your arrow (top left).' : stage === 'again' ? 'Up and down to choose, Space or a click to answer.' : stage === 'loading' ? 'Starting up the Berry Blender…' : 'Click or press Space to go on.'}
        </p>
        {/* The sounds' volume (the music's is the music player's own), remembered in this browser; the icon silences them and back. */}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-300 transition hover:bg-slate-700 hover:text-slate-50"
            onClick={() => {
              const next = volume ? 0 : loudBefore.current || 70;
              if (volume) loudBefore.current = volume;
              setVolume(next);
              saveVolume(next);
            }}
            aria-label={volume ? 'Silence the sounds' : 'Turn the sounds back on'}
            title={volume ? 'Silence the sounds' : 'Turn the sounds back on'}
          >
            {volume ? <VolumeUpIcon sx={{ fontSize: 18 }} /> : <VolumeOffIcon sx={{ fontSize: 18 }} />}
          </button>
          <span className="sr-only">Sound volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              saveVolume(v);
              sound.current?.resume();
            }}
            className="w-32 accent-yellow-300"
            aria-label="Sound volume"
          />
          <span className="w-8 tabular-nums">{volume}%</span>
        </label>
      </div>
    </div>
  );

  /** The screen: the centre and the frame (in their order), what the game writes on the frame, the names, the sprites and the windows. */
  function draw(ctx: CanvasRenderingContext2D | null, s: Scene, img: Images) {
    if (!ctx) return;
    const game = s.game;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const bgX = s.stage === 'land' ? s.shakeX : game.bgX;
    const bgY = s.stage === 'land' ? s.shakeY : game.bgY;
    const center = () => {
      if (!s.showCenter) return;
      ctx.save();
      ctx.translate(W / 2 - bgX, H / 2 - bgY);
      ctx.rotate((-game.arrowPos / 0x10000) * Math.PI * 2);
      const zoom = 256 / s.centerScale;
      ctx.scale(zoom, zoom);
      ctx.drawImage(img.center, -W / 2, -H / 2);
      ctx.restore();
    };
    const frame = () => {
      // The frame's BG wraps round (it's 256 square) as the shake scrolls it.
      const ox = -(((bgX % 256) + 256) % 256);
      const oy = -(((bgY % 256) + 256) % 256);
      for (const dx of [0, 256]) for (const dy of [0, 256]) ctx.drawImage(img.outer, ox + dx, oy + dy);
      // The progress bar (8 tiles, each 8 steps) and the RPM (5 digits) written over it.
      const filled = Math.floor((Math.min(game.shownProgress, 1000) * 64) / 1000);
      for (let i = 0; i < 8; i++) {
        const tile = i < Math.floor(filled / 8) ? 8 : i === Math.floor(filled / 8) ? filled % 8 : 0;
        ctx.drawImage(img.bar, tile * 8, 0, 8, 16, (11 + i) * 8 - bgX, -bgY, 8, 16);
      }
      const rpm = pad(speedToRpm(Math.max(0, game.speed)) % 100000, 5, '0');
      [12, 13, 14, 16, 17].forEach((col, i) => ctx.drawImage(img.digits, Number(rpm[i]) * 8, 0, 8, 8, col * 8 - bgX, 17 * 8 - bgY, 8, 8));
    };
    if (s.centerOnTop) {
      frame();
      center();
    } else {
      center();
      frame();
    }
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    if (s.lit) {
      names.forEach((name, i) => {
        const x = (i % 2 ? 22 : 1) * 8 + 28 - bgX;
        const y = (i < 2 ? 6 : 12) * 8 + 1 - bgY;
        shadowText(ctx, name, x, y, i === 0 ? RED : DARK_GRAY, i === 0 ? LIGHT_RED : LIGHT_GRAY, 'center');
      });
    }
    // The players' arrows: off until the centre lands, the player's flashing as they press.
    for (let i = 0; i < BLENDER_PLAYERS; i++) {
      let f = s.lit ? 1 : 0;
      if (i === 0 && s.flash >= 0) {
        let t = s.flash;
        for (const [frameIndex, d] of FLASH) {
          if (t < d) {
            f = frameIndex;
            break;
          }
          t -= d;
        }
      }
      const [x, y] = PLAYER_ARROW_POS[i]!;
      const [h, v] = ARROW_FLIPS[i]!;
      ctx.save();
      ctx.translate(x - bgX, y - bgY);
      ctx.scale(h ? -1 : 1, v ? -1 : 1);
      ctx.drawImage(img.arrow, f * 32, 0, 32, 32, -16, -16, 32, 32);
      ctx.restore();
    }
    for (const sp of s.sprites) {
      if (sp.kind === 'berry') {
        const pic = img.berries[sp.berry!]!;
        ctx.save();
        ctx.translate(sp.x, sp.y);
        // The berry's spin (sSpriteAffineAnim_BerryPicRotation: 3/256 of a turn a frame) and its shrinking (1/256 a frame).
        ctx.rotate((sp.spin! * 3 * sp.t * Math.PI * 2) / 256);
        const zoom = Math.max(0.1, (256 - sp.t) / 256);
        ctx.scale(zoom, zoom);
        ctx.drawImage(pic, -24, -24);
        ctx.restore();
      } else if (sp.kind === 'score') {
        // Good (frame 0), Miss (1, flipped) rising a pixel every 3 frames; Best flashing (2 and 3) and rising faster, up to 12.
        const f = sp.score === 'best' ? [2, 3, 2, 3, 2][Math.min(4, Math.floor(sp.t / 4))]! : sp.score === 'good' ? 0 : 1;
        const rise = sp.score === 'best' ? Math.max(-12, -(sp.t * 2)) : -Math.floor(sp.t / 3);
        ctx.save();
        ctx.translate(sp.x, sp.y + rise);
        if (sp.score === 'miss') ctx.scale(-1, 1);
        ctx.drawImage(img.score, f * 16, 0, 16, 16, -8, -8, 16, 16);
        ctx.restore();
      } else {
        let t = sp.t;
        let f = 0;
        for (const [frameIndex, d] of SPARKLE) {
          if (t < d) {
            f = frameIndex;
            break;
          }
          t -= d;
        }
        ctx.drawImage(img.particles, f * 8, 0, 8, 8, sp.x + Math.trunc(sp.px! / 8) - 4, sp.y + Math.trunc(sp.py! / 8) - 4, 8, 8);
      }
    }
    if (s.countdown) {
      const number = 2 - s.countdown.anim;
      ctx.drawImage(img.countdown, number * 32, 0, 32, 32, 120 - 16, -16 + s.countdown.y - 16, 32, 32);
    }
    if (s.start) ctx.drawImage(img.start, 120 - 32, -20 + s.start.y - 16, 64, 32);

    // The windows.
    const ranking = blenderRanking(game.scores);
    if (s.stage === 'ranking' && s.frame > 47) {
      drawWindow(ctx, 40, 24, 168, 112);
      shadowText(ctx, 'RANKING', 124, 25, DARK_GRAY, LIGHT_GRAY, 'center');
      [2, 0, 1].forEach((f, i) => ctx.drawImage(img.score, f * 16, 0, 16, 16, 128 + i * 32 - 8, 52 - 8, 16, 16));
      ranking.forEach((p, i) => {
        const y = 24 + 41 + 16 * i;
        shadowText(ctx, `${i + 1}. ${names[p]}`, 40, y, DARK_GRAY, LIGHT_GRAY);
        game.scores[p]!.forEach((n, k) => shadowText(ctx, String(n), 40 + 78 + 32 * k + 18, y, DARK_GRAY, LIGHT_GRAY, 'right'));
      });
    } else if (s.stage === 'results' && s.frame > 2) {
      drawWindow(ctx, 40, 24, 168, 112);
      shadowText(ctx, 'RESULTS OF BLENDING', 124, 25, DARK_GRAY, LIGHT_GRAY, 'center');
      ranking.forEach((p, i) => {
        const y = 24 + 17 + 16 * i;
        shadowText(ctx, `${i + 1}. ${names[p]}`, 48, y, DARK_GRAY, LIGHT_GRAY);
        shadowText(ctx, berryLabel(berries[p]!), 40 + 84, y, DARK_GRAY, LIGHT_GRAY);
      });
      shadowText(ctx, 'MAXIMUM SPEED', 40, 24 + 81, DARK_GRAY, LIGHT_GRAY);
      shadowText(ctx, `${pad(Math.floor(game.maxRpm / 100), 3)}.${pad(game.maxRpm % 100, 2, '0')} RPM`, 208, 24 + 81, DARK_GRAY, LIGHT_GRAY, 'right');
      shadowText(ctx, 'Time:', 40, 24 + 97, DARK_GRAY, LIGHT_GRAY);
      const seconds = Math.floor(game.frames / 60);
      shadowText(ctx, `${pad(Math.floor(seconds / 60), 2, '0')} min. ${pad(seconds % 60, 2, '0')} sec.`, 208, 24 + 97, DARK_GRAY, LIGHT_GRAY, 'right');
    }
    const message = (lines: string[]) => {
      drawWindow(ctx, 16, 120, 216, 32);
      lines.forEach((line, i) => shadowText(ctx, line, 16, 121 + 16 * i, DARK_GRAY, LIGHT_GRAY));
    };
    const made = result.current;
    if ((s.stage === 'made' || s.stage === 'again') && made) {
      if (s.stage === 'made') message([`${blockLabel(made.pokeblock.color)} was made!`, `The level is ${made.pokeblock.level}, and the feel is ${made.pokeblock.feel}.`]);
      else {
        message(['Would you like to blend another BERRY?']);
        drawWindow(ctx, 176, 72, 32, 32);
        shadowText(ctx, 'YES', 186, 73, DARK_GRAY, LIGHT_GRAY);
        shadowText(ctx, 'NO', 186, 89, DARK_GRAY, LIGHT_GRAY);
        shadowText(ctx, '▶', 177, s.yes ? 73 : 89, DARK_GRAY, LIGHT_GRAY);
      }
    } else if (s.stage === 'failed') message(['The BERRY BLENDER stopped:', (failure.current ?? '').slice(0, 36)]);
    else if (s.stage === 'results' && s.frame > 2 && !made && !failure.current && s.frame > 120) message(['Please wait a while.']);
  }
}
