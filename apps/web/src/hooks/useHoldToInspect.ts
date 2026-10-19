import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** How long a press must last to inspect an item instead of clicking it. */
const HOLD_MS = 350;
/** Moving further than this (px) while pressing is a scroll or drag, not a hold. */
const SLOP = 6;

/**
 * Press and hold to inspect: holding an item for HOLD_MS makes it `inspecting` until the press ends (anywhere).
 * The click that ends the hold is
 * swallowed (`clicked` returns false), so it doesn't also count as a click. Spread `press(item)` onto the element
 * and call `clicked()` first in its onClick. `onTouchHeld`: called with the item when a finger lets go of a hold (a
 * phone has no right-click, so the deck builder opens the card in the CardInspector then).
 */
export function useHoldToInspect<T>(onTouchHeld?: (item: T) => void) {
  const [inspecting, setInspecting] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** The current press turned into a hold: its click is swallowed. */
  const held = useRef(false);
  /** The item held by a finger, if the current press is one. */
  const touchHeld = useRef<T | null>(null);
  const onTouchHeldRef = useRef(onTouchHeld);
  onTouchHeldRef.current = onTouchHeld;

  useEffect(() => {
    const release = (e: PointerEvent) => {
      clearTimeout(timer.current);
      start.current = null;
      setInspecting(null);
      const item = touchHeld.current;
      touchHeld.current = null;
      if (item !== null && e.type === 'pointerup') onTouchHeldRef.current?.(item);
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
        touchHeld.current = null;
        start.current = { x: e.clientX, y: e.clientY };
        clearTimeout(timer.current);
        const touch = e.pointerType === 'touch';
        timer.current = window.setTimeout(() => {
          held.current = true;
          if (touch) touchHeld.current = item;
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
