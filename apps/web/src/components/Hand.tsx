import { useDroppable } from '@dnd-kit/core';
import { lookupCard, type CardInstance, type CardLibrary, type GameAction } from '@poke-tcg/game-engine';
import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Card } from './Card';
import { HandCard } from './HandCard';
import { PAGE_BLEED } from '../utils/layout';
import { PreviewContext } from './PreviewContext';

/** Drop id of the hand: a card dragged back over it is put back (the drag is cancelled). */
export const HAND_ZONE = 'hand';

/** Hand card width (rem); cards are 63:88. Smaller on the phone layout (`compact`). */
const CARD_REM = 7;
const COMPACT_REM = 4.25;
/** How much of a card's height shows while it rests at the bottom of the screen. On a phone the whole card shows: so little of a small card would show otherwise that it couldn't be told apart. */
const VISIBLE = 0.70;
const COMPACT_VISIBLE = 1;
/** How far a tapped (or selected) card lifts clear of the others on a phone (px), as it has nothing hidden to lift into view. */
const COMPACT_LIFT = 14;
/** A hovered card grows by this much, from its bottom edge. On a phone nothing is hovered: a finger held on a card zooms in on it instead (above the hand). */
const ZOOM = 2.75;
/** On a phone, holding a finger on a card this long (ms) zooms in on it; moving to another card does at once. */
const BROWSE_MS = 150;
/** A finger this far (px) above the hand while browsing picks the zoomed card up to play it. */
const LIFT_OFF = 16;
/** Further than this (px) from where the press began is a slide, not a tap. */
const SLIDE = 8;
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
 * With a card hovered, it grows by `zoom` about its centre and the cards either side make way. The
 * grown card is kept inside the hand and far enough from each edge that every card on that side
 * still shows at least `minPeek` to hover (or an even share of the room, for a hand too big for that); the other side takes up the slack. Each side packs against it
 * (placeSide), stacked so the cards nearer the hovered one are on top (see cardZ).
 */
