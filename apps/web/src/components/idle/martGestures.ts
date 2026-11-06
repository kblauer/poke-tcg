import { useEffect, useRef, type RefObject } from 'react';

/** What a tap or click outside the buy screen leaves alone: the page's own controls, which do what they do. */
const CONTROLS = 'button, a, input, select, textarea, label, [role="button"], [data-music]';

/**
 * A finger dragged over `ref` (the user's, 2026-11-06: the buy screens scrolled on a phone as the wheel scrolls them):
 * every `step` CSS pixels dragged, `onStep(1)` for a drag up or left (the list on, the next page), `onStep(-1)` for one
 * down or right; `axis` 'y' only up and down, 'xy' the way it mostly goes. While `enabled` the page doesn't scroll under
 * it (touch-action), and the tap that ends a drag doesn't choose the row it ends on. A mouse is left to its wheel.
 */
export function useDragSteps(ref: RefObject<HTMLElement | null>, enabled: boolean, step: number, onStep: (by: 1 | -1) => void, axis: 'y' | 'xy' = 'y') {
  const latest = useRef(onStep);
  latest.current = onStep;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || step <= 0) return;
    let from: { id: number; x: number; y: number } | null = null;
    let dragged = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      from = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dragged = false;
    };
    const move = (e: PointerEvent) => {
      if (!from || e.pointerId !== from.id) return;
      const dx = from.x - e.clientX;
      const dy = from.y - e.clientY;
      const d = axis === 'xy' && Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const by = Math.trunc(d / step);
      if (!by) return;
      dragged = true;
      // What's left over carries on to the next step.
      if (axis === 'xy' && Math.abs(dx) > Math.abs(dy)) from.x -= by * step;
      else from.y -= by * step;
      for (let i = 0; i < Math.abs(by); i++) latest.current(by > 0 ? 1 : -1);
    };
    const up = (e: PointerEvent) => from && e.pointerId === from.id && (from = null);
    const click = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const touchAction = el.style.touchAction;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    return () => {
      el.style.touchAction = touchAction;
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
    };
  }, [ref, enabled, step, axis]);
}

/**
 * A tap or click outside `ref` (the buy screen and what's over it), not on one of the page's controls: `onOutside`
 * (the user's, 2026-11-06: closing the buy screen). The click that opened it doesn't count.
 */
export function useOutsideTap(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  useEffect(() => {
    const since = performance.now();
    const click = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (e.timeStamp < since || !target?.isConnected || ref.current?.contains(target) || target.closest(CONTROLS)) return;
      latest.current();
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [ref]);
}
