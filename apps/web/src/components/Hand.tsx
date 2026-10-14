import { lookupCard, type CardInstance, type CardLibrary, type GameAction } from '@poke-tcg/game-engine';
import { HandCard } from './HandCard';

export function Hand({
  hand,
  cards,
  selected,
  pending,
  canPlay,
  onCardClick,
}: {
  hand: CardInstance[];
  cards: CardLibrary;
  /** uid of the card picked by clicking. */
  selected: string | null;
  pending: GameAction | null;
  /** Whether the card has somewhere to go (makes it draggable). */
  canPlay: (card: CardInstance) => boolean;
  onCardClick: (card: CardInstance) => void;
}) {
  const busy = pending !== null;
  return (
    <div>
      <h3 className="mb-2 text-sm text-slate-400">
        Your hand {selected && <span className="text-emerald-300">· click a highlighted slot (Esc to cancel)</span>}
      </h3>
      <div className="flex flex-wrap gap-2">
        {hand.map((c) => (
          <HandCard
            key={c.uid}
            card={c}
            def={lookupCard(cards, c.defId)}
            draggable={!busy && canPlay(c)}
            selected={selected === c.uid}
            loading={pending !== null && 'cardUid' in pending && pending.cardUid === c.uid}
            busy={busy}
            onClick={() => onCardClick(c)}
          />
        ))}
      </div>
    </div>
  );
}
