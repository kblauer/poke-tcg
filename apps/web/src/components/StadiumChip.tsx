import { lookupCard, stadiumError, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { isMyTurn } from '../utils/turn';

/**
 * The Stadium card in play (shared by both players), shown in the turn bar with its text on hover. A
 * Stadium that can be used once during each turn (Lucky Stadium) has a Use button on the player's turn.
 */
export function StadiumChip({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  if (!view.stadium) return null;
  const def = lookupCard(view.cards, view.stadium.card.defId);
  const usable = isMyTurn(view) && !view.self.pendingChoice && stadiumError(view.stadium.card, view.stadiumUsedTurn, view.turn) === null;
  return (
    <span className="flex items-center gap-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-slate-600" title={def.kind === 'trainer' ? def.text : undefined}>
      Stadium: {def.name}
      {usable && (
        <button
          className="rounded bg-slate-600 px-2 py-0.5 transition hover:bg-slate-500 active:scale-95 disabled:cursor-progress"
          disabled={busy}
          onClick={() => send({ type: 'USE_STADIUM' })}
        >
          Use
        </button>
      )}
    </span>
  );
}
