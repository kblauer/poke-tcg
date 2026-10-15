import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { lookupCard, type CardInstance, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import type { SlotId } from '../utils/slots';
import { playAction, targetLabel, targetsFor, whyNoTargets } from '../utils/targets';

/**
 * Playing cards from the hand, by click (select a card, then a highlighted slot; Esc cancels)
 * or by drag and drop. Spread `dnd` onto the DndContext.
 */
export function useCardPlay({
  view,
  send,
  busy,
  onDragStart,
}: {
  view: PlayerView;
  send: (a: GameAction) => void;
  /** A move is waiting on the server; clicks are ignored. */
  busy: boolean;
  /** Called when a drag begins, e.g. to hide the hover preview. */
  onDragStart?: () => void;
}) {
  const { hand } = view.self;
  /** Hand card picked by clicking; its valid slots are highlighted until a slot is clicked. */
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Why the last clicked card can't be played. */
  const [hint, setHint] = useState<string | null>(null);

  const sensors = useSensors(
    // A small movement threshold keeps plain clicks working as "select".
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Drop the selection once the card has left the hand (played) or the game moved on.
  useEffect(() => {
    if (selected && !hand.some((c) => c.uid === selected)) setSelected(null);
  }, [hand, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Plays a hand card onto a slot, if that's one of its targets. */
  function play(cardUid: string, slot: SlotId) {
    const card = hand.find((c) => c.uid === cardUid);
    if (!card || !targetsFor(view, card).includes(slot)) return;
    send(playAction(lookupCard(view.cards, card.defId), cardUid, slot));
    setSelected(null);
    setHint(null);
  }

  function clickHandCard(card: CardInstance) {
    if (busy) return;
    if (selected === card.uid) return setSelected(null);
    if (targetsFor(view, card).length === 0) {
      setSelected(null);
      return setHint(whyNoTargets(view, card));
    }
    setHint(null);
    setSelected(card.uid);
  }

  const dnd = {
    sensors,
    onDragStart: ({ active }: DragStartEvent) => {
      onDragStart?.();
      setSelected(null);
      setHint(null);
      setDragging(String(active.id));
    },
    onDragEnd: ({ active, over }: DragEndEvent) => {
      setDragging(null);
      if (over) play(String(active.id), over.id as SlotId);
    },
    onDragCancel: () => setDragging(null),
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
    hint,
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
