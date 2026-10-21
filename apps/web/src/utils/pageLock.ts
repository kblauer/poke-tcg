/** How many locks are holding the page still, and the page's own overflow settings from before the first. */
let locks = 0;
let saved: (readonly [string, string])[] = [];

/**
 * Stops the page (html and body) scrolling or bouncing until the returned release is called. Locks are counted, so
 * overlays that lock it can open and close in any order (a card inspected over a pack being opened, the battle
 * screen's): the page's own settings come back only when the last one goes, never a locked state saved by another.
 */
export function lockPage(): () => void {
  const els = [document.documentElement, document.body];
  if (locks++ === 0) {
    saved = els.map((el) => [el.style.overflow, el.style.overscrollBehavior] as const);
    for (const el of els) {
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks > 0) return;
    els.forEach((el, i) => {
      el.style.overflow = saved[i]![0];
      el.style.overscrollBehavior = saved[i]![1];
    });
  };
}
