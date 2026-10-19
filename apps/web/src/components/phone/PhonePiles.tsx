import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useState, type ReactNode } from 'react';
import { SMALL_CARD } from '../../utils/layout';
import { Card } from '../Card';
import { CardBack } from '../CardBack';
import { DiscardPane } from '../DiscardPane';

/** A pile's size: small cards inside take --card-pile (index.css, .phone-cards) as their width. */
const PILE = `relative shrink-0 [--card-sm:var(--card-pile)] ${SMALL_CARD}`;

/** The count on a pile, over its bottom edge. */
function Count({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-800 px-1.5 text-[10px] font-bold leading-4 text-slate-100 ring-1 ring-slate-600">
      {children}
    </span>
  );
}

/** A face-down stack with a few offset shadows, or a dashed spot when it's empty. */
function Stack({ count }: { count: number }) {
  return count > 0 ? (
    <CardBack className={count > 1 ? 'shadow-[2px_2px_0_#0f172a,3px_3px_0_#334155]' : ''} />
  ) : (
    <div className="aspect-[63/88] rounded-md border-2 border-dashed border-slate-700" />
  );
}

/**
 * The phone layout's Prize cards: one small stack beside the Active Pokémon, with how many are left. Face up (Here
 * Comes Team Rocket!), it shows the top one and a tap spreads them all out.
 */
export function PhonePrizes({ count, owner, faceUp }: { count: number; owner: string; faceUp?: { prizes: CardInstance[]; cards: CardLibrary } }) {
  const [viewing, setViewing] = useState(false);
  const shown = faceUp?.prizes.slice(0, count) ?? [];
  const top = shown.at(-1);
  return (
    <div className={PILE} title={`${owner} Prize cards: ${count} left`}>
      {faceUp && top ? (
        <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => setViewing(true)}>
          <Card def={lookupCard(faceUp.cards, top.defId)} small />
        </div>
      ) : (
        <Stack count={count} />
      )}
      <Count>{count}</Count>
      {viewing && faceUp && <DiscardPane title={`${owner} Prize cards`} note={`${shown.length}, face up`} discard={shown} cards={faceUp.cards} onClose={() => setViewing(false)} />}
    </div>
  );
}

/**
 * The phone layout's deck and discard pile, one above the other beside the Active Pokémon, each with its count. A tap
 * on the discard pile spreads it out to look through (DiscardPane).
 */
export function PhonePiles({ deckCount, discard, cards, owner }: { deckCount: number; discard: CardInstance[]; cards: CardLibrary; owner: string }) {
  const [browsing, setBrowsing] = useState(false);
  const top = discard.at(-1);
  return (
    <div className="flex flex-col gap-2.5">
      <div className={PILE} title={`${owner} discard pile: ${discard.length}`}>
        {top ? (
          <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => setBrowsing(true)}>
            <Card def={lookupCard(cards, top.defId)} small />
          </div>
        ) : (
          <Stack count={0} />
        )}
        <Count>{discard.length}</Count>
      </div>
      <div className={PILE} title={`${owner} deck: ${deckCount}`}>
        <Stack count={deckCount} />
        <Count>{deckCount}</Count>
      </div>
      {browsing && <DiscardPane title={`${owner} discard pile`} discard={discard} cards={cards} onClose={() => setBrowsing(false)} />}
    </div>
  );
}
