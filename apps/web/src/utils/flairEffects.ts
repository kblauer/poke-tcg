// Card flair's effects (campaign's EFFECTS): how each looks, and the particles each moment sends out. A small 2D
// particle system drawn on a canvas around the card (FlairEffect): every effect is one look (colours, particle shape,
// drift, glow) played with the moment's choreography. Units are fractions of the card's width, seconds for time.
import type { EffectMoment } from '@poke-tcg/campaign';

export type Shape = 'dot' | 'spark' | 'leaf' | 'drop' | 'bubble' | 'shard' | 'star' | 'confetti' | 'feather' | 'ring';

export interface Look {
  colors: string[];
  shape: Shape;
  /** Drawn adding light (embers, sparks) rather than painted over. */
  glow: boolean;
  /** Pull per second² (+ down, − up), card widths. */
  gravity: number;
  /** Share of speed lost per second. */
  drag: number;
  /** Starting speed, card widths per second. */
  speed: number;
  /** Particle size, card widths. */
  size: [number, number];
  /** Particle life, seconds. */
  life: [number, number];
  /** Turns per second, at most. */
  spin: number;
  /** Side to side drift, card widths. */
  wobble: number;
  /** Particles, for a play burst (the other moments scale it). */
  count: number;
}

const look = (l: Partial<Look> & Pick<Look, 'colors' | 'shape'>): Look => ({ glow: false, gravity: 0, drag: 1.5, speed: 1.2, size: [0.02, 0.04], life: [0.5, 0.9], spin: 0, wobble: 0, count: 36, ...l });

/** Each effect's look, by its key (campaign's EFFECTS: one a family, and the generic ones). */
export const LOOKS: Record<string, Look> = {
  embers: look({ colors: ['#ffd25a', '#ff8a1e', '#ff4a12', '#ffe9a8'], shape: 'dot', glow: true, gravity: -0.9, drag: 1.2, size: [0.012, 0.03], wobble: 0.04 }),
  splash: look({ colors: ['#4fc3ff', '#1e88ff', '#bfe9ff', '#ffffff'], shape: 'drop', gravity: 2.2, drag: 0.8, speed: 1.6, size: [0.018, 0.035] }),
  leaves: look({ colors: ['#5fd068', '#2e9e45', '#a8e66a', '#1f7a3a'], shape: 'leaf', gravity: 0.25, drag: 2, speed: 1, size: [0.03, 0.05], life: [0.8, 1.2], spin: 1.5, wobble: 0.08, count: 22 }),
  sparks: look({ colors: ['#fff36b', '#ffe000', '#ffffff', '#ffd000'], shape: 'spark', glow: true, drag: 4, speed: 2.6, size: [0.015, 0.03], life: [0.25, 0.5], count: 44 }),
  psywave: look({ colors: ['#ff7ad9', '#c86bff', '#f0b6ff'], shape: 'ring', glow: true, drag: 2.5, speed: 0.6, size: [0.03, 0.08], life: [0.6, 1], wobble: 0.05, count: 14 }),
  impact: look({ colors: ['#ffffff', '#ffb35c', '#e0702a'], shape: 'shard', glow: true, drag: 5, speed: 3, size: [0.02, 0.045], life: [0.25, 0.45], spin: 2, count: 30 }),
  rockfall: look({ colors: ['#8a6a4a', '#b08a5e', '#6e5640', '#c9b28a'], shape: 'shard', gravity: 3, drag: 0.6, speed: 1.4, size: [0.025, 0.05], life: [0.6, 0.9], spin: 1.5, count: 26 }),
  frost: look({ colors: ['#e8f7ff', '#bfe6ff', '#ffffff', '#9fd4ff'], shape: 'star', glow: true, gravity: 0.25, drag: 2, speed: 0.9, size: [0.02, 0.04], life: [0.8, 1.2], spin: 0.8, wobble: 0.04, count: 26 }),
  feathers: look({ colors: ['#ffffff', '#e4ecf5', '#c9d8e8'], shape: 'feather', gravity: 0.35, drag: 2.5, speed: 1.1, size: [0.035, 0.06], life: [0.9, 1.3], spin: 1, wobble: 0.1, count: 16 }),
  toxic: look({ colors: ['#b45cff', '#8a2be2', '#7cff6b', '#d9a6ff'], shape: 'bubble', gravity: -0.6, drag: 1.5, speed: 0.8, size: [0.02, 0.045], life: [0.7, 1.1], wobble: 0.05, count: 26 }),
  fireflies: look({ colors: ['#e9ff6b', '#c8ff3c', '#fff8a8'], shape: 'dot', glow: true, gravity: -0.15, drag: 2, speed: 0.7, size: [0.012, 0.022], life: [0.9, 1.4], wobble: 0.12, count: 20 }),
  wisps: look({ colors: ['#9b7dff', '#6b4dd6', '#d0c2ff'], shape: 'dot', glow: true, gravity: -0.5, drag: 1.5, speed: 0.6, size: [0.04, 0.08], life: [0.8, 1.2], wobble: 0.1, count: 14 }),
  'dragon-aura': look({ colors: ['#5c6bff', '#26d0c9', '#ffd56b', '#8a5cff'], shape: 'spark', glow: true, gravity: -0.4, drag: 2, speed: 1.6, size: [0.02, 0.04], life: [0.5, 0.9], wobble: 0.06, count: 36 }),
  shadow: look({ colors: ['#2a1a3a', '#4a2a66', '#120a1c'], shape: 'dot', gravity: -0.3, drag: 1.8, speed: 0.7, size: [0.05, 0.1], life: [0.7, 1.1], wobble: 0.06, count: 18 }),
  glint: look({ colors: ['#ffffff', '#dfe6ee', '#a9b6c4'], shape: 'star', glow: true, drag: 3, speed: 1.3, size: [0.02, 0.045], life: [0.35, 0.6], spin: 0.5, count: 20 }),
  glow: look({ colors: ['#fffbe8', '#fff0c2', '#ffffff'], shape: 'dot', glow: true, gravity: -0.2, drag: 2, speed: 0.8, size: [0.02, 0.04], life: [0.6, 1], count: 26 }),
  sparkle: look({ colors: ['#fff6c2', '#ffd95c', '#ffffff'], shape: 'star', glow: true, gravity: -0.1, drag: 2.2, speed: 1.2, size: [0.02, 0.04], life: [0.5, 0.9], spin: 0.6, count: 30 }),
  confetti: look({ colors: ['#ff4a6b', '#ffd23c', '#4cd3ff', '#7cff6b', '#c86bff'], shape: 'confetti', gravity: 1.6, drag: 1.4, speed: 1.8, size: [0.02, 0.035], life: [0.9, 1.3], spin: 3, wobble: 0.04, count: 40 }),
  starfall: look({ colors: ['#ffffff', '#fff1a8', '#a8d8ff'], shape: 'star', glow: true, gravity: 1.4, drag: 0.4, speed: 0.6, size: [0.02, 0.04], life: [0.8, 1.2], spin: 0.4, count: 24 }),
};

