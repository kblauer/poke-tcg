import { useLayoutEffect, useRef } from 'react';
import { getPreviewWidth, previewPosition, zoomPreview } from '../utils/preview';
import { useFlair } from '../hooks/useFlair';
import type { Preview } from './PreviewContext';
import { CardImage } from './CardImage';
import { FlairBorder } from './FlairBorder';

/** The large hover preview, following the pointer. `onLost` hides it: called once the pointer has left the card it's for (`from`) or the window. */
export function CardPreview({ def, x, y, scrollZoom = true, from, mine = true, onLost }: Preview & { onLost: () => void }) {
  const border = useFlair(def.id, 'border', mine);
  const ref = useRef<HTMLDivElement>(null);

  // Follow the pointer and resize on scroll by styling the element directly,
  // so the board doesn't re-render on every mousemove or wheel tick.
  useLayoutEffect(() => {
    let px = x;
    let py = y;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const width = getPreviewWidth();
      const { left, top } = previewPosition(px, py, width);
      el.style.width = `${width}px`;
      el.style.transform = `translate(${left}px, ${top}px)`;
    };
    const onMove = (e: MouseEvent) => {
      if (from && (!from.isConnected || !from.contains(e.target as Node))) return onLost();
      px = e.clientX;
      py = e.clientY;
      place();
    };
    // The pointer leaving the window (no element is left under it).
    const onOut = (e: MouseEvent) => !e.relatedTarget && onLost();
    // Ctrl+wheel (and trackpad pinch) is left to the browser's zoom.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault(); // resize the preview instead of scrolling the page
      zoomPreview(e);
      place();
    };
    place();
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    if (scrollZoom) window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('wheel', onWheel);
    };
  }, [x, y, scrollZoom, from, onLost]);

  return (
    // Above everything, including the deck-search dialog (z-[1000]).
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[1100]" aria-hidden>
      {def.imageUrl ? (
        <div className="relative overflow-hidden rounded-xl">
          <CardImage src={`${def.imageUrl}/high.webp`} alt="" className="aspect-[63/88] w-full rounded-xl shadow-2xl ring-1 ring-black/40" />
          {border && <FlairBorder border={border} cardId={def.id} />}
        </div>
      ) : (
        <div className="aspect-[63/88] w-full rounded-xl bg-slate-800 p-4 text-lg font-semibold shadow-2xl">{def.name}</div>
      )}
    </div>
  );
}
