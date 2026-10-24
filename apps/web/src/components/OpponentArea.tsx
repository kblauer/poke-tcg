import type { CardLibrary, InPlayPokemon, PlayerView, Target } from '@poke-tcg/game-engine';
import type { ReactNode } from 'react';
import { PhoneOppHand } from './phone/PhonePiles';
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
 * The CPU's side, mirrored both ways from the player's, as if sitting across the table: its hand face down along the
 * top edge (PhoneOppHand, as on a phone), deck above the discard pile on the left, prizes on the right, bench on top
 * and active nearest the middle.
 * While an effect asks for one of the CPU's Pokémon (`pick`), the ones it can choose are highlighted and clicked to choose them.
 * When it asks for several (Gigashock), the ones clicked so far are `picked`.
 */
export function OpponentArea({
  opponent,
  cards,
  pick,
  drop = null,
  lunge = null,
  spotlight = null,
  dialog,
  played,
  openHand,
}: {
  opponent: PlayerView['opponent'];
  cards: CardLibrary;
  pick: { options: Target[]; pick: (t: Target) => void; picked?: Target[] } | null;
  /** A Trainer being dragged that's for one of the CPU's Pokémon: the ones it can be dropped on. */
  drop?: Target[] | null;
  /** Set (to the view's version) right after the CPU attacked: its active lunges at the player's. */
  lunge?: number | null;
  /** The CPU's Pokémon its card just changed (they glow: Slot's `spotlight`). */
  spotlight?: Spotlight | null;
  /** The Trainer being played or a search of the deck: floats over this side, its bottom level with the CPU's active. */
  dialog?: ReactNode;
  /** The card the CPU just played (PlayedCard), shown over its Bench and Active. */
  played?: ReactNode;
  /** A click on the CPU's hand while it's face up (Clairvoyance): Board spreads it out (DiscardPane). */
  openHand: () => void;
}) {
  const { playmat } = useCosmetics();
  const slot = (id: string, target: Target, pokemon: InPlayPokemon | null, large?: boolean) => (
    <OpponentSlot key={id} id={id} target={target} pokemon={pokemon} cards={cards} large={large} pick={pick} drop={drop} lunge={lunge} spotlight={spotlight} />
  );
  return (
    // The player's playmat here too (the Cosmetics tab), so the whole table matches.
    <section className="relative flex min-h-0 flex-1 items-center rounded-lg bg-slate-900 p-3">
      <Playmat id={playmat} group="table" />
      {/* The CPU's hand, face down and half off the top edge, as on a phone (no line of who it is or its hand size; the user's). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1]">
        <PhoneOppHand count={opponent.handCount} faceUp={opponent.hand && { hand: opponent.hand, cards }} onOpen={openHand} />
      </div>
      {/* Top-aligned, with the side columns pushed down past the hand's strip (--opp-hand-strip) to line up with the bench. */}
      <div className="relative flex w-full items-start gap-3 pt-[var(--opp-hand-strip)]">
        <div>
          <DeckAndDiscard deckCount={opponent.deckCount} discard={opponent.discard} cards={cards} owner="The CPU's" mirrored />
        </div>
        <div className="min-w-0 flex-1">
          {/* The Bench and the Active, with the card the CPU played centred over them (`played`). */}
          <div className="relative space-y-3">
            <div className="flex justify-center gap-2">
              {opponent.bench.map((p, i) => slot(`cpu-bench-${i}`, i, p))}
            </div>
            {/* The CPU's Active Pokémon's row: its coin flips go to the left of it, mirroring yours (CoinFlip). */}
            <div data-coin-anchor="opponent" className="relative flex justify-center">
              {slot('cpu-active', 'active', opponent.active, true)}
              {dialog && <FloatingDialog className="absolute bottom-0 left-1/2 z-20 w-max max-w-[min(42rem,90cqw)] -translate-x-1/2">{dialog}</FloatingDialog>}
            </div>
            {played}
          </div>
        </div>
        <div>
          <PrizeCards count={opponent.prizeCount} mirrored faceUp={opponent.prizes && { prizes: opponent.prizes, cards }} />
        </div>
      </div>
    </section>
  );
}

/**
 * One of the CPU's slots: highlighted and clicked while an effect asks for one of its Pokémon (`pick`), highlighted and
 * dropped on while a Trainer for one of them is dragged (`drop`). Also the phone layout's.
 */
export function OpponentSlot({
  id,
  target,
  pokemon,
  cards,
  large,
  pick,
  drop = null,
  lunge,
  spotlight = null,
}: {
  id: string;
  target: Target;
  pokemon: InPlayPokemon | null;
  cards: CardLibrary;
  large?: boolean;
  pick: { options: Target[]; pick: (t: Target) => void; picked?: Target[] } | null;
  /** A dragged Trainer's targets among the CPU's Pokémon (OpponentArea's `drop`). */
  drop?: Target[] | null;
  lunge: number | null;
  spotlight?: Spotlight | null;
}) {
  const choosable = pick?.options.includes(target) ?? false;
  const picked = pick?.picked?.includes(target) ?? false;
  const dropHere = drop?.includes(target) ?? false;
  return (
    <Slot
      id={id}
      pokemon={pokemon}
      cards={cards}
      large={large}
      droppable={dropHere}
      highlight={picked ? 'power' : choosable || dropHere ? 'target' : null}
      label={picked ? 'Chosen' : choosable ? 'Choose' : dropHere ? 'Play' : null}
      dimmed={(pick !== null || drop !== null) && pokemon !== null && !choosable && !dropHere}
      onClick={choosable ? () => pick!.pick(target) : undefined}
      lunge={target === 'active' && lunge !== null ? { dir: 'down', stamp: lunge } : null}
      spotlight={spotlight?.targets.includes(target) ? spotlight : null}
    />
  );
}
