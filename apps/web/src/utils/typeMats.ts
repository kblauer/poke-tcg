// The type mats' scenes (the user's, 2026-11-06, after Pokémon TCG Live's mats): one a type, the table under the cards
// taking on the type of the player's Active Pokémon (TypeMat.tsx), each a game's picture (`pictureScene`); a change of
// type is a burst from the arriving Active Pokémon (`drawTransition`), the new scene sweeping out over the old within
// a ragged ring in the new type's style (Water a foam ring, Fire a burning edge, Grass a ring of leaves, Lightning a
// crackling edge throwing bolts, Psychic a shimmering wave, Fighting a shockwave of dust, Darkness a creeping shadow,
// Metal a steel ring with sparks, Colorless a gust of wind, Dragon a ring of drifting cloud).

/** The types a mat can have a scene for (the user's: Grass, Fire and Water first, then Lightning, Psychic and Fighting, then Darkness, Metal, Colorless and Dragon). */
export const MAT_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless', 'dragon'] as const;
export type MatType = (typeof MAT_TYPES)[number];
export const isMatType = (t: string | null | undefined): t is MatType => (MAT_TYPES as readonly string[]).includes(t ?? '');

/**
 * The mats' sets (the cosmetics): `frlg` and `dp` the FireRed/LeafGreen and Diamond/Pearl ones (the user's, 2026-11-06:
 * made-up scenes from the games' own tiles, tools/mats/; the drawn Elemental mat removed, 2026-11-07), pictures in
 * public/mats/<set>/<type>.png, a vertical sheet of the scene's animation frames, with <type>.json its frames' timing.
 */
export type MatSet = 'frlg' | 'dp' | `places/${string}`;
export const MAT_SETS: Record<string, MatSet> = {
  'mat-frlg': 'frlg',
  'mat-dp': 'dp',
  // The places (the user's, 2026-11-07: each a mat of its own, one scene whatever the type; tools/mats/frlg_places.py).
  'mat-mt-chimney': 'places/mt-chimney',
  'mat-vermilion-city': 'places/vermilion-city',
  'mat-viridian-forest': 'places/viridian-forest',
  'mat-pretty-petal-flower-shop': 'places/pretty-petal-flower-shop',
};

/** A place's mat: one picture, public/mats/places/<name>.png, whatever the Active Pokémon's type. */
export const isPlace = (set: MatSet) => set.startsWith('places/');

