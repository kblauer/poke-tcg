import type { CardLibrary, PlayerView } from '@poke-tcg/game-engine';
import { DeckAndDiscard } from './DeckAndDiscard';
import { PrizeCards } from './PrizeCards';
import { Slot } from './Slot';

/**
 * The CPU's side, mirrored both ways from the player's, as if sitting across the table: deck
 * above the discard pile on the left, prizes on the right, bench on top and active nearest the middle.
 */
export function OpponentArea({ opponent, cards }: { opponent: PlayerView['opponent']; cards: CardLibrary }) {
  return (
    <section className="flex gap-3 rounded-lg bg-slate-900 p-3">
      <DeckAndDiscard deckCount={opponent.deckCount} discard={opponent.discard} cards={cards} deckOnTop />
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="text-sm text-slate-400">
          CPU · hand {opponent.handCount}
        </h3>
        <div className="flex justify-center gap-2">
          {opponent.bench.map((p, i) => (
            <Slot key={i} id={`cpu-bench-${i}`} pokemon={p} cards={cards} />
          ))}
        </div>
        <div className="flex justify-center">
          <Slot id="cpu-active" pokemon={opponent.active} cards={cards} large />
        </div>
      </div>
      <PrizeCards count={opponent.prizeCount} />
    </section>
  );
}
