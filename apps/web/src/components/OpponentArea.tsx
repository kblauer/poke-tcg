import type { CardLibrary, PlayerView } from '@poke-tcg/game-engine';
import { Slot } from './Slot';

/** The CPU's side. It mirrors the player's: bench on top, active nearest the middle. */
export function OpponentArea({ opponent, cards }: { opponent: PlayerView['opponent']; cards: CardLibrary }) {
  return (
    <section className="space-y-3 rounded-lg bg-slate-900 p-3">
      <h3 className="text-sm text-slate-400">
        CPU · hand {opponent.handCount} · deck {opponent.deckCount} · prizes {opponent.prizeCount}
      </h3>
      <div className="flex justify-center gap-2">
        {opponent.bench.map((p, i) => (
          <Slot key={i} id={`cpu-bench-${i}`} pokemon={p} cards={cards} />
        ))}
      </div>
      <div className="flex justify-center">
        <Slot id="cpu-active" pokemon={opponent.active} cards={cards} large />
      </div>
    </section>
  );
}
