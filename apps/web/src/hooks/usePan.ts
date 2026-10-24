import type { Route, RouteSpot } from '@poke-tcg/campaign';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Glide } from './useWalk';

/** How much the route's pixel map is enlarged in the view (2×: 16px tiles show 32px). */
export const ZOOM = 2;

/** localStorage key for the view's height, which its bottom edge can be dragged to change; and its default and least, in px. */
const HEIGHT_KEY = 'poke-tcg.route-map';
const DEFAULT_HEIGHT = 448;
const MIN_HEIGHT = 200;

function loadHeight(): number {
  try {
    const saved = Number(JSON.parse(localStorage.getItem(HEIGHT_KEY) ?? 'null')?.height);
    return saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

function saveHeight(height: number) {
  try {
    localStorage.setItem(HEIGHT_KEY, JSON.stringify({ height }));
  } catch {
    // Not remembered; the view opens at its default height next time.
  }
}

/**
 * The route map's view (RouteView, `box`): its height (dragged by the handle under it, from MIN_HEIGHT to the whole map's
 * height, `mapHeight` at ZOOM, or 85% of the window; remembered in localStorage, `poke-tcg.route-map`; `resetHeight` for
 * the handle's double-click), its size as measured, and where the map it shows (`map`) sits in it: the `offset` it's
 * drawn at, kept inside the map (`centreOn`, `centreOnMap` for a map it's about to switch to), and the `glide` it moves
 * with when it moves on its own. Dragging and the mouse wheel pan it (up and down; sideways with a trackpad or Shift),
 * unless `panLocked` (a phone's lock button): then they scroll the page. While dragging, the map (`mapEl`, the element
 * drawn at `offset`) is moved directly, and `offset` catches up when the drag ends: no render per pointer move.
 */
export function usePan({ box, mapEl, map, mapHeight, panLocked }: { box: RefObject<HTMLDivElement | null>; mapEl: RefObject<HTMLDivElement | null>; map: Route; mapHeight: number; panLocked: boolean }) {
  const [height, setHeight] = useState(loadHeight);
  const resize = useRef<{ y: number; height: number } | null>(null);
  const maxHeight = () => Math.max(MIN_HEIGHT, Math.min(mapHeight * ZOOM, Math.round(window.innerHeight * 0.85)));
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { y: e.clientY, height };
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (r) setHeight(Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(r.height + e.clientY - r.y))));
  };
  const onResizeUp = () => {
    if (resize.current) saveHeight(height);
    resize.current = null;
  };
  const resetHeight = () => {
    setHeight(DEFAULT_HEIGHT);
    saveHeight(DEFAULT_HEIGHT);
  };
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The size as last measured, for the walk's timers (set up before the first measure, on a walk in from the entrance).
  const sizeRef = useRef(size);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // How the view moves when it moves on its own (following the player, or gliding to his new spot); null while it's panned.
  const [glide, setGlide] = useState<Glide | null>(null);
  /** The drag under way: where it started (the pointer and the offset), and the offset it has reached (`at`). */
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; at?: { x: number; y: number } } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
      setSize(sizeRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** An offset kept inside a map (the map centred along any side where it's smaller than the view). */
  const clampOn = useCallback(
    (on: Route, o: { x: number; y: number }) => {
      const fit = (v: number, inView: number, mapSize: number) => (mapSize <= inView ? (inView - mapSize) / 2 : Math.min(0, Math.max(inView - mapSize, v)));
      const { w, h } = sizeRef.current;
      return { x: fit(o.x, w, on.width * ZOOM), y: fit(o.y, h, on.height * ZOOM) };
    },
    [size],
  );
  const clamp = useCallback((o: { x: number; y: number }) => clampOn(map, o), [clampOn, map]);
  const centreOnMap = useCallback(
    (on: Route, t: RouteSpot) => clampOn(on, { x: sizeRef.current.w / 2 - (t.x * 16 + 8) * ZOOM, y: sizeRef.current.h / 2 - (t.y * 16 + 8) * ZOOM }),
    [clampOn],
  );
  const centreOn = useCallback((t: RouteSpot) => centreOnMap(map, t), [centreOnMap, map]);

  // The wheel pans the map (a native listener, so it can stop the page scrolling): up and down, and sideways with a
  // trackpad's sideways scroll or Shift.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Locked, the wheel scrolls the page.
      if (panLocked) return;
      e.preventDefault();
      // Lines (some mice) are about 16px each.
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
      setGlide(null);
      setOffset((o) => clamp({ x: o.x - dx, y: o.y - dy }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [panLocked, clamp]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panLocked || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setGlide(null);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.at = clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
    const el = mapEl.current;
    if (el) el.style.transform = mapTransform(d.at);
    else setOffset(d.at);
  };
  /** Ends a drag (also when the map is locked mid-drag): the offset catches up with where the map was dragged to. */
  const endDrag = () => {
    if (drag.current?.at) setOffset(drag.current.at);
    drag.current = null;
  };

  return { height, onResizeDown, onResizeMove, onResizeUp, resetHeight, size, offset, setOffset, glide, setGlide, centreOn, centreOnMap, onPointerDown, onPointerMove, endDrag };
}

/** The map's CSS transform at an offset: drawn there, at ZOOM. */
export const mapTransform = (o: { x: number; y: number }) => `translate(${o.x}px, ${o.y}px) scale(${ZOOM})`;
