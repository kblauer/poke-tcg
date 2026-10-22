import { useDraggable } from '@dnd-kit/core';
import type { CardDef, CardInstance } from '@poke-tcg/game-engine';
import { Card } from './Card';

export function HandCard({
  card,
  def,
  draggable,
  playable = false,
  selected,
  pick,
  loading,
  busy,
  onClick,
}: {
  card: CardInstance;
  def: CardDef;
  draggable: boolean;
  /** It can be played now: a pulsing blue outline (`.playable-pulse`), under any other mark. */
  playable?: boolean;
  selected: boolean;
  /** While a Trainer asks for cards from the hand: whether this one can be picked, and whether it is. */
  pick?: 'option' | 'picked' | 'unavailable';
  loading: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: card.uid, disabled: !draggable });
  return (
    <button
      ref={setNodeRef}
      data-keep-action
      {...listeners}
      {...attributes}
      onClick={onClick}
      disabled={busy}
      // Moving and growing on hover is done by Hand; this only marks the card's state.
      className={`block touch-none rounded-lg shadow-lg shadow-black/60 transition active:scale-95 disabled:cursor-progress ${
        isDragging
          ? 'opacity-30'
          : loading
            ? 'animate-pulse ring-2 ring-yellow-300'
            : pick === 'picked'
              ? 'ring-4 ring-yellow-300'
              : pick === 'option'
                ? 'ring-2 ring-emerald-400'
                : pick === 'unavailable'
                  ? 'opacity-40'
                  : selected
                    ? 'ring-2 ring-emerald-400'
                    : playable
                      ? 'playable-pulse'
                      : ''
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      {/* High resolution so the text is readable when the hand zooms the card. */}
      <Card def={def} highRes />
    </button>
  );
}
