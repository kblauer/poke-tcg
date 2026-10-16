import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

/** Drop id of the whole play area, where a dragged Trainer card is played. */
export const PLAY_AREA = 'play-area';

/** Both sides of the table. While a Trainer card is dragged, dropping it anywhere here plays it. */
export function PlayArea({ droppable, children }: { droppable: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAY_AREA, disabled: !droppable });
  const ring = !droppable ? '' : isOver ? 'ring-4 ring-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.6)]' : 'ring-2 ring-emerald-400/60';
  return (
    <div ref={setNodeRef} className={`relative space-y-4 rounded-lg transition ${ring}`}>
      {children}
      {droppable && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white shadow">
          Drop to play
        </span>
      )}
    </div>
  );
}
