import type { PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How long the turn banner takes: coming in (its text sliding in from both sides), held, then fading away. */
const SLIDE_MS = 320;
// Held 1.2s once in (the user's; 0.8s before), then it fades.
const HOLD_MS = 1200;
export const TURN_BANNER_MS = 2 * SLIDE_MS + HOLD_MS;

/** A new turn on screen: whose it is and its number (the game's turn count, both players' turns together). */
interface NewTurn {
  mine: boolean;
  turn: number;
}

/**
 * The turn that just began in `view`, while its banner shows (TURN_BANNER_MS): set when the turn number changes or the
 * battle starts, never for the view first shown (a reload mid-turn shows none).
 */
export function useNewTurn(view: PlayerView): NewTurn | null {
  const seen = useRef(view.phase === 'setup' ? 0 : view.turn);
  const [shown, setShown] = useState<NewTurn | null>(null);
  const playing = view.phase === 'playing' || view.phase === 'promote';
  useEffect(() => {
    if (!playing || view.turn === seen.current) return;
    seen.current = view.turn;
    setShown({ mine: view.currentPlayer === view.you, turn: view.turn });
  }, [playing, view.turn]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), TURN_BANNER_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return shown;
}

/** The banner's height (px): on a big screen, and on a phone (`compact`). */
const HEIGHT = { big: 72, compact: 48 };
/** Each half's text: 57% of the banner's height (the user's: 70%, then 10% smaller twice), less only when it wouldn't fit beside the buttons. */
const TEXT = 0.57;
/** The setup line's text: 20% smaller again (the user's). */
const SETUP_TEXT = TEXT * 0.8;
/** Below this (px), a half with more than one word wraps onto two lines instead of shrinking further. */
const MIN_ONE_LINE = 16;
/** The space between a half's text and the banner's ends (px). */
const EDGE = 12;
/**
 * The space between each half's text and the buttons (px), left and right: on a big screen 16 left (by Reset cards) and 24
 * right (the user's), on a phone 20 both sides, where room is short.
 */
const SPACE = { big: { left: 16, right: 24 }, compact: { left: 20, right: 20 } };

/**
 * Where the buttons between the two sides are, in the play area (its `area`): the button row's middle (StatusBar's
 * `data-banner-row`, where the banner is centred), and how far its buttons (`data-banner-avoid`) reach left and right;
 * without buttons (the CPU's turn), the middle of the row. Also the Active Pokémon slot's edges (Slot's `data-active-slot`),
 * where each half's band fades out (the buttons' when there's none).
 */
function measure(area: HTMLElement) {
  const box = area.getBoundingClientRect();
  const row = area.querySelector('[data-banner-row]')?.getBoundingClientRect();
  const buttons = [...area.querySelectorAll('[data-banner-avoid]')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
  const middle = box.width / 2;
  return {
    width: box.width,
    centre: row ? row.top + row.height / 2 - box.top : box.height / 2,
    left: buttons.length ? Math.min(...buttons.map((r) => r.left)) - box.left : middle,
    right: buttons.length ? Math.max(...buttons.map((r) => r.right)) - box.left : middle,
    ...(() => {
      const active = area.querySelector('[data-active-slot]')?.getBoundingClientRect();
      return active ? { activeLeft: active.left - box.left, activeRight: active.right - box.left } : { activeLeft: middle, activeRight: middle };
    })(),
  };
}

/** How much of the way from the Active Pokémon slot to its end of the play area each half's band reaches (the user's: 10% short of it). */
const BAND_REACH = 0.9;

/** Where each half's band runs (px across the play area): from the Active slot's edge outwards, BAND_REACH of the way to its end. */
function halfBands(m: ReturnType<typeof measure>): [{ from: number; to: number }, { from: number; to: number }] {
  const left = Math.max(0, m.activeLeft);
  const right = Math.max(0, m.width - m.activeRight);
  return [
    { from: m.activeLeft - left * BAND_REACH, to: m.activeLeft },
    { from: m.activeRight, to: m.activeRight + right * BAND_REACH },
  ];
}

/**
 * A half's band (the user's: the two never meet in the middle): fading in from its end of the play area, solid behind its
 * text, then out to the background towards `to` (the Active Pokémon slot). Sky blue for the player, rose for the CPU (the
 * game's meaning, not the theme's).
 */
function halfBand(mine: boolean, to: 'left' | 'right') {
  const rgb = mine ? '7 89 133' : '136 19 55';
  const at = (alpha: number) => `rgb(${rgb} / ${alpha})`;
  // Very gradual (the user's): each fade over 45% of the band, eased through faint stops, solid only in the middle.
  return `linear-gradient(to ${to}, ${at(0)}, ${at(0.15)} 15%, ${at(0.45)} 30%, ${at(0.9)} 45%, ${at(0.9)} 55%, ${at(0.45)} 70%, ${at(0.15)} 85%, ${at(0)})`;
}

/** A half of the banner's text: its element, the middle of its half of the play area, and the room it has (`from`–`to`, px). */
interface Half {
  text: HTMLElement;
  middle: number;
  from: number;
  to: number;
}

/**
 * Sizes and places both halves' text: one size for both (the user's), 70% of the banner's `height` or the largest that
 * fits both halves' room on one line, whichever is smaller; each centred on its half of the play area where it fits,
 * moved towards its outer edge only as far as it must to clear the buttons. When that size would drop below
 * MIN_ONE_LINE (a phone's setup), both wrap onto two lines instead, again one size, as big as fits, each centred in its room.
 */
function placeHalves(halves: Half[], height: number, text: number) {
  const one = height * text;
  const holder = (h: Half) => h.text.parentElement!;
  const room = halves.map((h) => Math.max(0, h.to - h.from));
  for (const h of halves) {
    h.text.style.whiteSpace = 'nowrap';
    h.text.style.fontSize = `${one}px`;
    holder(h).style.width = 'max-content';
  }
  const widths = halves.map((h) => h.text.offsetWidth);
  const size = Math.min(one, ...halves.map((_, i) => (one * room[i]!) / Math.max(1, widths[i]!)));
  if (size >= MIN_ONE_LINE) {
    halves.forEach((h, i) => {
      const width = (widths[i]! * size) / one;
      h.text.style.fontSize = `${size}px`;
      holder(h).style.width = `${width}px`;
      holder(h).style.left = `${Math.min(Math.max(h.middle - width / 2, h.from), h.to - width)}px`;
    });
    return;
  }
  halves.forEach((h, i) => {
    h.text.style.whiteSpace = 'normal';
    holder(h).style.left = `${h.from}px`;
    holder(h).style.width = `${room[i]}px`;
  });
  for (let two = one / 2 + 2; two > 8; two -= 1) {
    for (const h of halves) h.text.style.fontSize = `${two}px`;
    if (halves.every((h, i) => h.text.scrollWidth <= room[i]! && h.text.offsetHeight <= height)) return;
  }
}

/**
 * A band across the play area, centred on the buttons between the two sides and behind them (they sit above it, z
 * 960), its text split either side of them (the user's): `left` and `right` each centred on its own band (halfBand),
 * neither reaching the buttons, both the same size: 57% of the band's height unless smaller to fit
 * (placeHalves), the positions following the buttons as they are (measured every frame while it shows). It fades in as
 * each half's text slides in from its own side; `leaving` (or `hold` passing, for the turn) fades it away, then `onGone`. Sky blue for the player, rose for the CPU; it can't be clicked.
 */
function SplitBanner({
  left,
  right,
  mine,
  compact,
  leaving,
  onGone,
  hold,
  textSize = TEXT,
}: {
  left: string;
  right: string;
  mine: boolean;
  compact: boolean;
  leaving?: boolean;
  onGone?: () => void;
  hold?: number;
  /** The text's size, as a share of the band's height (TEXT unless given). */
  textSize?: number;
}) {
  const band = useRef<HTMLDivElement>(null);
  const leftText = useRef<HTMLSpanElement>(null);
  const rightText = useRef<HTMLSpanElement>(null);
  const leftBand = useRef<HTMLDivElement>(null);
  const rightBand = useRef<HTMLDivElement>(null);
  const height = compact ? HEIGHT.compact : HEIGHT.big;
  const space = compact ? SPACE.compact : SPACE.big;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Follows the buttons: written straight to the elements each frame, so nothing re-renders while it shows.
  useLayoutEffect(() => {
    let frame = 0;
    let last = '';
    const place = () => {
      const el = band.current;
      const area = el?.parentElement;
      if (el && area && leftText.current && rightText.current) {
        const m = measure(area);
        const key = `${m.width}|${m.centre}|${m.left}|${m.right}|${m.activeLeft}|${m.activeRight}`;
        if (key !== last) {
          last = key;
          el.style.top = `${m.centre - height / 2}px`;
          // Each half's own band, from its end of the play area to the Active Pokémon slot, where it fades out (the user's).
          const bands = halfBands(m);
          if (leftBand.current && rightBand.current) {
            leftBand.current.style.left = `${bands[0].from}px`;
            leftBand.current.style.width = `${bands[0].to - bands[0].from}px`;
            rightBand.current.style.left = `${bands[1].from}px`;
            rightBand.current.style.width = `${bands[1].to - bands[1].from}px`;
          }
          // Each half's text centred on its own band (the user's), both the same size, clear of the buttons.
          placeHalves(
            [
              { text: leftText.current, middle: (bands[0].from + bands[0].to) / 2, from: EDGE, to: m.left - space.left },
              { text: rightText.current, middle: (bands[1].from + bands[1].to) / 2, from: m.right + space.right, to: m.width - EDGE },
            ],
            height,
            textSize,
          );
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [height, space.left, space.right, left, right, textSize]);
  // In: the band fades in as each half's text slides in from its own side, the left one from the left edge and the right
  // one from the right (the user's); placed already (the layout effect above), so each starts just past its edge.
  useEffect(() => {
    const el = band.current;
    if (!el) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'forwards' });
    if (reduced()) return;
    for (const [text, side] of [[leftText.current, -1], [rightText.current, 1]] as const) {
      const holder = text?.parentElement;
      if (!text || !holder) continue;
      const off = side < 0 ? holder.offsetLeft + holder.offsetWidth : el.offsetWidth - holder.offsetLeft;
      text.animate([{ transform: `translateX(${side * off}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'backwards' });
    }
  }, []);
  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => {
    if (hold === undefined) return;
    const timer = setTimeout(() => setTimeUp(true), SLIDE_MS + hold);
    return () => clearTimeout(timer);
  }, [hold]);
  const going = leaving || timeUp;
  useEffect(() => {
    if (!going) return;
    // Out: it fades away where it is (the user's; it used to slide off to the left).
    const out = band.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
    if (!out) return onGone?.();
    out.onfinish = () => onGone?.();
    return () => {
      out.onfinish = null;
    };
  }, [going, onGone]);
  // A soft dark shadow behind the letters (the user's; an outline was tried), to lift them off the band.
  const text = 'block font-black leading-tight tracking-wide text-slate-50 [text-shadow:0_2px_4px_rgb(0_0_0/0.55),0_0_14px_rgb(0_0_0/0.45)]';
  return (
    <div
      ref={band}
      className="pointer-events-none absolute inset-x-0 z-[950] overflow-hidden"
      style={{ height }}
      role="status"
      aria-label={`${left} ${right}`}
    >
      {/* The bands a quarter less tall than the banner (the user's), its text still sized by its full height. */}
      <div ref={leftBand} className="absolute inset-y-[12%]" style={{ background: halfBand(mine, 'right') }} />
      <div ref={rightBand} className="absolute inset-y-[12%]" style={{ background: halfBand(mine, 'left') }} />
      <div className="absolute inset-y-0 flex items-center justify-center text-center">
        <span ref={leftText} className={text}>
          {left}
        </span>
      </div>
      <div className="absolute inset-y-0 flex items-center justify-center text-center">
        <span ref={rightText} className={text}>
          {right}
        </span>
      </div>
    </div>
  );
}

/**
 * The setup line on the split banner (SplitBanner): "You're going first." (or second) left of Start battle and Reset cards,
 * "Place your Basic Pokémon." right of them (the user's). It comes in (each half from its own side) and stays until
 * `leaving` (Start battle), then fades away and `onGone` is called. Board puts it over the play area (its overlay).
 */
export function SetupBanner({ first, leaving, onGone, compact }: { first: boolean; leaving: boolean; onGone: () => void; compact: boolean }) {
  return <SplitBanner left={first ? "You're going first." : "You're going second."} right="Place your Basic Pokémon." mine={first} compact={compact} leaving={leaving} onGone={onGone} textSize={SETUP_TEXT} />;
}

/**
 * "Your Turn" or "Opponent's Turn" left of End turn and the turn count right of it, on the split banner (SplitBanner;
 * the user's), as TCG Pocket announces a turn: each half slides in from its own side, it stays a moment, then fades away
 * (TURN_BANNER_MS). Board puts it over the play area (its overlay), on both layouts.
 */
export function TurnBanner({ turn, compact }: { turn: NewTurn; compact: boolean }) {
  return <SplitBanner left={turn.mine ? 'Your Turn' : "Opponent's Turn"} right={`Turn ${turn.turn}`} mine={turn.mine} compact={compact} hold={HOLD_MS} />;
}
