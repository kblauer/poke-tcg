import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

/** Drop id of the whole play area, where a dragged Trainer card is played. */
export const PLAY_AREA = 'play-area';

/**
 * Both sides of the table, filling the space the page gives it; the cards scale to fit (see
 * `.play-area-cards` in index.css). While a Trainer card is dragged, dropping it anywhere here plays it;
 * the table glows green with "Drop to play" while it's over it. Any dragged card (a Trainer, or an Energy or
 * Pokémon for a slot) that isn't over somewhere it can go turns the table red with "Drop to cancel":
 * letting go there plays nothing.
 */
export function PlayArea({
  droppable,
  drop,
  children,
}: {
  /** A Trainer is being dragged: the whole table is its drop target. */
  droppable: boolean;
  /** While any card is dragged: whether letting go now plays it (and how, e.g. "Drop to attach") or cancels it. */
  drop: { over: boolean; label: string } | null;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: PLAY_AREA, disabled: !droppable });
  const isOver = drop?.over ?? false;
  // Dropping cancels (red); over the table a Trainer will be played (green). A card over a slot leaves the glow to the slot.
  const ring = !drop ? '' : !isOver ? 'ring-4 ring-red-500 shadow-[0_0_24px_rgba(239,68,68,0.5)]' : droppable ? 'ring-4 ring-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.6)]' : '';
  return (
    <div ref={setNodeRef} className={`relative min-h-0 flex-1 rounded-lg transition [container-type:size] ${ring}`}>
      <div className="play-area-cards flex h-full flex-col gap-3">{children}</div>
      {drop && (
        <span
          className={`pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded px-3 py-1 text-sm font-semibold text-white shadow ${isOver ? 'bg-emerald-500' : 'bg-red-600'}`}
        >
          {isOver ? drop.label : 'Drop to cancel'}
        </span>
      )}
    </div>
  );
}
