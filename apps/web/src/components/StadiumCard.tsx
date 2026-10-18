import { lookupCard, stadiumError, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState } from 'react';
import { SMALL_CARD } from '../utils/layout';
import { isMyTurn } from '../utils/turn';
import { Card } from './Card';
import { SlotMenu } from './SlotMenu';

const useButton = 'w-full rounded bg-violet-700 px-2 py-1 text-left text-xs transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700';

/**
 * The Stadium card in play (shared by both players), face up to the left of your Active Pokémon at the bench's size,
 * with the hover preview and right-click view of any card; an empty dashed spot when there's none. It changes as soon
 * as another Stadium is played. A Stadium that can be used once during each turn (Lucky Stadium) is used like a
 * Pokémon Power: on your turn it glows when it can be used, and clicking it opens a SlotMenu under it with Use (or
 * why it can't be). A click anywhere else closes the menu.
 */
export function StadiumCard({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const stadium = view.stadium;
  const def = stadium && lookupCard(view.cards, stadium.card.defId);
  // Only Stadiums with a once-a-turn use (not Pokémon Tower) have a menu.
  const usableKind = stadium !== null && stadiumError(stadium.card, undefined, view.turn) === null;
  const canOpen = usableKind && isMyTurn(view) && !view.self.pendingChoice;
  const error = stadium ? stadiumError(stadium.card, view.stadiumUsedTurn, view.turn) : null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Closed when it can't be used any more (the turn moved on, it was used), and by a click outside it.
  useEffect(() => {
    if (!canOpen) setOpen(false);
  }, [canOpen, stadium?.card.uid]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);

  return (
    // Hangs off the active slot's left edge (index.css), level with its bottom, so the slot stays centred.
    <div ref={ref} className={`stadium-column absolute bottom-0 flex flex-col gap-1 ${SMALL_CARD}`}>
      <p className="text-center text-xs text-slate-400">Stadium</p>
      {stadium && def ? (
        <div
          data-keep-action
          // Keyed by the card, so a new Stadium replaces the old one at once.
          key={stadium.card.uid}
          className={`relative rounded-lg transition ${canOpen ? 'cursor-pointer' : ''} ${
            canOpen && !error ? '-translate-y-1 ring-4 ring-violet-400 shadow-[0_0_18px_3px_rgba(167,139,250,0.6)]' : ''
          }`}
          onClick={canOpen ? () => setOpen((o) => !o) : undefined}
          title={canOpen ? `Use ${def.name}` : undefined}
        >
          <Card def={def} small />
          {open && (
            <SlotMenu>
              <button
                className={useButton}
                disabled={busy || error !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  send({ type: 'USE_STADIUM' });
                }}
                title={def.kind === 'trainer' ? def.text : undefined}
              >
                Use {def.name}
              </button>
              {error && <p className="text-slate-400">{error}.</p>}
            </SlotMenu>
          )}
        </div>
      ) : (
        <div className="aspect-[63/88] w-full rounded-md border-2 border-dashed border-slate-700" title="No Stadium in play" />
      )}
    </div>
  );
}
