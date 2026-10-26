import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { SIDE_COLUMN, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';
import { CardBack } from './CardBack';
import { DiscardPane, type ZoneAbilities } from './DiscardPane';

/**
 * A player's deck (face down) and discard pile (top card face up) with their counts, stacked in a
 * column beside the play area, against the board's outer edge. The deck is nearest the bench and
 * level with it (the board lines it up): at the bottom on your side; `mirrored` (the CPU's side,
 * which sits on the left) puts it on top, with the labels under the cards. Clicking the discard pile opens it in
 * a window to browse (DiscardPane); `owner` names whose it is there.
 */
export function DeckAndDiscard({
  deckCount,
  discard,
  cards,
  owner,
  mirrored = false,
  abilities,
}: {
  deckCount: number;
  discard: CardInstance[];
  cards: CardLibrary;
  /** Whose piles they are, for the discard pane's title ("Your", "The CPU's"). */
  owner: string;
  mirrored?: boolean;
  /** The player's own: Abilities used from the discard pile (DiscardPane). */
  abilities?: ZoneAbilities;
}) {
  const top = discard.at(-1);
  const [browsing, setBrowsing] = useState(false);
  const deck = (
    <Pile key="deck" label={`Deck ${deckCount}`} empty={deckCount === 0} labelBelow={mirrored}>
      {/* A few offset shadows suggest the stack. */}
      {deckCount > 0 && <CardBack mine={!mirrored} className={deckCount > 1 ? 'shadow-[2px_2px_0_var(--color-slate-900),4px_4px_0_var(--color-slate-700)]' : ''} />}
    </Pile>
  );
  const discardPile = (
    <Pile
      key="discard"
      label={`Discard ${discard.length}`}
      empty={!top}
      labelBelow={mirrored}
      press={top ? { role: 'button', tabIndex: 0, onClick: () => setBrowsing(true), onKeyDown: (e) => e.key === 'Enter' && setBrowsing(true), title: 'Click to view the discard pile', className: 'cursor-pointer transition hover:-translate-y-1' } : undefined}
    >
      {top && <Card def={lookupCard(cards, top.defId)} small />}
    </Pile>
  );
  return (
    <div className={`${SIDE_COLUMN} flex flex-col gap-2 ${mirrored ? 'items-start' : 'items-end'}`}>
      {mirrored ? [deck, discardPile] : [discardPile, deck]}
      {/* Outside the pile, so clicks in the window don't reach the pile. */}
      {browsing && <DiscardPane title={`${owner} discard pile`} discard={discard} cards={cards} onClose={() => setBrowsing(false)} abilities={abilities} />}
    </div>
  );
}

/** A pile with its label above, or below on the CPU's side, so the deck card itself lines up with the bench. */
function Pile({
  label,
  empty,
  labelBelow,
  press,
  children,
}: {
  label: string;
  empty: boolean;
  labelBelow: boolean;
  /** Handlers and attributes for the card (clicking the discard pile). */
  press?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  const text = <p className={`text-center text-xs text-slate-400 ${labelBelow ? 'mt-1' : 'mb-1'}`}>{label}</p>;
  return (
    <div className={SMALL_CARD}>
      {!labelBelow && text}
      <div {...press} className={`aspect-[63/88] rounded-md ${empty ? 'border-2 border-dashed border-slate-700' : ''} ${press?.className ?? ''}`}>
        {children}
      </div>
      {labelBelow && text}
    </div>
  );
}
