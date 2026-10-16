import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

/** Drop id of the whole play area, where a dragged Trainer card is played. */
export const PLAY_AREA = 'play-area';

/**
 * Both sides of the table, filling the space the page gives it; the cards scale to fit (see
 * `.play-area-cards` in index.css). While a Trainer card is dragged, dropping it anywhere here plays it.
 * `overlay` floats over the bottom of the table (the Trainer being played, a search of the deck).
 */
export function PlayArea({ droppable, children, overlay }: { droppable: boolean; children: ReactNode; overlay?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAY_AREA, disabled: !droppable });
  const ring = !droppable ? '' : isOver ? 'ring-4 ring-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.6)]' : 'ring-2 ring-emerald-400/60';
  return (
    <div ref={setNodeRef} className={`relative min-h-0 flex-1 rounded-lg transition [container-type:size] ${ring}`}>
      <div className="play-area-cards flex h-full flex-col gap-3">{children}</div>
      {droppable && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white shadow">
          Drop to play
        </span>
      )}
      {overlay && <div className="absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit max-w-[min(42rem,100%)] flex-col gap-2 px-3 [&>*]:shadow-2xl [&>*]:shadow-black/70">{overlay}</div>}
    </div>
  );
}
