import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Makes an element fill the window from where it starts down to the bottom (the header above it isn't
 * fixed, so it measures where the element starts rather than guessing). Returns a ref to put on it, which
 * measures when the element appears (even after a loading screen), and the height style. `bottom` is room left
 * under it (a CSS length: the layout's own padding below the page, so the page doesn't scroll).
 */
export function useWindowFill<T extends HTMLElement>(bottom = '0px') {
  const element = useRef<T | null>(null);
  const [top, setTop] = useState(0);
  const measure = useCallback(() => element.current && setTop(element.current.getBoundingClientRect().top + window.scrollY), []);
  const ref = useCallback(
    (el: T | null) => {
      element.current = el;
      measure();
    },
    [measure],
  );
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  return { ref, style: { height: `calc(100dvh - ${top}px - ${bottom})` } };
}
