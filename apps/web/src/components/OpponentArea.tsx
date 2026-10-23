import { lookupCard, type CardLibrary, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { Card } from './Card';
import type { ReactNode } from 'react';
import { DeckAndDiscard } from './DeckAndDiscard';
import { useCosmetics } from '../hooks/useCosmetics';
import { FloatingDialog } from './FloatingDialog';
import { Playmat } from './Playmat';
import { PrizeCards } from './PrizeCards';
import { Slot } from './Slot';

/** Pokémon on one side that the CPU's card just changed, and the view's version (each move glows once). */
export interface Spotlight {
  targets: Target[];
  stamp: number;
  /** When they start to glow, in ms: after the card shown has burst away (PLAYED_CARD_BURST_MS), or at once. */
  delay: number;
}

/**
 * The CPU's side, mirrored both ways from the player's, as if sitting across the table: deck
 * above the discard pile on the left, prizes on the right, bench on top and active nearest the middle.
 * While an effect asks for one of the CPU's Pokémon (`pick`), the ones it can choose are highlighted and clicked to choose them.
 * When it asks for several (Gigashock), the ones clicked so far are `picked`.
 */
export function OpponentArea({
  opponent,
  cards,
  pick,
  lunge = null,
  spotlight = null,
  dialog,
}: {
  opponent: PlayerView['opponent'];
  cards: CardLibrary;
  pick: { options: Target[]; pick: (t: Target) => void; picked?: Target[] } | null;
  /** Set (to the view's version) right after the CPU attacked: its active lunges at the player's. */
  lunge?: number | null;
  /** The CPU's Pokémon its card just changed (they glow: Slot's `spotlight`). */
  spotlight?: Spotlight | null;
  /** The Trainer being played or a search of the deck: floats over this side, its bottom level with the CPU's active. */
  dialog?: ReactNode;
}) {
  const { playmat } = useCosmetics();
  const slot = (id: string, target: Target, pokemon: InPlayPokemon | null, large?: boolean) => (
    <OpponentSlot key={id} id={id} target={target} pokemon={pokemon} cards={cards} large={large} pick={pick} lunge={lunge} spotlight={spotlight} />
  );
  return (
    // The player's playmat here too (the Cosmetics tab), so the whole table matches.
    <section className="relative flex min-h-0 flex-1 items-center rounded-lg bg-slate-900 p-3">
      <Playmat id={playmat} group="table" />
      {/* Top-aligned, with the side columns pushed down past the heading (text-sm + space-y-3 = 2rem) to line up with the bench. */}
      <div className="relative flex w-full items-start gap-3">
        <div className="mt-8">
          <DeckAndDiscard deckCount={opponent.deckCount} discard={opponent.discard} cards={cards} owner="The CPU's" mirrored />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <h3 className="text-center text-sm text-slate-400">
            CPU · hand {opponent.handCount}
            {opponent.hand && ' (face up: Clairvoyance)'}
          </h3>
          {opponent.hand && (
            <div className="flex flex-wrap justify-center gap-1">
              {opponent.hand.map((c) => (
                <Card key={c.uid} def={lookupCard(cards, c.defId)} small />
              ))}
            </div>
          )}
          <div className="flex justify-center gap-2">
            {opponent.bench.map((p, i) => slot(`cpu-bench-${i}`, i, p))}
          </div>
          {/* The CPU's Active Pokémon's row: its coin flips go to the left of it, mirroring yours (CoinFlip). */}
          <div data-coin-anchor="opponent" className="relative flex justify-center">
            {slot('cpu-active', 'active', opponent.active, true)}
            {dialog && <FloatingDialog className="absolute bottom-0 left-1/2 z-20 w-max max-w-[min(42rem,90cqw)] -translate-x-1/2">{dialog}</FloatingDialog>}
          </div>
        </div>
        <div className="mt-8">
          <PrizeCards count={opponent.prizeCount} mirrored faceUp={opponent.prizes && { prizes: opponent.prizes, cards }} />
        </div>
      </div>
    </section>
  );
}

/** One of the CPU's slots: highlighted and clicked while an effect asks for one of its Pokémon (`pick`). Also the phone layout's. */
export function OpponentSlot({
  id,
  target,
  pokemon,
  cards,
  large,
  pick,
  lunge,
  spotlight = null,
}: {
  id: string;
  target: Target;
  pokemon: InPlayPokemon | null;
  cards: CardLibrary;
  large?: boolean;
  pick: { options: Target[]; pick: (t: Target) => void; picked?: Target[] } | null;
  lunge: number | null;
  spotlight?: Spotlight | null;
}) {
  const choosable = pick?.options.includes(target) ?? false;
  const picked = pick?.picked?.includes(target) ?? false;
  return (
    <Slot
      id={id}
      pokemon={pokemon}
      cards={cards}
      large={large}
      highlight={picked ? 'power' : choosable ? 'target' : null}
      label={picked ? 'Chosen' : choosable ? 'Choose' : null}
      dimmed={pick !== null && pokemon !== null && !choosable}
      onClick={choosable ? () => pick!.pick(target) : undefined}
      lunge={target === 'active' && lunge !== null ? { dir: 'down', stamp: lunge } : null}
      spotlight={spotlight?.targets.includes(target) ? spotlight : null}
    />
  );
}
