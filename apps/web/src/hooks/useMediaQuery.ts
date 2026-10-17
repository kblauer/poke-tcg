import { useSyncExternalStore } from 'react';

/** Whether the CSS media query matches, updating as it changes (the window is resized or rotated). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
  );
}
