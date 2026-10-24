import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed anywhere (a `keydown` listener on the window, bubble phase, the event left
 * to propagate), while `enabled`: dialogs, panels and menus closing, and a move in progress cancelling (the move
 * hooks). The listener follows `onEscape`, so the latest one is always called.
 */
export function useEscape(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, enabled]);
}
