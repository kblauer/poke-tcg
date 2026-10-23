import { useEffect, useRef } from 'react';

/**
 * A click on the mat: where (CSS pixels in the canvas) and when (performance.now()). `remote`: a click on another mat of
 * its group (the other side of the table), outside this one: its wave comes in from beyond the edge.
 */
interface Ripple {
  x: number;
  y: number;
  at: number;
  remote?: boolean;
}

/** How much longer a click on the other side of the table keeps animating here, as its light takes time to come across. */
const REMOTE_EXTRA = 1200;

/** The mats of each group (`group`: both sides of the table), told of each other's clicks in window coordinates. */
const groups = new Map<string, Set<(clientX: number, clientY: number, at: number) => void>>();

/** A playmat's pattern: laid out for the canvas's size (`build`), then drawn each frame with the clicks still animating. */
interface Pattern<S> {
  /** How long a click animates, in ms. */
  duration: number;
  build(w: number, h: number): S;
  draw(ctx: CanvasRenderingContext2D, scene: S, ripples: Ripple[], now: number): void;
}

/** The pattern's resting lines and dots, and the light a click sends through them. */
const LINE = 'rgba(148, 163, 184, 0.06)';
const glow = (alpha: number) => `rgba(125, 211, 252, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Dot matrix: a grid of dots; a click sends a wave out that pushes the dots apart as it passes, lighting them. */
const dots: Pattern<{ x: number; y: number }[]> = {
  duration: 1400,
  build(w, h) {
    const gap = 22;
    const out: { x: number; y: number }[] = [];
    for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) out.push({ x, y });
    return out;
  },
  draw(ctx, scene, ripples, now) {
    for (const d of scene) {
      let dx = 0;
      let dy = 0;
      let lit = 0;
      for (const r of ripples) {
        const t = now - r.at;
        const vx = d.x - r.x;
        const vy = d.y - r.y;
        const dist = Math.hypot(vx, vy) || 1;
        // A ring travelling outwards (0.55 px/ms), 28px wide, fading as it goes.
        const push = Math.exp(-(((dist - t * 0.55) / 28) ** 2)) * Math.max(0, 1 - t / dots.duration);
        dx += (vx / dist) * push * 11;
        dy += (vy / dist) * push * 11;
        lit = Math.max(lit, push);
      }
      ctx.beginPath();
      ctx.arc(d.x + dx, d.y + dy, 1.6 + lit * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = lit > 0.02 ? glow(0.15 + lit * 0.8) : LINE;
      ctx.fill();
    }
  },
};

/** A pointy-topped hexagon's corners around (cx, cy). */
const hexCorners = (cx: number, cy: number, s: number) => Array.from({ length: 6 }, (_, i) => [cx + s * Math.cos(((60 * i - 30) * Math.PI) / 180), cy + s * Math.sin(((60 * i - 30) * Math.PI) / 180)] as [number, number]);

interface HexScene {
  size: number;
  hexes: { cx: number; cy: number; corners: number[] }[];
  /** Every corner once (the hexes share theirs), and the edges between them. */
  points: [number, number][];
  edges: [number, number][];
  neighbours: number[][];
  /** Per click: each corner's distance in edges from the clicked hex's corners (worked out once, when clicked). */
  reach: WeakMap<Ripple, Int16Array>;
}

/**
 * Hexes: the hex clicked lights up, and the light runs out from its corners along the hexes' edges, one edge after another
 * (a breadth-first walk over the corners), each edge drawn as the light crosses it and fading behind.
 */
const hex: Pattern<HexScene> = {
  duration: 1300,
  build(w, h) {
    const size = 24;
    const dx = Math.sqrt(3) * size;
    const dy = 1.5 * size;
    const key = new Map<string, number>();
    const points: [number, number][] = [];
    const edgeKeys = new Set<string>();
    const edges: [number, number][] = [];
    const hexes: HexScene['hexes'] = [];
    const corner = ([x, y]: [number, number]) => {
      const k = `${Math.round(x * 10)},${Math.round(y * 10)}`;
      let i = key.get(k);
      if (i === undefined) {
        i = points.length;
        key.set(k, i);
        points.push([x, y]);
      }
      return i;
    };
    for (let row = -1; row * dy < h + size; row++) {
      for (let col = -1; col * dx < w + dx; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        const cy = row * dy;
        const corners = hexCorners(cx, cy, size).map(corner);
        hexes.push({ cx, cy, corners });
        corners.forEach((a, i) => {
          const b = corners[(i + 1) % 6]!;
          const k = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (!edgeKeys.has(k)) {
            edgeKeys.add(k);
            edges.push([a, b]);
          }
        });
      }
    }
    const neighbours: number[][] = points.map(() => []);
    for (const [a, b] of edges) {
      neighbours[a]!.push(b);
      neighbours[b]!.push(a);
    }
    return { size, hexes, points, edges, neighbours, reach: new WeakMap() };
  },
  draw(ctx, scene, ripples, now) {
    const { points, edges, hexes, size } = scene;
    // The resting outlines.
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(...points[a]!);
      ctx.lineTo(...points[b]!);
    }
    ctx.stroke();
    const step = 55;
    for (const r of ripples) {
      // The hex clicked: the nearest centre (for a click on the other side, the one nearest it, which the light reaches as
      // late as it would have taken to come across: ~0.45px/ms, the speed it runs along the edges).
      let clicked = hexes[0]!;
      for (const hx of hexes) if ((hx.cx - r.x) ** 2 + (hx.cy - r.y) ** 2 < (clicked.cx - r.x) ** 2 + (clicked.cy - r.y) ** 2) clicked = hx;
      const t = now - r.at;
      // For a click on the other side: the edges the light would already have run to get here, so it carries on as dim
      // and as late as it would be by now, rather than starting over.
      const entry = r.remote ? Math.hypot(clicked.cx - r.x, clicked.cy - r.y) / 0.45 / step : 0;
      let reach = scene.reach.get(r);
      if (!reach) {
        reach = new Int16Array(points.length).fill(-1);
        const queue = [...clicked.corners];
        for (const c of queue) reach[c] = 0;
        for (let i = 0; i < queue.length; i++) {
          const c = queue[i]!;
          for (const n of scene.neighbours[c]!) if (reach[n] === -1) (reach[n] = reach[c]! + 1), queue.push(n);
        }
        scene.reach.set(r, reach);
      }
      // The clicked hex fills, then fades (only on the side clicked).
      const fill = (1 - t / hex.duration) * 0.35;
      if (fill > 0 && t >= 0 && !r.remote) {
        ctx.beginPath();
        hexCorners(clicked.cx, clicked.cy, size - 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = glow(fill);
        ctx.fill();
      }
      // Each edge lights as the light crosses it, from its nearer corner, and fades 350ms after.
      ctx.lineWidth = 1.6;
      for (const [a, b] of edges) {
        const [near, far] = reach[a]! <= reach[b]! ? [a, b] : [b, a];
        if (reach[near]! < 0) continue;
        const n = reach[near]! + entry;
        if (n > 16) continue;
        const p = clamp01((t - n * step) / step);
        if (p <= 0) continue;
        const fade = 1 - clamp01((t - (n + 1) * step) / 350);
        const alpha = fade * (1 - n / 17) * 0.9;
        if (alpha <= 0.01) continue;
        const [x1, y1] = points[near]!;
        const [x2, y2] = points[far]!;
        ctx.strokeStyle = glow(alpha);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
        ctx.stroke();
      }
    }
  },
};

/**
 * How strongly a click's wave touches a point `dist` px from it, `t` ms after the click: a soft ring travelling outwards at
 * `speed` px/ms, `width` px wide, fading out over `duration`. The subtle patterns all answer clicks with it: things shift a
 * few pixels and light up as it passes, but nothing turns or flips.
 */
const wave = (dist: number, t: number, duration: number, speed = 0.5, width = 30) => (t < 0 ? 0 : Math.exp(-(((dist - t * speed) / width) ** 2)) * Math.max(0, 1 - t / duration));

/** The strongest wave at (x, y) of all the clicks animating, and the push away from that click (a unit vector times it). */
function wavesAt(x: number, y: number, ripples: Ripple[], now: number, duration: number, speed?: number, width?: number) {
  let lit = 0;
  let px = 0;
  let py = 0;
  for (const r of ripples) {
    const vx = x - r.x;
    const vy = y - r.y;
    const dist = Math.hypot(vx, vy) || 1;
    const w = wave(dist, now - r.at, duration, speed, width);
    px += (vx / dist) * w;
    py += (vy / dist) * w;
    lit = Math.max(lit, w);
  }
  return { lit, px, py };
}

/** A small seeded random (mulberry32), so a mat's random layout is the same every time it's drawn. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lattice of points and the lines between them (Triangles and Grid): stored once, drawn with each point moved by the waves. */
interface Lattice {
  points: [number, number][];
  edges: [number, number][];
}

/** Draws a lattice: each corner nudged up to 3px away from a passing wave and lit, each line lit by its ends. */
function drawLattice(ctx: CanvasRenderingContext2D, { points, edges }: Lattice, ripples: Ripple[], now: number, duration: number) {
  const moved = points.map(([x, y]) => {
    const { lit, px, py } = wavesAt(x, y, ripples, now, duration);
    return { x: x + px * 3, y: y + py * 3, lit };
  });
  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  for (const [a, b] of edges) {
    ctx.moveTo(moved[a]!.x, moved[a]!.y);
    ctx.lineTo(moved[b]!.x, moved[b]!.y);
  }
  ctx.stroke();
  // The lines the wave is passing, lit over the resting ones.
  for (const [a, b] of edges) {
    const lit = (moved[a]!.lit + moved[b]!.lit) / 2;
    if (lit < 0.03) continue;
    ctx.strokeStyle = glow(lit * 0.55);
    ctx.beginPath();
    ctx.moveTo(moved[a]!.x, moved[a]!.y);
    ctx.lineTo(moved[b]!.x, moved[b]!.y);
    ctx.stroke();
  }
  for (const p of moved) {
    if (p.lit < 0.03) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2 + p.lit * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = glow(0.2 + p.lit * 0.7);
    ctx.fill();
  }
}

/** A lattice's points, each kept once (shared corners found by position), and its lines. */
function latticeBuilder() {
  const key = new Map<string, number>();
  const points: [number, number][] = [];
  const edgeKeys = new Set<string>();
  const edges: [number, number][] = [];
  const point = (x: number, y: number) => {
    const k = `${Math.round(x * 10)},${Math.round(y * 10)}`;
    let i = key.get(k);
    if (i === undefined) {
      i = points.length;
      key.set(k, i);
      points.push([x, y]);
    }
    return i;
  };
  const edge = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeKeys.has(k)) edgeKeys.add(k), edges.push([a, b]);
  };
  return { point, edge, done: (): Lattice => ({ points, edges }) };
}

/** Triangles: a triangle tiling; a click's wave lights the lines and corners as it passes, nudging the corners outward. */
const triangles: Pattern<Lattice> = {
  duration: 1500,
  build(w, h) {
    const side = 36;
    const height = (side * Math.sqrt(3)) / 2;
    const l = latticeBuilder();
    for (let row = 0; row * height < h + height; row++) {
      const offset = row % 2 ? side / 2 : 0;
      for (let col = -1; col * side < w + side; col++) {
        const x = col * side + offset;
        const y = row * height;
        const here = l.point(x, y);
        // To the next corner along the row, and the two below it (the next row is offset by half a side).
        l.edge(here, l.point(x + side, y));
        l.edge(here, l.point(x + side / 2, y + height));
        l.edge(here, l.point(x - side / 2, y + height));
      }
    }
    return l.done();
  },
  draw(ctx, scene, ripples, now) {
    drawLattice(ctx, scene, ripples, now, triangles.duration);
  },
};

/** Grid: square grid lines; a click's wave lights the lines and crossings as it passes, nudging the crossings outward. */
const squares: Pattern<Lattice> = {
  duration: 1500,
  build(w, h) {
    const cell = 30;
    const l = latticeBuilder();
    for (let y = 0; y <= h + cell; y += cell) {
      for (let x = 0; x <= w + cell; x += cell) {
        const here = l.point(x, y);
        l.edge(here, l.point(x + cell, y));
        l.edge(here, l.point(x, y + cell));
      }
    }
    return l.done();
  },
  draw(ctx, scene, ripples, now) {
    drawLattice(ctx, scene, ripples, now, squares.duration);
  },
};

/**
 * For patterns of parallel lines (Contours, Pinstripes): a click's wave as a straight front parallel to the lines,
 * travelling across them away from the click rather than out in a circle, fading along the lines far from the click.
 * `offset(r)` is a point's signed distance across the lines from click `r`, and its distance along them. Returns how
 * strongly the point is touched (`lit`) and which way it's pushed across the lines (`push`, −1 to 1 times it).
 */
function bandsAt(ripples: Ripple[], now: number, duration: number, offset: (r: Ripple) => [number, number]) {
  let lit = 0;
  let push = 0;
  for (const r of ripples) {
    const [across, along] = offset(r);
    const w = wave(Math.abs(across), now - r.at, duration) * Math.exp(-((along / 900) ** 2));
    push += Math.sign(across) * w;
    lit = Math.max(lit, w);
  }
  return { lit, push };
}

/** Strokes a line's lit stretches over it, segment by segment (`lit` per point), as the wave passes them. */
function strokeLit(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; lit: number }[], strength: number) {
  for (let i = 1; i < pts.length; i++) {
    const lit = (pts[i - 1]!.lit + pts[i]!.lit) / 2;
    if (lit < 0.03) continue;
    ctx.strokeStyle = glow(0.1 + lit * strength);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.stroke();
  }
}

/**
 * Contours: wavy lines across the mat like a map's contour lines; a click sends a wave up and down across them (each line
 * moved and lit as a whole where the wave crosses it, never bent into a circle), bowing them apart a little.
 */
const contours: Pattern<{ w: number; lines: { y: number; amp: number; freq: number; phase: number }[] }> = {
  duration: 1600,
  build(w, h) {
    const random = seeded(7);
    const lines: { y: number; amp: number; freq: number; phase: number }[] = [];
    for (let y = 8; y < h + 20; y += 16) lines.push({ y, amp: 4 + random() * 5, freq: 0.006 + random() * 0.008, phase: random() * Math.PI * 2 });
    return { w, lines };
  },
  draw(ctx, { w, lines }, ripples, now) {
    ctx.lineWidth = 1;
    for (const line of lines) {
      const pts: { x: number; y: number; lit: number }[] = [];
      for (let x = 0; x <= w + 8; x += 8) {
        // Across the lines is up and down (measured from the line's middle, so it moves as one); along them, sideways.
        const { lit, push } = bandsAt(ripples, now, contours.duration, (r) => [line.y - r.y, x - r.x]);
        pts.push({ x, y: line.y + Math.sin(x * line.freq + line.phase) * line.amp + push * 4, lit });
      }
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      strokeLit(ctx, pts, 0.45);
    }
  },
};

/** Crosses: a grid of small plus signs; a click's wave lights them and opens them out a pixel or two as it passes. */
const crosses: Pattern<{ x: number; y: number }[]> = {
  duration: 1400,
  build(w, h) {
    const gap = 26;
    const out: { x: number; y: number }[] = [];
    for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) out.push({ x, y });
    return out;
  },
  draw(ctx, scene, ripples, now) {
    ctx.lineWidth = 1.2;
    for (const c of scene) {
      const { lit, px, py } = wavesAt(c.x, c.y, ripples, now, crosses.duration);
      const x = c.x + px * 2;
      const y = c.y + py * 2;
      const arm = 3.5 + lit * 1.5;
      ctx.strokeStyle = lit > 0.03 ? glow(0.15 + lit * 0.75) : LINE;
      ctx.beginPath();
      ctx.moveTo(x - arm, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x, y + arm);
      ctx.stroke();
    }
  },
};

/**
 * Pinstripes: fine diagonal lines; a click sends a wave across them, square to the lines (never in a circle), each line
 * shifted aside a few pixels and lit where the wave crosses it.
 */
const diagonals: Pattern<{ w: number; h: number }> = {
  duration: 1500,
  build: (w, h) => ({ w, h }),
  draw(ctx, { w, h }, ripples, now) {
    const gap = 18;
    ctx.lineWidth = 1;
    // Lines x + y = c, drawn in short steps so the wave can move each part of them.
    for (let c = -h; c < w + h; c += gap) {
      const pts: { x: number; y: number; lit: number }[] = [];
      for (let x = Math.max(0, c - h) - 8; x <= Math.min(w, c) + 8; x += 8) {
        const y = c - x;
        // Across the lines is along (1, 1)/√2, their normal; along them, (1, −1)/√2.
        const { lit, push } = bandsAt(ripples, now, diagonals.duration, (r) => [(x + y - r.x - r.y) / Math.SQRT2, (x - y - r.x + r.y) / Math.SQRT2]);
        const shift = (push * 3) / Math.SQRT2;
        pts.push({ x: x + shift, y: y + shift, lit });
      }
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      strokeLit(ctx, pts, 0.45);
    }
  },
};

interface ConstellationScene {
  stars: [number, number][];
  links: [number, number][];
  neighbours: number[][];
  /**
   * Per click: each star's distance in links from the star nearest it, and (`entry`, for a click on the other side) the
   * links the light would already have run to get to that star.
   */
  reach: WeakMap<Ripple, { reach: Int16Array; entry: number }>;
}

/**
 * Constellation: scattered stars joined to their near neighbours; a click lights the nearest star, and the light runs out
 * along the links from star to star (as Hexes' along its edges), each link fading behind it.
 */
const constellation: Pattern<ConstellationScene> = {
  duration: 1600,
  build(w, h) {
    const random = seeded(42);
    const cell = 64;
    const stars: [number, number][] = [];
    // One star in each cell of a coarse grid, anywhere in it: scattered, but never bunched up or far apart.
    for (let y = 0; y < h + cell; y += cell) for (let x = 0; x < w + cell; x += cell) stars.push([x + 8 + random() * (cell - 16), y + 8 + random() * (cell - 16)]);
    const links: [number, number][] = [];
    const neighbours: number[][] = stars.map(() => []);
    stars.forEach(([x, y], i) => {
      // Joined to its 3 nearest stars within reach.
      const near = stars
        .map(([sx, sy], j) => ({ j, d: Math.hypot(sx - x, sy - y) }))
        .filter((s) => s.j !== i && s.d < cell * 1.6)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j } of near) {
        if (neighbours[i]!.includes(j)) continue;
        neighbours[i]!.push(j);
        neighbours[j]!.push(i);
        links.push([i, j]);
      }
    });
    return { stars, links, neighbours, reach: new WeakMap() };
  },
  draw(ctx, scene, ripples, now) {
    const { stars, links } = scene;
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    for (const [a, b] of links) {
      ctx.moveTo(...stars[a]!);
      ctx.lineTo(...stars[b]!);
    }
    ctx.stroke();
    ctx.fillStyle = LINE;
    for (const [x, y] of stars) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const step = 90;
    for (const r of ripples) {
      let walk = scene.reach.get(r);
      if (!walk) {
        let first = 0;
        stars.forEach(([x, y], i) => {
          if ((x - r.x) ** 2 + (y - r.y) ** 2 < (stars[first]![0] - r.x) ** 2 + (stars[first]![1] - r.y) ** 2) first = i;
        });
        const found = new Int16Array(stars.length).fill(-1);
        found[first] = 0;
        const queue = [first];
        for (let i = 0; i < queue.length; i++) {
          const s = queue[i]!;
          for (const n of scene.neighbours[s]!) if (found[n] === -1) (found[n] = found[s]! + 1), queue.push(n);
        }
        // A click on the other side carries on from this side's nearest star as late and as dim as the light (~0.7px/ms)
        // would be by the time it got there, rather than starting over.
        walk = { reach: found, entry: r.remote ? Math.hypot(stars[first]![0] - r.x, stars[first]![1] - r.y) / 0.7 / step : 0 };
        scene.reach.set(r, walk);
      }
      const { reach } = walk;
      const t = now - r.at;
      // Each link lights from its nearer star as the light crosses it, then fades; each star as the light reaches it.
      ctx.lineWidth = 1.3;
      for (const [a, b] of links) {
        const [near, far] = reach[a]! <= reach[b]! ? [a, b] : [b, a];
        if (reach[near]! < 0) continue;
        const n = reach[near]! + walk.entry;
        if (n > 12) continue;
        const p = clamp01((t - n * step) / step);
        const alpha = (1 - clamp01((t - (n + 1) * step) / 450)) * (1 - n / 13) * 0.7;
        if (p <= 0 || alpha <= 0.01) continue;
        const [x1, y1] = stars[near]!;
        const [x2, y2] = stars[far]!;
        ctx.strokeStyle = glow(alpha);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
        ctx.stroke();
      }
      stars.forEach(([x, y], i) => {
        if (reach[i]! < 0) return;
        const n = reach[i]! + walk!.entry;
        if (n > 12) return;
        const since = t - n * step;
        const alpha = since < 0 ? 0 : (1 - clamp01(since / 500)) * (1 - n / 13);
        if (alpha <= 0.01) return;
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + alpha * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = glow(alpha);
        ctx.fill();
      });
    }
  },
};

const PATTERNS: Record<string, Pattern<unknown>> = { dots, hex, triangles, squares, contours, crosses, diagonals, constellation };

/**
 * A playmat (COSMETICS in the campaign package): its pattern drawn on a canvas filling the parent (which must be
 * positioned, its content positioned above it), answering clicks on the parent's empty space (not on cards, slots or
 * buttons) with its animation. "plain" (or an unknown id) draws nothing. With reduced motion the pattern stays still.
 * Mats of the same `group` (both sides of the table) share their clicks: one on either side carries on into the other.
 */
export function Playmat({ id, group }: { id: string; group?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pattern = PATTERNS[id];
  useEffect(() => {
    const el = canvas.current;
    // The canvas is in its own clipping box (rounded like the parent); the clicks come from the parent itself.
    const parent = el?.parentElement?.parentElement;
    const ctx = el?.getContext('2d');
    if (!el || !parent || !ctx || !pattern) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: unknown = null;
    let ripples: Ripple[] = [];
    let frame: number | null = null;
    let size = { w: 0, h: 0 };
    const draw = () => {
      const now = performance.now();
      ripples = ripples.filter((r) => now - r.at < pattern.duration + (r.remote ? REMOTE_EXTRA : 0));
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      pattern.draw(ctx, scene, ripples, now);
      frame = ripples.length ? requestAnimationFrame(draw) : null;
    };
    const resize = () => {
      size = { w: parent.clientWidth, h: parent.clientHeight };
      el.width = Math.round(size.w * devicePixelRatio);
      el.height = Math.round(size.h * devicePixelRatio);
      scene = pattern.build(size.w, size.h);
      if (frame === null) draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    /** A click at (clientX, clientY) in the window: on this mat, or (`remote`) on another of its group. */
    const add = (clientX: number, clientY: number, at: number, remote: boolean) => {
      const box = el.getBoundingClientRect();
      ripples.push({ x: clientX - box.left, y: clientY - box.top, at, remote });
      frame ??= requestAnimationFrame(draw);
    };
    const fromOther = (clientX: number, clientY: number, at: number) => add(clientX, clientY, at, true);
    const members = group === undefined ? null : (groups.get(group) ?? groups.set(group, new Set()).get(group)!);
    members?.add(fromOther);
    const onDown = (e: PointerEvent) => {
      if (still || (e.target as Element).closest('button, a, input, img, [role="button"], [data-keep-action]')) return;
      const at = performance.now();
      add(e.clientX, e.clientY, at, false);
      for (const other of members ?? []) if (other !== fromOther) other(e.clientX, e.clientY, at);
    };
    parent.addEventListener('pointerdown', onDown);
    return () => {
      observer.disconnect();
      members?.delete(fromOther);
      parent.removeEventListener('pointerdown', onDown);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pattern, group]);
  if (!pattern) return null;
  // Clipped to the parent's rounded corners here, so the parent needn't clip its own content (the Trainer dialog).
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <canvas ref={canvas} className="h-full w-full" />
    </div>
  );
}
