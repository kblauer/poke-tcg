import { PRIZE_COUNT } from '@poke-tcg/game-engine';
import { CardBack } from './CardBack';

/**
 * Prize cards, face down in 2 columns of 3. Like the card list, rows overlap so each card shows
 * a strip and the next row covers the rest. Taken prizes leave gaps, last ones first.
 */
export function PrizeCards({ count }: { count: number }) {
  return (
    <div className="w-28 shrink-0" title={`${count} prize card${count === 1 ? '' : 's'} left`}>
      <p className="mb-1 text-center text-xs text-slate-400">Prizes {count}</p>
      {/* The first two rows are as tall as the visible strip; the last is a full card. */}
      <div className="grid grid-cols-2 grid-rows-[1.5rem_1.5rem_auto] gap-x-1">
        {Array.from({ length: PRIZE_COUNT }, (_, i) => {
          const lastRow = i >= PRIZE_COUNT - 2;
          return (
            <div key={i} className="relative">
              {lastRow ? (
                // Keeps the last row card-height even after its prizes are taken.
                <div className="aspect-[63/88]">{i < count && <CardBack />}</div>
              ) : (
                i < count && (
                  <div className="absolute inset-x-0 top-0">
                    <CardBack />
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
