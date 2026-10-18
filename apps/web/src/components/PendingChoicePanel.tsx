import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { lookupCard, type GameAction, type PendingChoiceView, type PlayerView } from '@poke-tcg/game-engine';
import { useContext, useState } from 'react';
import { Card } from './Card';
import { PreviewContext } from './PreviewContext';

/**
 * Finishing a search started by a Trainer or attack: take a card from the deck (Computer Search,
 * Pokémon Trader, Energy Search, Call for Family), pick one from the discard pile (Recycle), or put
 * the top cards back in any order (Pokédex, Prophecy). Only this player sees the deck's cards.
 */
export function PendingChoicePanel({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const choice = view.self.pendingChoice;
  const setPreview = useContext(PreviewContext);
  if (!choice) return null;
  return (
    // Hovered cards here still show the preview, but the wheel scrolls the page rather than resizing it.
    <PreviewContext.Provider value={(p) => setPreview(p && { ...p, scrollZoom: false })}>
      <section data-keep-action className="space-y-2 rounded-lg bg-slate-800 p-3 ring-2 ring-yellow-400/60">
        <p className="text-sm font-semibold">{choice.prompt}</p>
        {choice.kind === 'pickFromDeck' || choice.kind === 'pickFromDiscard' || choice.kind === 'pickFromHand' || choice.kind === 'pickAttached' ? (
          <PickFromDeck key={view.version} choice={choice} view={view} send={send} busy={busy} />
        ) : null}
        {choice.kind === 'arrangeTop' ? <ArrangeTop key={view.version} choice={choice} view={view} send={send} busy={busy} /> : null}
        {choice.kind === 'challenge' ? (
          <div className="flex justify-center gap-2">
            <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE', count: 1 })}>
              Accept
            </button>
            <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE', count: 0 })}>
              Decline
            </button>
          </div>
        ) : null}
        {choice.kind === 'oppHand' ? (
          // Rocket's Sneak Attack: the whole hand is shown; only its Trainer cards can be picked.
          <>
            <div className="flex max-h-[60vh] flex-wrap justify-center gap-2 overflow-y-auto p-1">
              {choice.cards.map((c) => {
                const pickable = choice.options.some((o) => o.uid === c.uid);
                return (
                  <button
                    key={c.uid}
                    disabled={busy || !pickable}
                    className={`rounded-lg transition ${pickable ? 'hover:-translate-y-1' : 'cursor-default opacity-50'}`}
                    onClick={() => send({ type: 'RESOLVE_CHOICE', cardUid: c.uid })}
                  >
                    <Card def={lookupCard(view.cards, c.defId)} highRes />
                  </button>
                );
              })}
            </div>
            {choice.options.length === 0 && (
              <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
                Done
              </button>
            )}
          </>
        ) : null}
        {choice.kind === 'drawCount' ? (
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: choice.max + 1 }, (_, n) => (
              <button key={n} className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE', count: n })}>
                Draw {n}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </PreviewContext.Provider>
  );
}

/**
 * Click a card to take it: from the deck, the discard pile (Recycle), the hand (Special Delivery) or a Pokémon's
 * Energy (Pure Body). A choice that's `optional` (Chain Reaction) can be skipped.
 */
function PickFromDeck({
  choice,
  view,
  send,
  busy,
}: {
  choice: Extract<PendingChoiceView, { kind: 'pickFromDeck' | 'pickFromDiscard' | 'pickFromHand' | 'pickAttached' }>;
  view: PlayerView;
  send: (a: GameAction) => void;
  busy: boolean;
}) {
  if (choice.options.length === 0) {
    return (
      <button className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
        Nothing to take – shuffle and continue
      </button>
    );
  }
  return (
    <>
      <div className="flex max-h-[60vh] flex-wrap justify-center gap-2 overflow-y-auto p-1">
        {choice.options.map((c) => (
          <button key={c.uid} disabled={busy} className="rounded-lg transition hover:-translate-y-1" onClick={() => send({ type: 'RESOLVE_CHOICE', cardUid: c.uid })}>
            <Card def={lookupCard(view.cards, c.defId)} highRes />
          </button>
        ))}
      </div>
      {choice.optional && (
        <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
          Skip
        </button>
      )}
    </>
  );
}

type ArrangeCard = Extract<PendingChoiceView, { kind: 'arrangeTop' }>['cards'][number];

function ArrangeTop({ choice, view, send, busy }: { choice: Extract<PendingChoiceView, { kind: 'arrangeTop' }>; view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const [order, setOrder] = useState(choice.cards);
  const move = (i: number, by: number) => setOrder((o) => arrayMove(o, i, i + by));
  // Its own DndContext, so these drags don't reach the board's drop handling. The distance keeps clicks on the arrows working.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((o) => arrayMove(o, o.findIndex((c) => c.uid === active.id), o.findIndex((c) => c.uid === over.id)));
  };
  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((c) => c.uid)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-2">
            {order.map((c, i) => (
              <SortableCard key={c.uid} card={c} index={i} count={order.length} view={view} move={move} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500"
        disabled={busy}
        onClick={() => send({ type: 'RESOLVE_CHOICE', order: order.map((c) => c.uid) })}
      >
        Put them back
      </button>
    </div>
  );
}

/** One card in the Pokédex order: drag it to a new place, or nudge it with the arrows. */
function SortableCard({ card, index, count, view, move }: { card: ArrangeCard; index: number; count: number; view: PlayerView; move: (i: number, by: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.uid });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex cursor-grab touch-none flex-col items-center gap-1 active:cursor-grabbing ${isDragging ? 'relative z-10 opacity-80' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="text-xs text-slate-400">{index === 0 ? 'Top' : index + 1}</span>
      <Card def={lookupCard(view.cards, card.defId)} highRes />
      <div className="flex gap-1">
        <button className="flex rounded bg-slate-600 px-1 hover:bg-slate-500 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
          <ArrowBackIcon sx={{ fontSize: 16 }} />
        </button>
        <button className="flex rounded bg-slate-600 px-1 hover:bg-slate-500 disabled:opacity-30" disabled={index === count - 1} onClick={() => move(index, 1)} aria-label="Move down">
          <ArrowForwardIcon sx={{ fontSize: 16 }} />
        </button>
      </div>
    </div>
  );
}
