import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Fading out, about to be removed. */
  leaving: boolean;
}

/** How long a message stays up, then how long it takes to fade away. */
const SHOW_MS = 4000;
export const FADE_MS = 400;

/**
 * Short-lived messages (why a card can't be played, a move the server rejected). Each shows for a
 * few seconds and then fades away; messages that arrive meanwhile stack up under it. A message
 * that's already showing isn't repeated.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shown = useRef<Toast[]>([]);
  shown.current = toasts;
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (ms: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  };

  const push = useCallback((kind: ToastKind, text: string) => {
    if (shown.current.some((t) => t.kind === kind && t.text === text && !t.leaving)) return;
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, kind, text, leaving: false }]);
    later(SHOW_MS, () => setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t))));
    later(SHOW_MS + FADE_MS, () => setToasts((ts) => ts.filter((t) => t.id !== id)));
  }, []);

  return { toasts, push };
}
