import { lookupCard, stadiumError, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { SMALL_CARD } from '../utils/layout';
import { isMyTurn } from '../utils/turn';
import { Card } from './Card';

/**
 * The Stadium card in play (shared by both players), face up to the left of your Active Pokémon at the bench's size,
 * with the hover preview and right-click view of any card; an empty dashed spot when there's none. It changes as soon
 * as another Stadium is played. A Stadium that can be used once during each turn (Lucky Stadium) is used by clicking
 * it, like a benched Pokémon's power: on your turn it glows when it can be used, and a click uses it at once (it's the
 * only thing to do with it); when it can't be, a warning says why (`notify`).
 */
export function StadiumCard({ view, send, busy, notify }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean; notify: (message: string) => void }) {
  const stadium = view.stadium;
  const def = stadium && lookupCard(view.cards, stadium.card.defId);
  // Only Stadiums with a once-a-turn use (not Pokémon Tower) can be clicked.
  const clickable = stadium !== null && stadiumError(stadium.card, undefined, view.turn) === null && isMyTurn(view) && !view.self.pendingChoice;
  // Celadon City Gym also depends on your Active Pokémon.
  const error = stadium ? stadiumError(stadium.card, view.stadiumUsedTurn, view.turn, { me: view.self, cards: view.cards }) : null;
  const use = () => {
    if (busy) return;
    if (error) notify(`${def!.name}: ${error}`);
    else send({ type: 'USE_STADIUM' });
  };

  return (
    // Hangs off the active slot's left edge (index.css), level with its bottom, so the slot stays centred.
    <div className={`stadium-column absolute bottom-0 flex flex-col gap-1 ${SMALL_CARD}`}>
      <p className="text-center text-xs text-slate-400">Stadium</p>
      {stadium && def ? (
        <div
          data-keep-action
          // Keyed by the card, so a new Stadium replaces the old one at once.
          key={stadium.card.uid}
          className={`rounded-lg transition ${clickable ? 'cursor-pointer' : ''} ${
            clickable && !error ? '-translate-y-1 ring-4 ring-violet-400 shadow-[0_0_18px_3px_rgba(167,139,250,0.6)]' : ''
          }`}
          onClick={clickable ? use : undefined}
          title={clickable ? (error ?? `Use ${def.name}`) : undefined}
        >
          <Card def={def} small />
        </div>
      ) : (
        <div className="aspect-[63/88] w-full rounded-md border-2 border-dashed border-slate-700" title="No Stadium in play" />
      )}
    </div>
  );
}
