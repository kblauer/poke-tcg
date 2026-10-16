import { useDroppable } from '@dnd-kit/core';
import { lookupCard, type CardInstance, type CardLibrary, type GameAction } from '@poke-tcg/game-engine';
import { useLayoutEffect, useRef, useState } from 'react';
import { HandCard } from './HandCard';
import { PAGE_BLEED } from '../utils/layout';
import { PreviewContext } from './PreviewContext';

/** Drop id of the hand: a card dragged back over it is put back (the drag is cancelled). */
export const HAND_ZONE = 'hand';

/** Hand card width (rem); cards are 63:88. */
const CARD_REM = 7;
/** How much of a card's height shows while it rests at the bottom of the screen. */
const VISIBLE = 0.70;
/** A hovered card grows by this much, from its bottom edge. */
const ZOOM = 2.75;
/** Gap between cards when there's room (px). */
const GAP = 8;
/** Least width of a card left showing beside a hovered one, so it can still be hovered (rem). */
const PEEK_REM = 2;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/**
 * Places one side of the hovered card: `count` cards in the `space` between the hand's edge and the
 * hovered card's grown edge. Returns each card's distance from the hand's edge to its outer side,
 * outermost first. Ideally the nearest card sits a gap clear of the hovered card and the rest keep
 * their `step`; short of room they squeeze closer, but every card keeps at least `peek` showing.
 */
function placeSide(count: number, space: number, cardW: number, step: number, peek: number): number[] {
  if (count === 0) return [];
  const nearest = Math.min(space - peek, Math.max((count - 1) * peek, space - GAP - cardW));
  const outermost = Math.max(0, nearest - (count - 1) * step);
  const spacing = count > 1 ? (nearest - outermost) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => outermost + i * spacing);
}

/**
 * Left edge (px, unzoomed card) of each of `n` cards in a hand `width` wide, `step` apart from `start`.
 * With a card hovered, it grows by ZOOM about its centre and the cards either side make way. The
 * grown card is kept inside the hand and far enough from each edge that every card on that side
 * still shows at least `minPeek` to hover (or an even share of the room, for a hand too big for that); the other side takes up the slack. Each side packs against it
 * (placeSide), stacked so the cards nearer the hovered one are on top (see cardZ).
 */
function cardLefts(n: number, hovered: number, width: number, cardW: number, step: number, start: number, minPeek: number): number[] {
  const natural = Array.from({ length: n }, (_, i) => start + i * step);
  if (hovered < 0) return natural;
  const grow = ((ZOOM - 1) * cardW) / 2;
  // A hand too big for that even shares out what's left beside the grown card.
  const peek = Math.max(0, Math.min(minPeek, (width - ZOOM * cardW) / Math.max(1, n - 1)));
  const before = hovered;
  const after = n - hovered - 1;
  const minX = grow + before * peek;
  const maxX = width - cardW - grow - after * peek;
  const hoveredX = Math.min(maxX, Math.max(minX, natural[hovered]!));
  const left = placeSide(before, hoveredX - grow, cardW, step, peek);
  const right = placeSide(after, width - (hoveredX + cardW + grow), cardW, step, peek);
  return [
    ...left,
    hoveredX,
    // Mirrored: distances are from the right edge, outermost (the last card) first.
    ...right.map((d) => width - d - cardW).reverse(),
  ];
}

/** Stacking: normally each card covers the one before it; around a hovered card, the ones nearer it are on top on both sides. */
function cardZ(i: number, hovered: number, raised: boolean, n: number): number {
  if (i === hovered) return 2 * n + 2;
  if (raised) return 2 * n + 1;
  return hovered >= 0 && i > hovered ? 2 * n - i : i;
}

/**
 * The hand along the very bottom of the screen, centred, with each card partly
 * below the edge. At rest it keeps to the play area's width: cards spread out with a small gap, or overlap
 * when there are too many to fit. Its box reaches the window edge and the game log, so the cards
 * beside a hovered one can spill into the page margins when they need the room.
 * Hovering a card grows it and lifts it fully into view, and slides its neighbours aside so they
 * don't cover it, squeezing them closer rather than off the edge (cardLefts); the selected card (picked by clicking) is lifted too. The page clips the parts
 * below the window (Board's column is overflow-hidden).
 */
