import { useLayoutEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { CARD_BACK } from '../utils/cardBack';

/** The card back behind an image still loading. */
const BACK: CSSProperties = { backgroundImage: `url(${CARD_BACK})`, backgroundSize: 'cover', backgroundPosition: 'center' };

/**
 * A card's image that shows the card back until it has loaded (the high-resolution ones especially take a moment).
 * The back is the image's background, removed once it's in, so it never shows through the card's rounded corners.
 */
export function CardImage({ src, style, onLoad, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // A new image starts on the back again, unless the browser already has it.
  useLayoutEffect(() => setLoaded(ref.current?.complete === true && ref.current.naturalWidth > 0), [src]);
  return (
    <img
      ref={ref}
      src={src}
      {...props}
      style={loaded ? style : { ...BACK, ...style }}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );
}
