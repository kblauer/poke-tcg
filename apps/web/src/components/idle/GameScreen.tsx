import { generation } from '@poke-tcg/idle';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** FireRed's screen in game pixels (the GBA's 240x160): the map shows 15 by 10 tiles of it. */
export const GAME_WIDTH = 240;
export const GAME_HEIGHT = 160;
/** HeartGold's top screen (the DS's 256x192): the map shows 16 by 12 tiles of it. */
export const DS_WIDTH = 256;
export const DS_HEIGHT = 192;

/** The shown run's region's screen in game pixels (issue #170, step 5): FireRed's in Kanto, HeartGold's top screen in Johto. */
export const gameSize = () => (generation().gen === 2 ? { w: DS_WIDTH, h: DS_HEIGHT } : { w: GAME_WIDTH, h: GAME_HEIGHT });
/** The text box's (DialogueBox's) text size in game pixels (the user's: bigger than its usual 16px to match the screen's other text, but less than the battle text box's 10). */
export const DIALOGUE_TEXT = 6;
/** The window's height the game screen leaves for the page around it (the header and tick meter above, the move bars below). */
const RESERVED_HEIGHT = 200;
/** The least it's given of the window's height, however short the window. */
const MIN_HEIGHT = 320;

/**
 * The game screen's scale (the user's, pixel accurate: the map and the battle the same size, as big as fits): CSS pixels
 * per game pixel, the largest whole number of *device* pixels (display scaling counted, `devicePixelRatio`) whose
 * screen (240x160, or HGSS's 256x192: gameSize) fits the width `el` has and the window's height under the page's header, so every game pixel is the same
 * whole number of device pixels and nothing shimmers as the map pans. At least 1 device pixel. Measured again as the
 * width, the window or the display scaling changes.
 */
export function useGameScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const { w, h: gameH } = gameSize();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const h = Math.max(MIN_HEIGHT, window.innerHeight - RESERVED_HEIGHT);
      const device = Math.max(1, Math.floor(Math.min((el.clientWidth * dpr) / w, (h * dpr) / gameH)));
      setScale(device / dpr);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener('resize', fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [w, gameH]);
  return { ref, scale };
}

/** A length in CSS pixels on a whole device pixel (the map's pan), so the scaled pixels stay on the device's grid. */
export const onDevicePixel = (cssPx: number) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(cssPx * dpr) / dpr;
};

/**
 * The game screen (the map scenes and the battle screen, one size: the user's): a box of the region's screen (gameSize) at
 * useGameScale's scale, centred in the page's width; `children` drawn for that scale (nothing until it's measured).
 */
export function GameScreen({ className = '', style, onClick, children }: { className?: string; style?: CSSProperties; onClick?: () => void; children: (scale: number) => ReactNode }) {
  const { ref, scale } = useGameScale();
  const { w, h } = gameSize();
  return (
    <div ref={ref} className="w-full">
      <div className={`relative mx-auto overflow-hidden ${className}`} style={{ width: w * scale || '100%', height: h * scale || undefined, aspectRatio: scale ? undefined : `${w} / ${h}`, ...style }} onClick={onClick}>
        {scale > 0 && children(scale)}
      </div>
    </div>
  );
}
