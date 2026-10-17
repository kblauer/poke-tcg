import type { CardDef } from '@poke-tcg/game-engine';
import { useContext, useRef, type MouseEvent, type PointerEvent } from 'react';
import { PreviewContext } from '../components/PreviewContext';

/** How long a finger rests on a card before its preview opens. */
const HOLD_MS = 400;
/** Moving further than this first is a drag or a scroll, not a hold (px; dnd-kit starts a drag at 6). */
const HOLD_SLOP = 6;

/**
 * The card preview on a touch screen, which can't hover: holding a finger on the card shows it large
 * in the middle of the screen until the finger lifts. A mouse hovers instead (`onPointerEnter` here
 * ignores touch, whose taps would otherwise fake a hover that never ends). Letting go after the preview
 * opened doesn't count as a tap, so it doesn't select or play the card. Spread the result onto the card.
 */
export function useHoldPreview(def: CardDef) {
  const setPreview = useContext(PreviewContext);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  /** The preview opened from a hold: the click that ends it is swallowed. */
  const shown = useRef(false);

  const stop = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
    if (shown.current) setPreview(null);
  };

  return {
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setPreview({ def, x: e.clientX, y: e.clientY }),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setPreview(null),
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      stop();
      shown.current = false;
      const { clientX: x, clientY: y } = e;
      hold.current = {
        x,
        y,
        timer: setTimeout(() => {
          hold.current = null;
          shown.current = true;
          setPreview({ def, x, y, hold: true });
        }, HOLD_MS),
      };
    },
    onPointerMove: (e: PointerEvent) => {
      const h = hold.current;
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    // Capture phase, so the card's own click handler (select, play) never sees it.
    onClickCapture: (e: MouseEvent) => {
      if (!shown.current) return;
      shown.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    // A long press would open the browser's menu for the image instead (a right click still does).
    onContextMenu: (e: MouseEvent) => (hold.current || shown.current) && e.preventDefault(),
  };
}