/** Each moment's length, ms. */
export const MOMENT_MS: Record<EffectMoment, number> = { play: 1000, attack: 900, evolve: 1400, ko: 1500 };

/** Room around the card the canvas covers, as a share of its size on each side. */
export const PAD = 0.45;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** When it appears and how long it lives, seconds. */
  born: number;
  life: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
  phase: number;
}

/** A tiny seeded random generator, so a moment's particles don't depend on Math.random's state (and tests could fix it). */
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * The particles a moment sends out, in card widths with the card's top left at 0,0 (`height`: its height over its
 * width). Play: a burst from the middle; attack: a stream from the top edge towards the opponent; evolve: a column
 * rising from the bottom edge across the card; Knock Out: the card breaking up, outwards from the middle.
 */
export function emit(l: Look, moment: EffectMoment, height: number, seed = Date.now()): Particle[] {
  const rnd = random(seed);
  const between = ([a, b]: [number, number]) => a + (b - a) * rnd();
  const count = Math.round(l.count * { play: 1, attack: 1.1, evolve: 1.6, ko: 1.8 }[moment]);
  return Array.from({ length: count }, () => {
    let x = 0.5, y = height / 2, angle = rnd() * Math.PI * 2, speed = l.speed * (0.5 + rnd() * 0.6), born = rnd() * 0.12;
    if (moment === 'attack') {
      x = 0.15 + rnd() * 0.7;
      y = 0;
      angle = -Math.PI / 2 + (rnd() - 0.5) * 1.1;
      speed *= 1.5;
      born = rnd() * 0.35;
    } else if (moment === 'evolve') {
      x = rnd();
      y = height;
      angle = -Math.PI / 2 + (rnd() - 0.5) * 0.5;
      speed *= 0.9;
      born = rnd() * 0.85;
    } else if (moment === 'ko') {
      x = rnd();
      y = rnd() * height;
      angle = Math.atan2(y - height / 2, x - 0.5) + (rnd() - 0.5) * 0.6;
      speed *= 0.8;
      born = rnd() * 0.25;
    }
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      born,
      // Never past the moment's end, so every particle fades out rather than vanishing with the canvas.
      life: Math.min(between(l.life), MOMENT_MS[moment] / 1000 - born),
      size: between(l.size),
      color: l.colors[Math.floor(rnd() * l.colors.length)]!,
      angle: rnd() * Math.PI * 2,
      spin: (rnd() - 0.5) * 2 * l.spin * Math.PI * 2,
      phase: rnd() * Math.PI * 2,
    };
  });
}

/** Where a particle is and how it's turned `t` seconds after the moment started (null before it's born or once it's gone), and how opaque. */
export function at(p: Particle, l: Look, t: number): { x: number; y: number; angle: number; alpha: number; vx: number; vy: number } | null {
  const age = t - p.born;
  if (age < 0 || age > p.life) return null;
  // Drag as exponential decay of the velocity, integrated; gravity added on top.
  const k = l.drag;
  const decay = k > 0 ? (1 - Math.exp(-k * age)) / k : age;
  const vScale = Math.exp(-k * age);
  const x = p.x + p.vx * decay + Math.sin(age * 6 + p.phase) * l.wobble;
  const y = p.y + p.vy * decay + 0.5 * l.gravity * age * age;
  const fade = age / p.life;
  const alpha = Math.min(1, age / 0.08) * (fade > 0.6 ? 1 - (fade - 0.6) / 0.4 : 1);
  return { x, y, angle: p.angle + p.spin * age, alpha, vx: p.vx * vScale, vy: p.vy * vScale + l.gravity * age };
}
