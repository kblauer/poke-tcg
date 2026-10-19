import { useEffect, type RefObject } from 'react';

/** A finger moving less than this (px) is a tap, not a scroll: it's left alone, as some browsers drop a tap whose moves are cancelled. */
const TAP_SLOP = 10;

/**
 * Stops the page scrolling while `on` (a card viewed large: CardInspector, or held in CardGrid): the page can't scroll
 * or bounce, and a finger moving on a touch screen pans nothing. Inside `scrollable` a finger still scrolls it, or a
 * scrolling area within it, when there's more to see. What was set before is put back when it's turned off or the component goes.
 */
export function useScrollLock(on: boolean, scrollable?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!on) return;
    const { documentElement: html, body } = document;
    const before = [html, body].map((el) => [el.style.overflow, el.style.overscrollBehavior] as const);
    for (const el of [html, body]) {
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
    }
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => (start = e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null);
    const block = (e: TouchEvent) => {
      const t = e.touches[0];
      if (start && t && e.touches.length === 1 && Math.hypot(t.clientX - start.x, t.clientY - start.y) < TAP_SLOP) return;
      const root = scrollable?.current;
      if (root?.contains(e.target as Node)) {
        // From the finger up to `scrollable`, anything that scrolls and has more to show may scroll.
        for (let el = e.target as HTMLElement | null; el; el = el === root ? null : el.parentElement) {
          if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
        }
      }
      e.preventDefault();
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      [html, body].forEach((el, i) => {
        el.style.overflow = before[i]![0];
        el.style.overscrollBehavior = before[i]![1];
      });
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', block);
    };
  }, [on, scrollable]);
}
