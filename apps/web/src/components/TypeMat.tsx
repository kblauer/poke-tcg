import { useEffect, useRef } from 'react';
import { useColorTheme } from '../hooks/useColorTheme';
import type { MatChoice } from '../hooks/useMatType';
import { buildScene, drawScene, drawTransition, isMatType, isPlace, MAT_TYPES, TRANSITION_MS, type MatSet, type MatSize, type MatType, type Scene } from '../utils/typeMats';

/** The mat's frame rate while a burst plays (the scenes themselves stand still): 30 a second is plenty. */
const FRAME_MS = 1000 / 30;

/**
 * A type mat (the cosmetics `mat-frlg` and `mat-dp`, the user's, 2026-11-06, after Pokémon TCG Live's: `set`,
 * the game whose pictures they are): the table under the
 * cards, filling its positioned parent behind its content, painting the bare table (`bare`, a colour variable: slate 900,
 * the phone's screen 950) and over it the scene of
 * `choice`'s type (utils/typeMats.ts; Grass, Fire and Water so far, any other the bare table). A change of type bursts
 * from the Active Pokémon that brought it (`[data-slot="active"]`, `"cpu-active"`), the new scene sweeping out over the
 * old. With reduced motion the scenes stand still and change at once. A place's mat (`isPlace`) is its one scene throughout.
 * The playmat's click overlay (Playmat) goes over it.
 */
export function TypeMat({ choice, set, bare = '--color-slate-900', className = '' }: { choice: MatChoice; set: MatSet; bare?: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [theme] = useColorTheme();
  // The type to show and where it came from, read by the drawing loop (which outlives renders).
  const want = useRef(choice);
  want.current = choice;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slate = getComputedStyle(el).getPropertyValue(bare).trim() || '#0f172a';
    const base = (g: CanvasRenderingContext2D) => {
      g.fillStyle = slate;
      g.fillRect(0, 0, el.width, el.height);
    };
    let size: MatSize = { w: 0, h: 0, px: 1 };
    const scenes = new Map<MatType, Scene>();
    // A picture set's scene isn't kept until its sheet has loaded (asked again each frame till then).
    const sceneOf = (type: MatType | null) => {
      if (!type) return null;
      if (!scenes.has(type)) {
        const scene = buildScene(set, type, size);
        if (!scene) return null;
        scenes.set(type, scene);
      }
      return scenes.get(type)!;
    };
    // A place's mat has one scene whatever the type (kept under the first type's key): it never changes.
    const typeOf = (c: MatChoice) => (isPlace(set) ? MAT_TYPES[0] : isMatType(c.type) ? c.type : null);
    let shown = typeOf(want.current);
    let change: { from: MatType | null; to: MatType | null; at: number; origin: { x: number; y: number } } | null = null;
    const born = performance.now();
    let frame: number | null = null;
    let lastDrawn = 0;
    // The type whose scene is on the canvas, standing still (the scenes don't move): drawn again only once it changes.
    let painted: MatType | null | undefined;
    /** The arriving Active Pokémon's centre on the canvas (device pixels), or the table's middle. */
    const originOf = (side: MatChoice['side']) => {
      const slot = side && document.querySelector(`[data-slot="${side === 'self' ? 'active' : 'cpu-active'}"]`);
      const box = el.getBoundingClientRect();
      if (!slot || !box.width) return { x: size.w / 2, y: size.h / 2 };
      const s = slot.getBoundingClientRect();
      return { x: ((s.left + s.width / 2 - box.left) / box.width) * size.w, y: ((s.top + s.height / 2 - box.top) / box.height) * size.h };
    };
    const draw = (now: number) => {
      frame = still ? null : requestAnimationFrame(draw);
      if (!still && now - lastDrawn < FRAME_MS) return;
      lastDrawn = now;
      if (!size.w) return;
      const target = typeOf(want.current);
      if (target !== (change ? change.to : shown)) {
        if (still) shown = target;
        else change = { from: change ? change.to : shown, to: target, at: now, origin: originOf(want.current.side) };
      }
      const t = still ? 0 : now - born;
      if (change) {
        const p = (now - change.at) / TRANSITION_MS;
        if (p >= 1) {
          shown = change.to;
          change = null;
        } else {
          drawTransition(ctx, size, sceneOf(change.from), sceneOf(change.to), change.to, change.from, p, t, change.origin, base);
          painted = undefined;
          return;
        }
      }
      const scene = sceneOf(shown);
      if (painted === shown && !scene?.moving) return;
      if (scene) drawScene(ctx, scene, t);
      else base(ctx);
      // A picture still loading (no scene yet) is drawn again until it's there.
      painted = scene || !shown ? shown : undefined;
    };
    const resize = () => {
      const box = el.parentElement!.getBoundingClientRect();
      const px = Math.min(2, devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(box.width * px));
      el.height = Math.max(1, Math.round(box.height * px));
      size = { w: el.width, h: el.height, px };
      scenes.clear();
      lastDrawn = 0;
      painted = undefined;
      if (still || frame === null) draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el.parentElement!);
    resize();
    if (!still) frame ??= requestAnimationFrame(draw);
    // With reduced motion nothing loops: a change of type is drawn when it comes (below).
    const redraw = still ? setInterval(() => (typeOf(want.current) !== shown || (shown && !scenes.has(shown))) && draw(performance.now()), 250) : null;
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (redraw !== null) clearInterval(redraw);
    };
  }, [theme, bare, set]);
  // Clipped to the parent's rounded corners, as the playmat is.
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}>
      <canvas ref={canvas} className="h-full w-full" />
    </div>
  );
}
