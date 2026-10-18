import { lookupCard, stadiumError, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { SMALL_CARD } from '../utils/layout';
import { isMyTurn } from '../utils/turn';
import { Card } from './Card';

/**
 * The Stadium card in play (shared by both players), face up to the left of your Active Pokémon at the bench's size,
 * with the hover preview and right-click view of any card; an empty dashed spot when there's none. It changes as soon
 * as another Stadium is played. A Stadium that can be used once during each turn (Lucky Stadium) has a Use button
 * above it on the player's turn.
 */
export function StadiumCard({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const stadium = view.stadium;
  const def = stadium && lookupCard(view.cards, stadium.card.defId);
  const usable = stadium !== null && isMyTurn(view) && !view.self.pendingChoice && stadiumError(stadium.card, view.stadiumUsedTurn, view.turn) === null;
  return (
    // Hangs off the active slot's left edge (index.css), level with its bottom, so the slot stays centred.
    <div className={`stadium-column absolute bottom-0 flex flex-col gap-1 ${SMALL_CARD}`}>
      <div className="flex items-center justify-center gap-1 text-xs text-slate-400">
        Stadium
        {usable && (
          <button
            className="rounded bg-slate-600 px-2 py-0.5 text-slate-100 transition hover:bg-slate-500 active:scale-95 disabled:cursor-progress"
            disabled={busy}
            onClick={() => send({ type: 'USE_STADIUM' })}
            title={def?.kind === 'trainer' ? def.text : undefined}
          >
            Use
          </button>
        )}
      </div>
      {stadium && def ? (
        // Keyed by the card, so a new Stadium replaces the old one at once.
        <Card key={stadium.card.uid} def={def} small />
      ) : (
        <div className="aspect-[63/88] w-full rounded-md border-2 border-dashed border-slate-700" title="No Stadium in play" />
      )}
    </div>
  );
}
