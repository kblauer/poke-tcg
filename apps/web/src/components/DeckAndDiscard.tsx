import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import type { HTMLAttributes, ReactNode } from 'react';
import { useHoldToInspect } from '../hooks/useHoldToInspect';
import { SIDE_COLUMN, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';
import { CardBack } from './CardBack';
import { DiscardPane } from './DiscardPane';

/**
 * A player's deck (face down) and discard pile (top card face up) with their counts, stacked in a
 * column beside the play area, against the board's outer edge. The deck is nearest the bench and
 * level with it (the board lines it up): at the bottom on your side; `mirrored` (the CPU's side,
 * which sits on the left) puts it on top, with the labels under the cards. Holding the discard pile opens it in
 * a pane to browse (DiscardPane); `owner` names whose it is there.
 */
export function DeckAndDiscard({
  deckCount,
  discard,
  cards,
  owner,
  mirrored = false,
}: {
  deckCount: number;
  discard: CardInstance[];
  cards: CardLibrary;
  /** Whose piles they are, for the discard pane's title ("Your", "The CPU's"). */
  owner: string;
  mirrored?: boolean;
}) {
  const top = discard.at(-1);
  const hold = useHoldToInspect<true>({ stay: true });
  const deck = (
    <Pile key="deck" label={`Deck ${deckCount}`} empty={deckCount === 0} labelBelow={mirrored}>
      {/* A few offset shadows suggest the stack. */}
      {deckCount > 0 && <CardBack className={deckCount > 1 ? 'shadow-[2px_2px_0_#0f172a,4px_4px_0_#334155]' : ''} />}
    </Pile>
  );
  const discardPile = (
    <Pile
      key="discard"
      label={`Discard ${discard.length}`}
      empty={!top}
      labelBelow={mirrored}
      press={top ? { ...hold.press(true), onClick: () => void hold.clicked(), title: 'Hold to browse the discard pile', className: 'cursor-pointer' } : undefined}
    >
      {top && <Card def={lookupCard(cards, top.defId)} small />}
    </Pile>
  );
  return (
    <div className={`${SIDE_COLUMN} flex flex-col gap-2 ${mirrored ? 'items-start' : 'items-end'}`}>
      {mirrored ? [deck, discardPile] : [discardPile, deck]}
      {/* Outside the pile, so presses in the pane don't reach the pile's hold handlers. */}
      {hold.inspecting && <DiscardPane title={`${owner} discard pile`} discard={discard} cards={cards} onClose={hold.close} />}
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
  /** Pointer handlers and attributes for the card (holding the discard pile). */
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
