import type { CardLibrary, InPlayPokemon, PlayerView, Target } from '@poke-tcg/game-engine';
import { DeckAndDiscard } from './DeckAndDiscard';
import { PrizeCards } from './PrizeCards';
import { Slot } from './Slot';

/**
 * The CPU's side, mirrored both ways from the player's, as if sitting across the table: deck
 * above the discard pile on the left, prizes on the right, bench on top and active nearest the middle.
 * While an effect asks for one of the CPU's Pokémon (`pick`), the ones it can choose are highlighted and clicked to choose them.
 */
export function OpponentArea({
  opponent,
  cards,
  pick,
}: {
  opponent: PlayerView['opponent'];
  cards: CardLibrary;
  pick: { options: Target[]; pick: (t: Target) => void } | null;
}) {
  const slot = (id: string, target: Target, pokemon: InPlayPokemon | null, large?: boolean) => {
    const choosable = pick?.options.includes(target) ?? false;
    return (
      <Slot
        key={id}
        id={id}
        pokemon={pokemon}
        cards={cards}
        large={large}
        highlight={choosable ? 'target' : null}
        label={choosable ? 'Choose' : null}
        dimmed={pick !== null && pokemon !== null && !choosable}
        onClick={choosable ? () => pick!.pick(target) : undefined}
      />
    );
  };
  return (
    <section className="flex min-h-0 flex-1 items-center gap-3 rounded-lg bg-slate-900 p-3">
      <DeckAndDiscard deckCount={opponent.deckCount} discard={opponent.discard} cards={cards} mirrored />
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="text-sm text-slate-400">
          CPU · hand {opponent.handCount}
        </h3>
        <div className="flex justify-center gap-2">
          {opponent.bench.map((p, i) => slot(`cpu-bench-${i}`, i, p))}
        </div>
        <div className="flex justify-center">
          {slot('cpu-active', 'active', opponent.active, true)}
        </div>
      </div>
      <PrizeCards count={opponent.prizeCount} />
    </section>
  );
}
