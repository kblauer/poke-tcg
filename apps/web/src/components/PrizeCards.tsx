import { PRIZE_COUNT } from '@poke-tcg/game-engine';
import { SIDE_COLUMN } from '../utils/layout';
import { CardBack } from './CardBack';

/** How much of each covered prize card shows: a fifth of a card's width. */
const STRIP = 'h-[calc(var(--card-sm,5rem)*0.2)]';

/**
 * Prize cards, face down in one column of 6, each the size of a benched Pokémon. Each card covers
 * all but a strip of the one before it, and the last is shown whole, level with the bench (the
 * board lines it up). `mirrored` (the CPU's side) turns the stack upside down: the whole card at
 * the top and the label underneath. Taken prizes leave gaps, last ones first, so the card before
 * a gap shows whole.
 */
export function PrizeCards({ count, mirrored = false }: { count: number; mirrored?: boolean }) {
  const label = <p className={`text-center text-xs text-slate-400 ${mirrored ? 'mt-1' : 'mb-1'}`}>Prizes {count}</p>;
  return (
    <div className={SIDE_COLUMN} title={`${count} prize card${count === 1 ? '' : 's'} left`}>
      {!mirrored && label}
      <div className={`flex ${mirrored ? 'flex-col-reverse' : 'flex-col'}`}>
        {Array.from({ length: PRIZE_COUNT }, (_, i) => {
          const last = i === PRIZE_COUNT - 1;
          return (
            <div key={i} className={last ? 'relative' : `relative ${STRIP}`}>
              {last ? (
                // Keeps the last card's place even after it's taken, so the stack stays level with the bench.
                <div className="aspect-[63/88]">{i < count && <CardBack />}</div>
              ) : (
                // A whole card hanging over the next places; the next card, drawn later, covers all but this strip.
                i < count && (
                  <div className={`absolute inset-x-0 ${mirrored ? 'bottom-0' : 'top-0'}`}>
                    <CardBack />
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {mirrored && label}
    </div>
  );
}
