import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { CARD_BACK } from '../utils/cardBack';

/** The card back behind an image still loading. */
const BACK: CSSProperties = { backgroundImage: `url(${CARD_BACK})`, backgroundSize: 'cover', backgroundPosition: 'center' };

/**
 * How many times a picture that fails to load is tried again, how long the first wait is (each wait twice the last) and
 * the longest wait: about a minute in all, since TCGdex's one server can turn requests away for a while when busy.
 */
const RETRIES = 6;
const RETRY_MS = 1000;
const RETRY_MAX_MS = 16_000;

/**
 * A card's image that shows the card back until it has loaded (the high-resolution ones especially take a moment).
 * The back is the image's background, removed once it's in, so it never shows through the card's rounded corners.
 * One that fails to load (TCGdex's server busy) is tried again a few times, a new image element each time (RETRIES),
 * rather than left on the card back; a retry's address carries its try number, so the browser asks again rather than
 * reusing the failed load (TCGdex's static server ignores the query).
 */
export function CardImage({ src, style, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A new image starts on the back again, unless the browser already has it, with its tries counted afresh.
  useLayoutEffect(() => {
    setLoaded(ref.current?.complete === true && ref.current.naturalWidth > 0);
    setAttempt(0);
  }, [src]);
  const retry = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(retry.current), []);
  return (
    <img
      key={attempt}
      ref={ref}
      src={attempt ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src}
      {...props}
      style={loaded ? style : { ...BACK, ...style }}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        onError?.(e);
        if (attempt >= RETRIES) return;
        window.clearTimeout(retry.current);
        retry.current = window.setTimeout(() => setAttempt((a) => a + 1), Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** attempt));
      }}
    />
  );
}