export function Hand({
  hand,
  cards,
  selected,
  pick,
  pending,
  canPlay,
  onCardClick,
}: {
  hand: CardInstance[];
  cards: CardLibrary;
  /** uid of the card picked by clicking. */
  selected: string | null;
  /** A Trainer is asking for cards from the hand: the ones that can be picked, and those picked so far (raised). */
  pick: { options: Set<string>; picked: Set<string> } | null;
  pending: GameAction | null;
  /** Whether the card has somewhere to go (makes it draggable). */
  canPlay: (card: CardInstance) => boolean;
  onCardClick: (card: CardInstance) => void;
}) {
  const busy = pending !== null;
  const ref = useRef<HTMLDivElement>(null);
  const { setNodeRef: setDropRef } = useDroppable({ id: HAND_ZONE });
  /** The hand's full width (to the window edge and the game log), and the page margin inside it on each side. */
  const [size, setSize] = useState({ width: 0, margin: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The margin is the padding PAGE_BLEED reaches past (the board column's); it changes with the breakpoint.
    const measure = () => setSize({ width: el.clientWidth, margin: el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingLeft) || 0 : 0 });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const { width, margin } = size;
  /** At rest the hand keeps to the play area's width; only a hovered card's neighbours spill into the margins. */
  const restWidth = Math.max(0, width - 2 * margin);

  const rem = remPx();
  const cardW = CARD_REM * rem;
  const cardH = (cardW * 88) / 63;
  const visibleH = cardH * VISIBLE;
  const n = hand.length;
  // Distance between card left edges: a gap if they fit, else overlapping just enough to fit.
  const step = n > 1 ? Math.max(0, Math.min(cardW + GAP, (restWidth - cardW) / (n - 1))) : 0;
  const start = margin + (restWidth - (step * (n - 1) + cardW)) / 2;
  const hoveredIndex = hand.findIndex((c) => c.uid === hovered);
  const lefts = cardLefts(n, hoveredIndex, width, cardW, step, start, PEEK_REM * rem);

  return (
    // The hover preview isn't needed here: the card itself grows.
    <PreviewContext.Provider value={() => {}}>
      {/* The full width beside the game log, past the page margins, so a big hand has room to spread. */}
      <div
        ref={(el) => {
          ref.current = el;
          setDropRef(el);
        }}
        className={`relative shrink-0 ${PAGE_BLEED}`}
        style={{ height: visibleH }}
        onMouseLeave={() => setHovered(null)}
      >
        {hand.map((c, i) => {
          const isHovered = i === hoveredIndex;
          const raised = isHovered || selected === c.uid || (pick?.picked.has(c.uid) ?? false);
          const x = lefts[i]!;
          // Lifted so the whole card shows above the bottom of the screen; grown from its bottom edge.
          const y = raised ? -(cardH - visibleH) - (isHovered ? 0 : 4) : 0;
          return (
            <div
              key={c.uid}
              className="absolute left-0 top-0 origin-bottom transition-transform duration-150 ease-out"
              style={{
                width: cardW,
                transform: `translate(${x}px, ${y}px) scale(${isHovered ? ZOOM : 1})`,
                zIndex: cardZ(i, hoveredIndex, raised, n),
              }}
              onMouseEnter={() => setHovered(c.uid)}
            >
              <HandCard
                card={c}
                def={lookupCard(cards, c.defId)}
                draggable={!busy && !pick && canPlay(c)}
                selected={selected === c.uid}
                pick={!pick || selected === c.uid ? undefined : pick.picked.has(c.uid) ? 'picked' : pick.options.has(c.uid) ? 'option' : 'unavailable'}
                loading={pending !== null && 'cardUid' in pending && pending.cardUid === c.uid}
                busy={busy}
                onClick={() => onCardClick(c)}
              />
            </div>
          );
        })}
      </div>
    </PreviewContext.Provider>
  );
}
