import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

/** Drop id of the whole play area, where a dragged Trainer card is played. */
export const PLAY_AREA = 'play-area';

/**
 * Both sides of the table, filling the space the page gives it; the cards scale to fit (see
 * `.play-area-cards` in index.css). While a Trainer card is dragged, dropping it anywhere here plays it;
 * the table glows green while it's over it. Any dragged card (a Trainer, or an Energy or Pokémon for a
 * slot) that isn't over somewhere it can go turns the table red: letting go there plays nothing. `cards` lays out
 * and sizes what's inside (the phone layout's `.phone-cards` instead of `.play-area-cards`).
 */
export function PlayArea({
  droppable,
  drop,
  overlay,
  cards = 'play-area-cards flex h-full flex-col gap-3',
  children,
}: {
  /** A Trainer is being dragged: the whole table is its drop target. */
  droppable: boolean;
  /** While any card is dragged: whether letting go now plays it or cancels it. */
  drop: { over: boolean } | null;
  /** Shown over the table, centred on it (the coin flips). */
  overlay?: ReactNode;
  cards?: string;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: PLAY_AREA, disabled: !droppable });
  const isOver = drop?.over ?? false;
  // Dropping cancels (red); over the table a Trainer will be played (green). A card over a slot leaves the glow to the slot.
  const ring = !drop ? '' : !isOver ? 'ring-4 ring-red-500 shadow-[0_0_24px_rgba(239,68,68,0.5)]' : droppable ? 'ring-4 ring-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.6)]' : '';
  return (
    <div ref={setNodeRef} className={`relative min-h-0 flex-1 select-none rounded-lg transition [container-type:size] ${ring}`}>
      <div className={cards}>{children}</div>
      {overlay}
    </div>
  );
}
