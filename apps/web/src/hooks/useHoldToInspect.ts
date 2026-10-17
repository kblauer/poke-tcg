import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** How long a press must last to inspect an item instead of clicking it. */
const HOLD_MS = 350;
/** Moving further than this (px) while pressing is a scroll or drag, not a hold. */
const SLOP = 6;

/**
 * Press and hold to inspect: holding an item for HOLD_MS makes it `inspecting` until the press ends (anywhere),
 * and the click that ends the hold is swallowed (`clicked` returns false), so it doesn't also count as a click.
 * Spread `press(item)` onto the element and call `clicked()` first in its onClick.
 */
export function useHoldToInspect<T>() {
  const [inspecting, setInspecting] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** The current press turned into a hold: its click is swallowed. */
  const held = useRef(false);

  useEffect(() => {
    const release = () => {
      clearTimeout(timer.current);
      start.current = null;
      setInspecting(null);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  return {
    inspecting,
    press: (item: T) => ({
      onPointerDown(e: ReactPointerEvent) {
        if (e.button !== 0) return;
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          held.current = true;
          setInspecting(item);
        }, HOLD_MS);
      },
      onPointerMove(e: ReactPointerEvent) {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP) clearTimeout(timer.current);
      },
      // A long press on touch screens would open the browser's menu.
      onContextMenu(e: ReactMouseEvent) {
        if (held.current) e.preventDefault();
      },
    }),
    /** Whether a click is a real one (not the end of a hold). */
    clicked: () => {
      const real = !held.current;
      held.current = false;
      return real;
    },
  };
}
