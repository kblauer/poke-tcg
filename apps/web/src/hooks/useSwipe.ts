import { useRef, type TouchEvent } from 'react';

/** How far (px) a finger must travel sideways to count as a swipe. */
const DISTANCE = 60;
/** A swipe is quick: a finger held longer is a hold or a drag. */
const MAX_MS = 600;

/**
 * A quick sideways swipe on a touch screen, mostly sideways (at least twice as far across as up or down, so scrolling
 * a list doesn't count). Spread the handlers on the element; `onRight` is a finger moving from left to right.
 */
export function useSwipe({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      start.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null;
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!s || !t || e.timeStamp - s.at > MAX_MS) return;
      const dx = t.clientX - s.x;
      if (Math.abs(dx) < DISTANCE || Math.abs(t.clientY - s.y) * 2 > Math.abs(dx)) return;
      (dx > 0 ? onRight : onLeft)?.();
    },
  };
}
