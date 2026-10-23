/** How many locks are holding the page still, and the page's own overflow settings from before the first. */
let locks = 0;
let saved: (readonly [string, string])[] = [];

/**
 * Stops the page (html and body) scrolling or bouncing until the returned release is called. Locks are counted, so
 * overlays that lock it can open and close in any order (a card inspected over a pack being opened, the battle
 * screen's): the page's own settings come back only when the last one goes, never a locked state saved by another.
 * Only html's overflow is hidden: hiding body's too makes body a scroll box of its own (its overflow no longer passes up
 * to the window), and the sticky top bar and site menu would stick to it instead of the window, scrolled off the top
 * of a page opened lower down (a pack opened from the bottom of the Packs tab).
 */
export function lockPage(): () => void {
  const els = [document.documentElement, document.body];
  if (locks++ === 0) {
    saved = els.map((el) => [el.style.overflow, el.style.overscrollBehavior] as const);
    document.documentElement.style.overflow = 'hidden';
    for (const el of els) el.style.overscrollBehavior = 'none';
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