function cardLefts(n: number, hovered: number, width: number, cardW: number, step: number, start: number, minPeek: number, zoom: number): number[] {
  const natural = Array.from({ length: n }, (_, i) => start + i * step);
  if (hovered < 0) return natural;
  const grow = ((zoom - 1) * cardW) / 2;
  // A hand too big for that even shares out what's left beside the grown card.
  const peek = Math.max(0, Math.min(minPeek, (width - zoom * cardW) / Math.max(1, n - 1)));
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
 * below the window (Board's column is overflow-hidden). `compact` (the phone layout): smaller cards shown whole, with no hover, across the whole screen width (there are no page margins to reach past).
 * There a tap selects a card as a click does, and holding a finger on one zooms in on it, large above the hand: sliding
 * along the hand zooms in on each card the finger passes (by where the cards sit, so nothing moves under it), and
 * sliding up off the hand picks the zoomed card up to drag it into play (its own drag is started there, so the
 * slide never drags the card the press began on). Letting go without leaving the hand just closes the zoom.
 */
export function Hand({
  hand,
  cards,
  selected,
  pick,
  pending,
  canPlay,
  showPlayable = false,
  onCardClick,
  compact = false,
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
  /** It's your turn with nothing in progress: the cards that can be played (`canPlay`) pulse with a blue outline. */
  showPlayable?: boolean;
  onCardClick: (card: CardInstance) => void;
  compact?: boolean;
}) {
  const busy = pending !== null;
  const ref = useRef<HTMLDivElement>(null);
  const { setNodeRef: setDropRef } = useDroppable({ id: HAND_ZONE });
  /** The hand's full width (to the window edge and the game log), and the page margin inside it on each side. */
  const [size, setSize] = useState({ width: 0, margin: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  /** On a phone: the card zoomed in on while a finger is held on the hand. */
  const [browsing, setBrowsing] = useState<string | null>(null);
  /** The finger on the hand (phone): where it went down, and whether it has zoomed in or slid (its click is then swallowed). */
  const press = useRef<{ id: number; x: number; y: number; timer: number; uid: string; browsed: boolean } | null>(null);
  /** The pointerdown passed to a card to start its drag: it gets through to the card's own handlers. */
  const forwarding = useRef(false);
  /** Each card's element (the HandCard button), to start its drag. */
  const buttons = useRef(new Map<string, HTMLElement>());

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
  const cardW = (compact ? COMPACT_REM : CARD_REM) * rem;
  const cardH = (cardW * 88) / 63;
  const visibleH = cardH * (compact ? COMPACT_VISIBLE : VISIBLE);
  const n = hand.length;
  // Distance between card left edges: a gap if they fit, else overlapping just enough to fit.
  const step = n > 1 ? Math.max(0, Math.min(cardW + GAP, (restWidth - cardW) / (n - 1))) : 0;
  const start = margin + (restWidth - (step * (n - 1) + cardW)) / 2;
  const hoveredIndex = hand.findIndex((c) => c.uid === hovered);
  const lefts = cardLefts(n, hoveredIndex, width, cardW, step, start, PEEK_REM * rem, ZOOM);

  /** The card at x (px from the hand's left edge), by where the cards sit at rest: each shows from its left edge to the next card's. */
  const cardAt = (x: number) => hand[Math.min(n - 1, Math.max(0, step > 0 ? Math.floor((x - start) / step) : 0))];
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    setBrowsing(null);
  };
  /** Phone: a finger goes down on the hand. Its card's own handlers (the drag, the long press) don't see it: the hand handles it. */
  const fingerDown = (e: ReactPointerEvent) => {
    if (forwarding.current || e.pointerType !== 'touch' || !n) return;
    const card = (e.target as Element).closest('[data-hand-uid]')?.getAttribute('data-hand-uid');
    if (!card) return;
    e.stopPropagation();
    if (press.current) clearTimeout(press.current.timer);
    const timer = window.setTimeout(() => {
      if (!press.current) return;
      press.current.browsed = true;
      setBrowsing(press.current.uid);
    }, BROWSE_MS);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer, uid: card, browsed: false };
  };
  const fingerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (e.clientY < rect.top - LIFT_OFF && (p.browsed || Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLIDE)) {
      // Up off the hand: pick up the card zoomed in on (or pressed), with its own drag from here.
      const card = hand.find((c) => c.uid === p.uid);
      const el = buttons.current.get(p.uid);
      p.browsed = true;
      endPress();
      press.current = null;
      if (!card || !el || busy || pick) return;
      if (!canPlay(card)) return onCardClick(card);
      forwarding.current = true;
      // As a mouse press, so the card's long press (touch only) doesn't start too.
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }));
      forwarding.current = false;
      return;
    }
    const under = cardAt(e.clientX - rect.left);
    if (!under) return;
    if (under.uid !== p.uid || Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLIDE) {
      clearTimeout(p.timer);
      p.uid = under.uid;
      p.browsed = true;
      setBrowsing(under.uid);
    }
  };
  const fingerUp = (e: ReactPointerEvent) => {
    if (!press.current || e.pointerId !== press.current.id) return;
    endPress();
    // A tap selects the card (its click goes through); after zooming in, nothing does.
    if (!press.current.browsed) press.current = null;
  };
  const browsed = browsing ? hand.find((c) => c.uid === browsing) : undefined;

  return (
    // The hover preview isn't needed here: the card itself grows.
    <PreviewContext.Provider value={() => {}}>
      {/* The full width beside the game log, past the page margins, so a big hand has room to spread. */}
      <div
        ref={(el) => {
          ref.current = el;
          setDropRef(el);
        }}
        className={`relative shrink-0 ${compact ? '' : PAGE_BLEED}`}
        style={{ height: visibleH }}
        onMouseLeave={() => setHovered(null)}
        {...(compact && {
          onPointerDownCapture: fingerDown,
          onPointerMove: fingerMove,
          onPointerUp: fingerUp,
          onPointerCancel: fingerUp,
          // The click that ends a zoom or a slide isn't a tap.
          onClickCapture: (e: ReactMouseEvent) => {
            if (press.current?.browsed) e.stopPropagation();
            press.current = null;
          },
        })}
      >
        {browsed && (
          // Big above the hand, in the middle of the screen, while the finger is held on its card.
          <div className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-3 w-[min(62vw,15rem)] -translate-x-1/2 drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] [--card-lg:min(62vw,15rem)]">
            <Card def={lookupCard(cards, browsed.defId)} highRes />
          </div>
        )}
        {hand.map((c, i) => {
          const isHovered = i === hoveredIndex;
          const raised = isHovered || browsing === c.uid || selected === c.uid || (pick?.picked.has(c.uid) ?? false);
          const x = lefts[i]!;
          // Lifted so the whole card shows above the bottom of the screen; grown from its bottom edge.
          const y = !raised ? 0 : compact ? -COMPACT_LIFT : -(cardH - visibleH) - (isHovered ? 0 : 4);
          return (
            <div
              key={c.uid}
              data-hand-uid={c.uid}
              ref={(el) => {
                const button = el?.querySelector('button');
                if (button) buttons.current.set(c.uid, button);
                else buttons.current.delete(c.uid);
              }}
              className="absolute left-0 top-0 origin-bottom transition-transform duration-150 ease-out"
              style={{
                width: cardW,
                // The card (LARGE_CARD) takes its width from --card-lg, which the board doesn't set out here.
                ['--card-lg' as string]: `${cardW}px`,
                transform: `translate(${x}px, ${y}px) scale(${isHovered ? ZOOM : 1})`,
                zIndex: cardZ(i, hoveredIndex, raised, n),
              }}
              // A touch screen fakes a hover on every tap; on a phone the held finger zooms in instead.
              onMouseEnter={compact ? undefined : () => setHovered(c.uid)}
            >
              <HandCard
                card={c}
                def={lookupCard(cards, c.defId)}
                draggable={!busy && !pick && canPlay(c)}
                playable={showPlayable && !busy && !pick && canPlay(c)}
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
