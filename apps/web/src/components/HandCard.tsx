import { useDraggable } from '@dnd-kit/core';
import type { CardDef, CardInstance } from '@poke-tcg/game-engine';
import { Card } from './Card';

export function HandCard({
  card,
  def,
  draggable,
  selected,
  loading,
  busy,
  onClick,
}: {
  card: CardInstance;
  def: CardDef;
  draggable: boolean;
  selected: boolean;
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
        isDragging ? 'opacity-30' : loading ? 'animate-pulse ring-2 ring-yellow-300' : selected ? 'ring-2 ring-emerald-400' : ''
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      {/* High resolution so the text is readable when the hand zooms the card. */}
      <Card def={def} highRes />
    </button>
  );
}
