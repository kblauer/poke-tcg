import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import type { ReactNode } from 'react';
import { SIDE_COLUMN, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';
import { CardBack } from './CardBack';

/**
 * A player's deck (face down) and discard pile (top card face up) with their counts, stacked in a
 * column beside the play area, against the board's outer edge. The deck is nearest the bench and
 * level with it (the board lines it up): at the bottom on your side; `mirrored` (the CPU's side,
 * which sits on the left) puts it on top, with the labels under the cards.
 */
export function DeckAndDiscard({
  deckCount,
  discard,
  cards,
  mirrored = false,
}: {
  deckCount: number;
  discard: CardInstance[];
  cards: CardLibrary;
  mirrored?: boolean;
}) {
  const top = discard.at(-1);
  const deck = (
    <Pile key="deck" label={`Deck ${deckCount}`} empty={deckCount === 0} labelBelow={mirrored}>
      {/* A few offset shadows suggest the stack. */}
      {deckCount > 0 && <CardBack className={deckCount > 1 ? 'shadow-[2px_2px_0_#0f172a,4px_4px_0_#334155]' : ''} />}
    </Pile>
  );
  const discardPile = (
    <Pile key="discard" label={`Discard ${discard.length}`} empty={!top} labelBelow={mirrored}>
      {top && <Card def={lookupCard(cards, top.defId)} small />}
    </Pile>
  );
  return (
    <div className={`${SIDE_COLUMN} flex flex-col gap-2 ${mirrored ? 'items-start' : 'items-end'}`}>
      {mirrored ? [deck, discardPile] : [discardPile, deck]}
    </div>
  );
}

/** A pile with its label above, or below on the CPU's side, so the deck card itself lines up with the bench. */
function Pile({ label, empty, labelBelow, children }: { label: string; empty: boolean; labelBelow: boolean; children: ReactNode }) {
  const text = <p className={`text-center text-xs text-slate-400 ${labelBelow ? 'mt-1' : 'mb-1'}`}>{label}</p>;
  return (
    <div className={SMALL_CARD}>
      {!labelBelow && text}
      <div className={`aspect-[63/88] rounded-md ${empty ? 'border-2 border-dashed border-slate-700' : ''}`}>{children}</div>
      {labelBelow && text}
    </div>
  );
}
