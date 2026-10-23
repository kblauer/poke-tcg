import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useEffect, useState, type ReactNode } from 'react';
import { SMALL_CARD } from '../../utils/layout';
import { Card } from '../Card';
import { CardBack } from '../CardBack';
import { DiscardPane } from '../DiscardPane';

/** A pile's size: small cards inside take --card-pile (index.css, .phone-cards) as their width. */
const PILE = `relative shrink-0 [--card-sm:var(--card-pile)] ${SMALL_CARD}`;
/** How long a tap on the CPU's hand shows its count (ms), fading out over its last part (`exact-fade`, index.css). */
const COUNT_MS = 1600;
/** The discard pile, half as big again as the other piles (agreed). */
const BIG_PILE = `relative shrink-0 [--card-sm:calc(var(--card-pile)*1.5)] ${SMALL_CARD}`;

/** The count on a pile, over its bottom edge. */
function Count({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-800 px-1.5 text-[10px] font-bold leading-4 text-slate-100 ring-1 ring-slate-600">
      {children}
    </span>
  );
}

/** A face-down stack with a few offset shadows, or a dashed spot when it's empty. `mine`: the player's, in their card back. */
function Stack({ count, mine }: { count: number; mine: boolean }) {
  return count > 0 ? (
    <CardBack mine={mine} className={count > 1 ? 'shadow-[2px_2px_0_var(--color-slate-900),3px_3px_0_var(--color-slate-700)]' : ''} />
  ) : (
    <div className="aspect-[63/88] rounded-md border-2 border-dashed border-slate-700" />
  );
}

/**
 * The phone layout's Prize cards: one small stack above the deck (PhonePiles), with how many are left. Face up (Here
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
        <Stack count={count} mine={owner === 'Your'} />
      )}
      <Count>{count}</Count>
      {viewing && faceUp && <DiscardPane title={`${owner} Prize cards`} note={`${shown.length}, face up`} discard={shown} cards={faceUp.cards} onClose={() => setViewing(false)} />}
    </div>
  );
}

/**
 * The phone layout's piles, right of the Active Pokémon (agreed): the Prize cards (`prizes`, PhonePrizes) above the
 * deck, and the discard pile, half as big again, to their left, centred on them; each with its count. A tap on the
 * discard pile spreads it out to look through (DiscardPane).
 */
export function PhonePiles({ deckCount, discard, cards, owner, prizes }: { deckCount: number; discard: CardInstance[]; cards: CardLibrary; owner: string; prizes: ReactNode }) {
  const [browsing, setBrowsing] = useState(false);
  const top = discard.at(-1);
  return (
    <div className="flex items-center gap-1.5">
      <div className={BIG_PILE} title={`${owner} discard pile: ${discard.length}`}>
        {top ? (
          <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => setBrowsing(true)}>
            <Card def={lookupCard(cards, top.defId)} small />
          </div>
        ) : (
          <Stack count={0} mine={false} />
        )}
        <Count>{discard.length}</Count>
      </div>
      <div className="flex flex-col gap-2.5">
        {prizes}
        <div className={PILE} title={`${owner} deck: ${deckCount}`}>
          <Stack count={deckCount} mine={owner === 'Your'} />
          <Count>{deckCount}</Count>
        </div>
      </div>
      {browsing && <DiscardPane title={`${owner} discard pile`} discard={discard} cards={cards} onClose={() => setBrowsing(false)} />}
    </div>
  );
}

/**
 * The CPU's hand on the phone layout (agreed), in a strip at the top of the screen above its Bench (PhoneTable): its
 * cards face down and upside down, fanned across the middle and half off the top edge, overlapping more as there are more. While
 * it's face up (Clairvoyance) they show face up, and a tap spreads them out (`onOpen`). A tap on it shows how many
 * cards it holds, briefly, in a small bubble under it (agreed).
 */
export function PhoneOppHand({ count, faceUp, onOpen }: { count: number; faceUp?: { hand: CardInstance[]; cards: CardLibrary }; onOpen: () => void }) {
  /** The tap's time, keying the count's bubble so a second tap shows it afresh. */
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), COUNT_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!count) return null;
  const cards = faceUp?.hand ?? Array.from({ length: count }, () => null);
  return (
    <div className="relative">
      <div
        data-keep-action
        role="button"
        tabIndex={0}
        className="pointer-events-none flex cursor-pointer justify-center px-2"
        title={`The CPU's hand: ${count}${faceUp ? ' (face up)' : ''}`}
        aria-label={`The CPU's hand: ${count} cards`}
        onClick={() => {
          setShown(Date.now());
          if (faceUp) onOpen();
        }}
        // Half off the top edge, upside down as if held across the table.
        style={{ transform: 'translateY(-55%) rotate(180deg)' }}
      >
        {cards.map((c, i) => (
          // Overlapping: each card covers part of the one before (more of it with a bigger hand).
          <div key={c?.uid ?? i} className={`pointer-events-auto relative shrink-0 [--card-sm:var(--card-opp-hand)] ${SMALL_CARD} ${i ? (count > 6 ? '-ml-[calc(var(--card-opp-hand)*0.75)]' : '-ml-[calc(var(--card-opp-hand)*0.55)]') : ''}`}>
            {c && faceUp ? <Card def={lookupCard(faceUp.cards, c.defId)} small /> : <CardBack />}
          </div>
        ))}
      </div>
      {shown !== null && (
        // Just under the hand's visible edge (45% of its cards' height).
        <span
          key={shown}
          role="status"
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-100 shadow-lg shadow-black/50 ring-1 ring-slate-600"
          style={{ top: 'calc(var(--card-opp-hand) * 1.397 * 0.45 + 0.25rem)', animation: `exact-fade ${COUNT_MS}ms ease-in forwards` }}
        >
          {count} {count === 1 ? 'card' : 'cards'} in hand
        </span>
      )}
    </div>
  );
}
