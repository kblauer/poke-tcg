import { useEffect } from 'react';

/** The viewport while the screen is locked: no zooming, and any zoom the player had is undone. */
const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

/**
 * Holds the page still while `on` (the phone battle screen): the page can't scroll, bounce or pull to refresh, and
 * pinching doesn't zoom (the viewport tag for most browsers, and Safari's gesture events, which ignore it). Undone when
 * it's turned off or the page goes. The board itself is `touch-none` too, so a drag on it never pans anything.
 */
export function useLockedScreen(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const { documentElement: html, body } = document;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = { html: html.style.cssText, body: body.style.cssText, viewport: meta?.content };
    for (const el of [html, body]) {
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
    }
    if (meta) meta.content = LOCKED_VIEWPORT;
    window.scrollTo(0, 0);
    const block = (e: Event) => e.preventDefault();
    // Two fingers on the screen is a pinch.
    const pinch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    document.addEventListener('gesturestart', block);
    document.addEventListener('touchmove', pinch, { passive: false });
    return () => {
      html.style.cssText = before.html;
      body.style.cssText = before.body;
      if (meta && before.viewport !== undefined) meta.content = before.viewport;
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('touchmove', pinch);
    };
  }, [on]);
}