/** The types each set has a scene for so far (issue #175: every type, each set in turn); a place has its one scene. */
/** (FireRed & LeafGreen's Dragon, the Sky Pillar, taken out of its set, the user's, 2026-11-08: its sheet and generator kept, tools/mats/frlg_dragon.py.) */
const SET_TYPES: Record<'frlg' | 'dp', readonly MatType[]> = { frlg: MAT_TYPES.filter((t) => t !== 'dragon'), dp: ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless'] };

/** The types `set` shows a scene for, in order (a place: every type, its one scene). */
export const setTypes = (set: MatSet): readonly MatType[] => (isPlace(set) ? MAT_TYPES : SET_TYPES[set as 'frlg' | 'dp']);

/** How long a change of type takes, in ms. */
export const TRANSITION_MS = 1300;

/** A seeded random number generator (mulberry32), so a scene looks the same each time it's built. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth wobble round a circle (sum of sines at random phases): -1 to 1 at angle `a`, moving with `t`. */
function wobble(seed: number, harmonics = [3, 5, 8, 13]) {
  const rnd = random(seed);
  const parts = harmonics.map((k) => ({ k, phase: rnd() * Math.PI * 2, speed: (rnd() - 0.5) * 0.0016, weight: 1 / Math.sqrt(k) }));
  const total = parts.reduce((s, p) => s + p.weight, 0);
  return (a: number, t = 0) => parts.reduce((s, p) => s + Math.sin(a * p.k + p.phase + t * p.speed) * p.weight, 0) / total;
}

/** An offscreen canvas of `w` by `h` device pixels. */
function layer(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

/** Where a scene is drawn: the canvas's size in device pixels, and how many of them a CSS pixel is (its detail's scale). */
export interface MatSize {
  w: number;
  h: number;
  px: number;
}

export interface Scene {
  /** The still layer, the canvas's size. */
  still: HTMLCanvasElement;
  /** Draws the scene's moving parts over its still layer, `t` ms into its life. */
  animate(ctx: CanvasRenderingContext2D, t: number): void;
  /** Its animation draws the whole scene (a picture's frames), so the still layer isn't drawn under it. */
  whole?: true;
  /** It moves (a picture with more than one frame): drawn every frame, not only when it changes. */
  moving?: boolean;
}

/**
 * A picture set's scene sheet: its frames stacked downwards, each `width` by `height`, shown for `ms` in turn; a long
 * one in columns side by side (each frame's `x`: browsers won't draw from an image much over 32,000 px tall).
 */
interface Sheet {
  img: HTMLImageElement;
  width: number;
  height: number;
  frames: { x?: number; y: number; ms: number }[];
  /** Glows drawn over the frames (the Lightning mat's lighthouses' lamps): their middle and reach in the frame's pixels, their colour. */
  lights?: { x: number; y: number; r: number; rgb: [number, number, number] }[];
}

/** The sheets loaded (or loading, or failed), by set and type: fetched once, the first time a mat asks. */
const sheets = new Map<string, Sheet | 'loading' | 'failed'>();

function sheetOf(key: string): Sheet | null {
  const known = sheets.get(key);
  if (known) return typeof known === 'string' ? null : known;
  sheets.set(key, 'loading');
  void (async () => {
    try {
      const meta = (await (await fetch(`/mats/${key}.json`)).json()) as Omit<Sheet, 'img'>;
      const img = new Image();
      img.src = `/mats/${key}.png`;
      await img.decode();
      sheets.set(key, { ...meta, img });
    } catch {
      sheets.set(key, 'failed');
    }
  })();
  return null;
}

/**
 * A picture set's scene: its frames scaled to just cover the canvas, centred (the user's, 2026-11-07: a whole number of
 * times was too close, the table showing only the scene's middle), played at the sheet's timing. The pixels stay sharp
 * and even: a frame is scaled up a whole number of times (pixelated) past the size, then smoothly down to it, once a
 * frame, kept until the next. Null while the sheet loads (or if it's missing): the bare table meanwhile.
 */
function pictureScene(key: string, { w, h }: MatSize): Scene | null {
  const sheet = sheetOf(key);
  if (!sheet) return null;
  const k = Math.max(w / sheet.width, h / sheet.height);
  const sw = Math.round(sheet.width * k);
  const sh = Math.round(sheet.height * k);
  const dx = Math.round((w - sw) / 2);
  const dy = Math.round((h - sh) / 2);
  // The whole-number step up, skipped when the cover scale is (about) whole already.
  const up = Math.ceil(k - 0.02);
  const [big, bg] = Math.abs(k - Math.round(k)) < 0.02 ? [null, null] : layer(sheet.width * up, sheet.height * up);
  const total = sheet.frames.reduce((s, f) => s + f.ms, 0) || 1;
  const [still, ctx] = layer(w, h);
  const frameAt = (g: CanvasRenderingContext2D, { x = 0, y }: Sheet['frames'][number]) => {
    if (big && bg) {
      bg.imageSmoothingEnabled = false;
      bg.drawImage(sheet.img, x, y, sheet.width, sheet.height, 0, 0, big.width, big.height);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(big, dx, dy, sw, sh);
    } else {
      g.imageSmoothingEnabled = false;
      g.drawImage(sheet.img, x, y, sheet.width, sheet.height, dx, dy, sw, sh);
    }
  };
  // The frame on the still layer, drawn there once each time it changes.
  const first = sheet.frames[0] ?? { y: 0, ms: 0 };
  let drawn = first;
  frameAt(ctx, drawn);
  return {
    still,
    whole: true,
    moving: sheet.frames.length > 1,
    animate(g, t) {
      let at = t % total;
      const f = sheet.frames.find((x) => (at -= x.ms) < 0) ?? first;
      if (f.x !== drawn.x || f.y !== drawn.y) frameAt(ctx, (drawn = f));
      g.drawImage(still, 0, 0);
      sheet.lights?.forEach((l, i) => glow(g, dx + l.x * (sw / sheet.width), dy + l.y * (sh / sheet.height), l.r * (sw / sheet.width), l.rgb, t, i));
    },
  };
}

/**
 * A lamp's glow at (x, y), `r` across: a warm light fading out from it, gently fading in and out itself (the user's,
 * 2026-11-07), each lamp (`i`) at its own slow pace and phase so they never pulse together.
 */
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, [cr, cg, cb]: [number, number, number], t: number, i: number) {
  const period = 3600 + ((i * 1370) % 2300);
  const a = 0.45 + 0.3 * Math.sin((t / period + i * 0.37) * 2 * Math.PI);
  const fill = g.createRadialGradient(x, y, 0, x, y, r);
  fill.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
  fill.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.3})`);
  fill.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  g.fillStyle = fill;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** A leaf's shape at (x, y), `len` long, turned by `ang`. */
function leaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, fill: string, vein?: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.quadraticCurveTo(0, -len * 0.38, len / 2, 0);
  g.quadraticCurveTo(0, len * 0.38, -len / 2, 0);
  g.fillStyle = fill;
  g.fill();
  if (vein) {
    g.strokeStyle = vein;
    g.lineWidth = Math.max(0.5, len / 18);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.lineTo(len / 2, 0);
    g.stroke();
  }
  g.restore();
}

/**
 * A set's scene of a type for a canvas of `size` (null until its sheet has loaded): its terrain's animation at the game's
 * pace, its arena or field standing still (the user's, 2026-11-07).
 */
export const buildScene = (set: MatSet, type: MatType, size: MatSize): Scene | null => pictureScene(isPlace(set) ? set : `${set}/${type}`, size);

/** A scene drawn whole, `t` ms into its life. */
export function drawScene(g: CanvasRenderingContext2D, scene: Scene, t: number) {
  if (!scene.whole) g.drawImage(scene.still, 0, 0);
  scene.animate(g, t);
}

/** How far the ring has gone, 0 to 1: a small burst round the card first (its first eighth), then a sweep slowing as it reaches the corners. */
const BURST = 0.12;
const ease = (p: number) => (p < BURST ? 0.07 * (p / BURST) : 0.07 + 0.93 * (1 - (1 - (p - BURST) / (1 - BURST)) ** 2));

/** The burst's glow at the card, by the arriving type (and the bare table's, slate). */
const GLOW: Record<MatType | 'bare', string> = { water: '150, 220, 255', fire: '255, 150, 50', grass: '170, 240, 120', lightning: '255, 235, 90', psychic: '230, 130, 255', fighting: '235, 160, 90', darkness: '120, 90, 170', metal: '210, 225, 240', colorless: '245, 245, 235', dragon: '200, 170, 90', bare: '148, 163, 184' };

/** The burst's ring's ragged edge, its wobble by type. */
const ringEdges: Record<MatType | 'bare', (a: number, t: number) => number> = {
  water: wobble(41, [5, 9, 14]),
  fire: wobble(42, [7, 13, 21, 34]),
  grass: wobble(43, [4, 7, 11]),
  lightning: wobble(45, [11, 19, 31, 47]),
  psychic: wobble(46, [3, 5]),
  fighting: wobble(47, [6, 9, 15]),
  darkness: wobble(48, [2, 4, 7]),
  metal: wobble(49, [4, 6]),
  colorless: wobble(50, [3, 7, 12]),
  dragon: wobble(56, [3, 5, 9]),
  bare: wobble(44, [3, 6]),
};

/**
 * A change of type, `p` (0 to 1) of the way through: the old scene (`from`, null the bare table) with the new (`to`)
 * sweeping out over it from `origin` (the arriving Active Pokémon, device pixels) within a ragged ring, its edge drawn in
 * the new type's style (or the old's, fading to the bare table). `base` paints the bare table.
 */
export function drawTransition(g: CanvasRenderingContext2D, size: MatSize, from: Scene | null, to: Scene | null, toType: MatType | null, fromType: MatType | null, p: number, t: number, origin: { x: number; y: number }, base: (g: CanvasRenderingContext2D) => void) {
  const { w, h, px } = size;
  const reach = Math.max(Math.hypot(origin.x, origin.y), Math.hypot(w - origin.x, origin.y), Math.hypot(origin.x, h - origin.y), Math.hypot(w - origin.x, h - origin.y));
  const r = ease(p) * reach * 1.08;
  const style = toType ?? fromType ?? 'water';
  const edge = ringEdges[toType ?? 'bare'];
  const ragged = (style === 'fire' ? 0.09 : 0.06) * Math.min(r, reach * 0.5);
  const ring = (grow: number) => {
    const path = new Path2D();
    for (let i = 0; i <= 96; i++) {
      const ang = (i / 96) * Math.PI * 2;
      const rr = Math.max(0, r + grow + edge(ang, t * 3) * ragged);
      if (i) path.lineTo(origin.x + Math.cos(ang) * rr, origin.y + Math.sin(ang) * rr);
      else path.moveTo(origin.x + Math.cos(ang) * rr, origin.y + Math.sin(ang) * rr);
    }
    path.closePath();
    return path;
  };
  if (from) drawScene(g, from, t);
  else base(g);
  g.save();
  g.clip(ring(0));
  if (to) drawScene(g, to, t);
  else base(g);
  g.restore();
  // The burst: a glow swelling at the card and fading as the ring leaves it.
  const flash = Math.sin(Math.min(1, p / (BURST * 2.5)) * Math.PI);
  if (flash > 0) {
    const fr = (40 + 120 * Math.min(1, p / (BURST * 2.5))) * px;
    const burst = g.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, fr);
    burst.addColorStop(0, `rgba(${GLOW[toType ?? 'bare']}, ${0.85 * flash})`);
    burst.addColorStop(1, `rgba(${GLOW[toType ?? 'bare']}, 0)`);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = burst;
    g.fillRect(origin.x - fr, origin.y - fr, fr * 2, fr * 2);
    g.restore();
  }
  // The edge, fading out as the ring passes the table's corners.
  const fade = Math.min(1, (1 - p) * 4) * Math.min(1, p * 8);
  if (fade <= 0) return;
  g.save();
  g.globalAlpha = fade;
  if (style === 'water') {
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(220, 245, 255, 0.55)';
    g.lineWidth = 22 * px;
    g.stroke(ring(-6 * px));
    g.strokeStyle = 'rgba(250, 254, 255, 0.95)';
    g.lineWidth = 8 * px;
    g.stroke(ring(0));
    // Spray flung off the wave.
    const rnd = random(51);
    for (let i = 0; i < 60; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + (8 + rnd() * 40 * p) * px;
      g.fillStyle = `rgba(240, 250, 255, ${0.4 + rnd() * 0.5})`;
      g.beginPath();
      g.arc(origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d, (1 + rnd() * 2.5) * px, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 'fire') {
    g.globalCompositeOperation = 'lighter';
    for (const [grow, width, color] of [
      [-10, 40, 'rgba(255, 70, 10, 0.35)'],
      [-4, 18, 'rgba(255, 140, 30, 0.7)'],
      [0, 6, 'rgba(255, 235, 160, 0.95)'],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = width * px;
      g.lineJoin = 'round';
      g.stroke(ring(grow * px));
    }
    // Sparks thrown ahead of the flames.
    const rnd = random(52);
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + (rnd() * 70 * p) * px;
      const s = (1 + rnd() * 2) * px;
      g.fillStyle = `rgba(255, ${170 + Math.round(rnd() * 80)}, 80, ${0.5 + rnd() * 0.5})`;
      g.fillRect(origin.x + Math.cos(ang) * d - s, origin.y + Math.sin(ang) * d - s, s * 2, s * 2);
    }
  } else if (style === 'lightning') {
    // Lightning: a crackling yellow edge, and bolts forking out ahead of it, flickering.
    g.globalCompositeOperation = 'lighter';
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(255, 220, 60, 0.45)';
    g.lineWidth = 14 * px;
    g.stroke(ring(-3 * px));
    g.strokeStyle = 'rgba(255, 252, 210, 0.95)';
    g.lineWidth = 3 * px;
    g.stroke(ring(0));
    const rnd = random(54 + Math.floor(t / 70));
    for (let i = 0; i < 14; i++) {
      const ang = rnd() * Math.PI * 2;
      let d = r;
      g.beginPath();
      g.moveTo(origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d);
      for (let k = 0; k < 4; k++) {
        d += (10 + rnd() * 18) * px;
        const a = ang + (rnd() - 0.5) * 0.25;
        g.lineTo(origin.x + Math.cos(a) * d, origin.y + Math.sin(a) * d);
      }
      g.strokeStyle = `rgba(255, 245, 150, ${0.5 + rnd() * 0.5})`;
      g.lineWidth = (1 + rnd() * 2) * px;
      g.stroke();
    }
  } else if (style === 'psychic') {
    // Psychic: soft violet waves rippling out behind the edge, and a faint pink shimmer on it.
    g.globalCompositeOperation = 'lighter';
    for (const [grow, alpha] of [[0, 0.7], [-18, 0.4], [-36, 0.22], [-54, 0.1]] as const) {
      g.strokeStyle = `rgba(215, 120, 255, ${alpha})`;
      g.lineWidth = (8 - grow / 12) * px;
      g.stroke(ring(grow * px));
    }
    g.strokeStyle = 'rgba(255, 200, 245, 0.8)';
    g.lineWidth = 2 * px;
    g.stroke(ring(4 * px));
  } else if (style === 'fighting') {
    // Fighting: a shockwave, a hard pale ring with dust and grit thrown out ahead of it.
    g.strokeStyle = 'rgba(250, 230, 200, 0.85)';
    g.lineWidth = 6 * px;
    g.stroke(ring(0));
    g.strokeStyle = 'rgba(200, 150, 100, 0.35)';
    g.lineWidth = 26 * px;
    g.stroke(ring(-12 * px));
    const rnd = random(55);
    for (let i = 0; i < 60; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + (6 + rnd() * 50 * p) * px;
      const s = (1.5 + rnd() * 3) * px;
      g.fillStyle = `rgba(${150 + Math.round(rnd() * 60)}, ${110 + Math.round(rnd() * 40)}, 80, ${0.4 + rnd() * 0.5})`;
      g.fillRect(origin.x + Math.cos(ang) * d - s, origin.y + Math.sin(ang) * d - s, s * 2, s * 2);
    }
  } else if (style === 'darkness') {
    // Darkness: a shadow creeping out, its edge a deep violet haze, wisps of dark curling ahead of it.
    for (const [grow, width, alpha] of [[-30, 60, 0.25], [-10, 30, 0.45], [0, 8, 0.7]] as const) {
      g.strokeStyle = `rgba(30, 15, 50, ${alpha})`;
      g.lineWidth = width * px;
      g.stroke(ring(grow * px));
    }
    g.strokeStyle = 'rgba(150, 110, 210, 0.5)';
    g.lineWidth = 2 * px;
    g.stroke(ring(2 * px));
    const rnd = random(57);
    for (let i = 0; i < 40; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + (4 + rnd() * 40 * p) * px;
      g.fillStyle = `rgba(25, 10, 45, ${0.25 + rnd() * 0.35})`;
      g.beginPath();
      g.arc(origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d, (3 + rnd() * 7) * px, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 'metal') {
    // Metal: a hard steel ring, a bright sheen along it, and sparks struck off it.
    g.strokeStyle = 'rgba(110, 125, 140, 0.6)';
    g.lineWidth = 16 * px;
    g.stroke(ring(-6 * px));
    g.strokeStyle = 'rgba(235, 242, 250, 0.95)';
    g.lineWidth = 4 * px;
    g.stroke(ring(0));
    g.globalCompositeOperation = 'lighter';
    const rnd = random(58 + Math.floor(t / 90));
    for (let i = 0; i < 30; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + rnd() * 6 * px;
      const len = (6 + rnd() * 16) * px;
      const a = ang + (rnd() - 0.5) * 0.8;
      g.strokeStyle = `rgba(255, ${220 + Math.round(rnd() * 35)}, 170, ${0.5 + rnd() * 0.5})`;
      g.lineWidth = (1 + rnd()) * px;
      g.beginPath();
      g.moveTo(origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d);
      g.lineTo(origin.x + Math.cos(ang) * d + Math.cos(a) * len, origin.y + Math.sin(ang) * d + Math.sin(a) * len);
      g.stroke();
    }
  } else if (style === 'colorless') {
    // Colorless: a gust, a soft white edge with streaks of wind swept round ahead of it.
    g.strokeStyle = 'rgba(255, 255, 250, 0.35)';
    g.lineWidth = 18 * px;
    g.stroke(ring(-6 * px));
    g.strokeStyle = 'rgba(255, 255, 250, 0.85)';
    g.lineWidth = 3 * px;
    g.stroke(ring(0));
    const rnd = random(59);
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = r + (8 + rnd() * 30 * p) * px;
      const sweep = 0.12 + rnd() * 0.2;
      g.strokeStyle = `rgba(255, 255, 250, ${0.35 + rnd() * 0.4})`;
      g.lineWidth = (1.5 + rnd() * 2) * px;
      g.beginPath();
      g.arc(origin.x, origin.y, d, ang, ang + sweep);
      g.stroke();
    }
  } else if (style === 'dragon') {
    // Dragon: a ring of cloud rolling out, puffs along its edge, a warm gold line inside it.
    const rnd = random(60);
    const n = Math.round(30 + r / (12 * px));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd() * 0.08;
      const d = r + edge(ang, t * 3) * ragged + (rnd() - 0.4) * 10 * px;
      g.fillStyle = `rgba(250, 250, 255, ${0.55 + rnd() * 0.35})`;
      g.beginPath();
      g.arc(origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d, (8 + rnd() * 10) * px, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(230, 190, 90, 0.6)';
    g.lineWidth = 3 * px;
    g.stroke(ring(-14 * px));
  } else {
    // Grass: leaves along the ring, turning as they're carried out, and a soft green glow behind them.
    g.strokeStyle = 'rgba(160, 230, 120, 0.4)';
    g.lineWidth = 16 * px;
    g.stroke(ring(-4 * px));
    const rnd = random(53);
    const tones = ['#3f8f34', '#56a63f', '#6fb84a', '#88c95a', '#2e7a2e'];
    const n = Math.round(36 + r / (9 * px));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd() * 0.1;
      const d = r + edge(ang, t * 3) * ragged + (rnd() - 0.3) * 18 * px;
      leaf(g, origin.x + Math.cos(ang) * d, origin.y + Math.sin(ang) * d, (13 + rnd() * 12) * px, ang + Math.PI / 2 + p * 6 * (rnd() - 0.5), tones[i % tones.length]!, 'rgba(20, 60, 20, 0.5)');
    }
  }
  g.restore();
}
