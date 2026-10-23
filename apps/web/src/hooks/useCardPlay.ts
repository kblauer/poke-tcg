import { pointerWithin, PointerSensor, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { lookupCard, type CardInstance, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { HAND_ZONE } from '../components/Hand';
import { PLAY_AREA } from '../components/PlayArea';
import type { SlotId } from '../utils/slots';
import { playAction, targetLabel, targetsFor, whyNoTargets } from '../utils/targets';
import { useEscape } from './useEscape';

/**
 * What the dragged card is over: whatever is under the pointer, else a slot the card overlaps. The
 * play area (Trainers) counts only under the pointer: the card hangs over the table while the pointer
 * is still on the hand, where letting go cancels. With the pointer over the hand, nothing counts: the
 * card is put back, even though the dragged image overlaps the bench above.
 */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  // Back over the hand: the card is being put back, whatever it overlaps.
  if (underPointer.some((c) => c.id === HAND_ZONE)) return [];
  // A slot under the pointer before the play area round it (a Trainer dropped onto a Pokémon).
  const slots = underPointer.filter((c) => c.id !== PLAY_AREA);
  return slots.length ? slots : underPointer.length ? underPointer : rectIntersection(args).filter((c) => c.id !== PLAY_AREA && c.id !== HAND_ZONE);
};

/**
 * Playing cards from the hand, by click (select a card, then a highlighted slot; Esc cancels)
 * or by drag and drop. Trainer cards are dropped anywhere on the play area (see onDropOnPlayArea), or onto the Pokémon
 * they're for (onDropOnSlot).
 * Spread `dnd` onto the DndContext.
 */
export function useCardPlay({
  view,
  send,
  busy,
  onDragStart,
  onDropOnPlayArea,
  onDropOnSlot,
  notify,
}: {
  view: PlayerView;
  send: (a: GameAction) => void;
  /** A move is waiting on the server; clicks are ignored. */
  busy: boolean;
  /** Called when a drag begins, e.g. to hide the hover preview. */
  onDragStart?: () => void;
  /** Called when a card is dropped anywhere on the play area (a Trainer card being played). */
  onDropOnPlayArea?: (card: CardInstance) => void;
  /** Called when a card is dropped on a slot (either side's, by its drop id); true if that played it (a Trainer onto a Pokémon). */
  onDropOnSlot?: (card: CardInstance, slot: string) => boolean;
  /** Tells the player something, e.g. why the clicked card can't be played. */
  notify?: (message: string) => void;
}) {
  const { hand } = view.self;
  /** Hand card picked by clicking; its valid slots are highlighted until a slot is clicked. */
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** The drop target under the dragged card (an enabled slot or the play area), if any. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const sensors = useSensors(
    // A small movement threshold keeps plain clicks working as "select".
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Drop the selection once the card has left the hand (played) or the game moved on.
  useEffect(() => {
    if (selected && !hand.some((c) => c.uid === selected)) setSelected(null);
  }, [hand, selected]);

  useEscape(() => setSelected(null));

  /** Plays a hand card onto a slot, if that's one of its targets. */
  function play(cardUid: string, slot: SlotId) {
    const card = hand.find((c) => c.uid === cardUid);
    if (!card || !targetsFor(view, card).includes(slot)) return;
    send(playAction(view, card, slot));
    setSelected(null);
  }

  function clickHandCard(card: CardInstance) {
    if (busy) return;
    if (selected === card.uid) return setSelected(null);
    if (targetsFor(view, card).length === 0) {
      setSelected(null);
      return notify?.(whyNoTargets(view, card));
    }
    setSelected(card.uid);
  }

  const dnd = {
    sensors,
    collisionDetection,
    onDragStart: ({ active }: DragStartEvent) => {
      onDragStart?.();
      setSelected(null);
      setDragging(String(active.id));
    },
    onDragOver: ({ over }: DragOverEvent) => setDropTarget(over ? String(over.id) : null),
    onDragEnd: ({ active, over }: DragEndEvent) => {
      setDragging(null);
      setDropTarget(null);
      const card = hand.find((c) => c.uid === active.id);
      if (over?.id === PLAY_AREA) {
        if (card) onDropOnPlayArea?.(card);
      } else if (over && !(card && onDropOnSlot?.(card, String(over.id)))) {
        // A slot, unless the drop there already played it (a Trainer onto a Pokémon).
        play(String(active.id), over.id as SlotId);
      }
    },
    onDragCancel: () => {
      setDragging(null);
      setDropTarget(null);
    },
  };

  /** The card being dragged, or else the selected one. */
  const heldCard = hand.find((c) => c.uid === (dragging ?? selected));
  /** Slots the held card can be played on. */
  const highlighted = new Set(heldCard ? targetsFor(view, heldCard) : []);
  /** What playing the held card on a highlighted slot does: "Play", "Attach" or "Evolve". */
  const heldLabel = heldCard ? targetLabel(lookupCard(view.cards, heldCard.defId)) : null;

  /** Click handler for a slot, when clicking it would play the selected card. */
  const slotClick = (slot: SlotId) => (selected && highlighted.has(slot) ? () => play(selected, slot) : undefined);

  return {
    selected,
    dragging,
    /** Where the dragged card would land if dropped now; null means dropping cancels. */
    dropTarget,
    heldCard,
    highlighted,
    heldLabel,
    canPlay: (card: CardInstance) => targetsFor(view, card).length > 0,
    clickHandCard,
    slotClick,
    /** Drops the click selection. */
    deselect: () => setSelected(null),
    dnd,
  };
}
