import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import type { ReactNode } from 'react';
import { Card } from './Card';
import { CardBack } from './CardBack';

/**
 * A player's deck (face down) and discard pile (top card face up) with their counts, stacked in a
 * column on the right of the play area. The CPU's side is mirrored, so its deck goes on top.
 */
export function DeckAndDiscard({
  deckCount,
  discard,
  cards,
  deckOnTop = false,
}: {
  deckCount: number;
  discard: CardInstance[];
  cards: CardLibrary;
  deckOnTop?: boolean;
}) {
  const top = discard.at(-1);
  const deck = (
    <Pile key="deck" label={`Deck ${deckCount}`} empty={deckCount === 0}>
      {/* A few offset shadows suggest the stack. */}
      {deckCount > 0 && <CardBack className={deckCount > 1 ? 'shadow-[2px_2px_0_#0f172a,4px_4px_0_#334155]' : ''} />}
    </Pile>
  );
  const discardPile = (
    <Pile key="discard" label={`Discard ${discard.length}`} empty={!top}>
      {top && <Card def={lookupCard(cards, top.defId)} small />}
    </Pile>
  );
  return <div className="flex shrink-0 flex-col gap-2">{deckOnTop ? [deck, discardPile] : [discardPile, deck]}</div>;
}

function Pile({ label, empty, children }: { label: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="w-20">
      <p className="mb-1 text-center text-xs text-slate-400">{label}</p>
      <div className={`aspect-[63/88] rounded-md ${empty ? 'border-2 border-dashed border-slate-700' : ''}`}>{children}</div>
    </div>
  );
}
