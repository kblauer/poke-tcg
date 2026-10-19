import { useEffect, type RefObject } from 'react';

/**
 * Stops the page scrolling while `on` (a card viewed large: CardInspector, or held in CardGrid): the page can't scroll
 * or bounce, and a finger moving on a touch screen pans nothing. Inside `scrollable` a finger still scrolls it, when its
 * content is taller than it is. What was set before is put back when it's turned off or the component goes.
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
    const block = (e: TouchEvent) => {
      const el = scrollable?.current;
      if (el && el.contains(e.target as Node) && el.scrollHeight > el.clientHeight) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      [html, body].forEach((el, i) => {
        el.style.overflow = before[i]![0];
        el.style.overscrollBehavior = before[i]![1];
      });
      document.removeEventListener('touchmove', block);
    };
  }, [on, scrollable]);
}
