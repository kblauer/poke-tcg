import { lookupCard, type GameAction, type PendingChoiceView, type PlayerView } from '@poke-tcg/game-engine';
import { useContext, useState } from 'react';
import { Card } from './Card';
import { PreviewContext } from './PreviewContext';

/**
 * Finishing a search started by a Trainer: take a card from the deck (Computer Search, Pokémon
 * Trader) or put the top cards back in any order (Pokédex). Only this player sees these cards.
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
        {choice.kind === 'pickFromDeck' ? <PickFromDeck key={view.version} choice={choice} view={view} send={send} busy={busy} /> : null}
        {choice.kind === 'arrangeTop' ? <ArrangeTop key={view.version} choice={choice} view={view} send={send} busy={busy} /> : null}
      </section>
    </PreviewContext.Provider>
  );
}

function PickFromDeck({ choice, view, send, busy }: { choice: Extract<PendingChoiceView, { kind: 'pickFromDeck' }>; view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  if (choice.options.length === 0) {
    return (
      <button className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
        Nothing to take – shuffle and continue
      </button>
    );
  }
  return (
    <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
      {choice.options.map((c) => (
        <button key={c.uid} disabled={busy} className="rounded-lg transition hover:-translate-y-1" onClick={() => send({ type: 'RESOLVE_CHOICE', cardUid: c.uid })}>
          <Card def={lookupCard(view.cards, c.defId)} small />
        </button>
      ))}
    </div>
  );
}

function ArrangeTop({ choice, view, send, busy }: { choice: Extract<PendingChoiceView, { kind: 'arrangeTop' }>; view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const [order, setOrder] = useState(choice.cards);
  const move = (i: number, by: number) =>
    setOrder((o) => {
      const next = [...o];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {order.map((c, i) => (
          <div key={c.uid} className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-400">{i === 0 ? 'Top' : i + 1}</span>
            <Card def={lookupCard(view.cards, c.defId)} small />
            <div className="flex gap-1">
              <button className="rounded bg-slate-700 px-2 text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ←
              </button>
              <button className="rounded bg-slate-700 px-2 text-xs disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                →
              </button>
            </div>
          </div>
        ))}
      </div>
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
