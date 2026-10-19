import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** How long a finger must stay on a card to inspect it. */
const HOLD_MS = 450;
/** Moving further than this (px) is a drag, not a hold. */
const SLOP = 8;

/**
 * Touch screens have no right-click, so holding a finger still on a card for HOLD_MS calls `onHold` (Card opens the
 * CardInspector with it, as right-click does). Mouse and pen presses are left alone. Spread the result onto the element.
 */
export function useTouchHold(onHold: (() => void) | undefined) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!onHold) return {};
  const stop = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return {
    onPointerDown(e: ReactPointerEvent) {
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        start.current = null;
        onHold();
      }, HOLD_MS);
    },
    onPointerMove(e: ReactPointerEvent) {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  };
}
