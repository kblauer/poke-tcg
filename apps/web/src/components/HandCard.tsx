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
      className={`touch-none rounded-lg transition active:scale-95 disabled:cursor-progress ${
        isDragging
          ? 'opacity-30'
          : loading
            ? '-translate-y-2 animate-pulse ring-2 ring-yellow-300'
            : selected
              ? '-translate-y-3 ring-2 ring-emerald-400'
              : busy
                ? ''
                : 'hover:-translate-y-1'
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      <Card def={def} />
    </button>
  );
}
