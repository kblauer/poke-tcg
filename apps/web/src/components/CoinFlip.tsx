import type { LogEntry, PlayerId } from '@poke-tcg/game-engine';
import { DEFAULT_COSMETIC } from '@poke-tcg/campaign';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCosmetics } from '../hooks/useCosmetics';
import { DEBUG_BUILD } from '../utils/debug';
import { COIN_DESIGNS } from './coinDesigns';

/** How long the coin's flight takes (flick, arc, landing and settling), then how long the result stays up. */
export const SPIN_MS = 1000;
const RESULT_MS = 540;

/** A coin flip from the log, to animate. */
export interface Flip {
  n: number;
  player: PlayerId | null;
  reason: string;
  heads: boolean;
}

/**
 * Debug only (the Debug tab's Coin flip buttons): asks the game page to show a coin flip, `heads` or tails (or either, at
 * random), with nothing else happening: no move, no log entry, the game as it was. Never sent to the server.
 */
const testFlips = new EventTarget();
export const requestTestFlip = (heads?: boolean) => testFlips.dispatchEvent(new CustomEvent('flip', { detail: heads ?? Math.random() < 0.5 }));

/**
 * The game page's side of requestTestFlip: `onFlip` is given each test flip asked for, ready to show (in debug builds only:
 * a production build drops it all).
 */
export function useTestFlips(onFlip: (flips: Flip[]) => void) {
  const latest = useRef(onFlip);
  latest.current = onFlip;
  useEffect(() => {
    if (!DEBUG_BUILD) return;
    const listener = (e: Event) => latest.current([{ n: -Date.now(), player: null, reason: 'Debug: a test coin flip (the game is unchanged)', heads: (e as CustomEvent<boolean>).detail }]);
    testFlips.addEventListener('flip', listener);
    return () => testFlips.removeEventListener('flip', listener);
  }, []);
}

/** The coin flips in `log` after entry number `since`. */
export const flipsAfter = (log: LogEntry[], since: number): Flip[] =>
  log.flatMap((e) => (e.coin && e.n !== undefined && e.n > since ? [{ n: e.n, player: e.player, ...e.coin }] : []));

/**
 * Animates a move's coin flips one after another, in the middle of the play area (Board puts it in the PlayArea), with
 * what each is for (the attack,
 * Trainer, power or Special Condition). The engine has already decided each result; this replays them while the
 * game waits (GamePage holds the move back until `onDone`). Clicking anywhere skips the rest of them; the Settings
 * page's "Skip coin flip animations" turns them off (useSkipFlips).
 */
export function CoinFlip({ flips, you, onDone }: { flips: Flip[]; you: PlayerId; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [landed, setLanded] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // A new set of flips starts from its first.
  useEffect(() => setIndex(0), [flips]);
  const current = flips[index];
  useEffect(() => {
    if (!current) return;
    setLanded(false);
    const land = setTimeout(() => setLanded(true), SPIN_MS);
    const next = setTimeout(() => (index + 1 < flips.length ? setIndex(index + 1) : doneRef.current()), SPIN_MS + RESULT_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [current?.n]);

  if (!current) return null;
  const who = current.player === null ? null : current.player === you ? 'You' : 'CPU';
  return (
    // Covers the play area (the PlayArea is its containing block), centring the coin there. The game waits for the
    // flips, so a click anywhere on the table (not only on the coin) skips them.
    <div data-keep-action className="absolute inset-0 z-[1150] flex cursor-pointer items-center justify-center p-4" aria-live="polite" onClick={() => doneRef.current()}>
      <section className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-slate-900/95 px-8 py-5 text-center shadow-2xl shadow-black/70 ring-1 ring-slate-600">
        <p className="text-base text-slate-200">
          {who && <span className="font-semibold">{who}: </span>}
          {current.reason}
          {flips.length > 1 && <span className="text-slate-500"> ({index + 1} of {flips.length})</span>}
        </p>
        <SpinningCoin key={current.n} heads={current.heads} size="md" />
        <p className={`h-8 text-2xl font-black transition-opacity ${landed ? 'opacity-100' : 'opacity-0'} ${current.heads ? 'text-yellow-300' : 'text-slate-200'}`}>
          {current.heads ? 'Heads!' : 'Tails!'}
        </p>
        <p className="text-xs text-slate-500">Click to skip</p>
      </section>
    </div>
  );
}

/** Each coin size: its width (px), its letters' size, how high it's flicked (px) and how thick it is (px, its rim). */
const COIN_SIZES = {
  md: { px: 96, text: 'text-4xl', rise: 120, depth: 8 },
  lg: { px: 160, text: 'text-6xl', rise: 160, depth: 12 },
};

/** When the coin, flicked at FLICK, lands (fractions of the animation): it bounces and settles after. */
const FLICK = 0.07;
const LAND = 0.78;

/** The angle the coin is seen at: tipped back and turned a little, so it never faces the viewer flat on. */
const TILT = 'rotateX(38deg) rotateY(-7deg)';

/** The flick's streaks around the thumb, and the dust thrown up on landing (their directions). */
const STREAKS = [0, 45, 90, 135, 180, 225, 270, 315];
const DUST = [-34, -22, -10, 10, 22, 34];

/**
 * A 3D coin, in the player's coin cosmetic (`design`, or useCosmetics' coin), flicked up and caught by the table: it dips
 * as the thumb loads it, is flicked (a burst of streaks from it) and flips end over end through an arc, its rim showing as it
 * turns, lands (a puff of dust) on heads or tails, bounces and settles, all in `spinMs` (give it a new `key` to flip
 * again). Its shadow shrinks as it rises. `md` for coin flips during the game, `lg` for the turn-order flip; `still`
 * (or reduced motion) just shows the face it lands on.
 */
export function SpinningCoin({
  heads,
  size,
  spinMs = SPIN_MS,
  design,
  still = false,
  headroom = true,
  flat = false,
}: {
  heads: boolean;
  size: keyof typeof COIN_SIZES;
  spinMs?: number;
  design?: string;
  still?: boolean;
  /** Keep room above the coin for its flight (off for the Cosmetics tab's tiles, whose coin starts still). */
  headroom?: boolean;
  /** Seen face on, with no tilt or shadow under it (a small still preview: the open deck's in the Collection). */
  flat?: boolean;
}) {
  const { coin } = useCosmetics();
  const look = COIN_DESIGNS[design ?? coin] ?? COIN_DESIGNS[DEFAULT_COSMETIC.coin]!;
  const { px, text, rise, depth } = COIN_SIZES[size];
  const body = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLSpanElement>(null);
  const [moving] = useState(() => !still && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Four turns end over end, half a turn more for tails (its face is on the back).
  const final = 1440 + (heads ? 0 : 180);
  useLayoutEffect(() => {
    if (!moving || !body.current || !shadow.current) return;
    const at = (offset: number, y: number, turn: number, scale: string, easing?: string): Keyframe => ({ offset, transform: `translateY(${y}px) rotateX(${turn}deg) scale(${scale})`, easing });
    const flight = body.current.animate(
      [
        at(0, 0, 0, '1', 'ease-out'),
        // The thumb loads it: a dip, tipped back and squashed a little.
        at(FLICK, px * 0.06, -18, '1, 0.94', 'cubic-bezier(0.2, 0.7, 0.4, 1)'),
        // Up, slowing to the top of the arc (nearer, so a little bigger), then falling faster.
        at(0.42, -rise, final * 0.55, '1.12', 'cubic-bezier(0.55, 0, 0.85, 0.45)'),
        at(LAND, 0, final, '1', 'ease-out'),
        // A small bounce, tipping over and back as it settles.
        at(0.87, -rise * 0.1, final + 10, '1', 'ease-in'),
        at(0.94, 0, final - 4, '1', 'ease-out'),
        at(1, 0, final, '1'),
      ],
      { duration: spinMs, fill: 'forwards' },
    );
    const dark = shadow.current.animate(
      [
        { offset: 0, transform: 'scale(1)', opacity: 0.55 },
        { offset: 0.42, transform: 'scale(0.45)', opacity: 0.15 },
        { offset: LAND, transform: 'scale(1)', opacity: 0.55 },
        { offset: 0.87, transform: 'scale(0.85)', opacity: 0.45 },
        { offset: 1, transform: 'scale(1)', opacity: 0.55 },
      ],
      { duration: spinMs, fill: 'forwards' },
    );
    // The dust ring where it lands: faint on the table before the flick, fading out gradually as the coin goes up and
    // hidden while it's in the air, then back on landing as a puff of dust spreading out, and faint again once it's settled.
    const ring = dust.current?.animate(
      [
        { offset: 0, opacity: 0.3, transform: 'scale(0.35)' },
        { offset: FLICK, opacity: 0.3, transform: 'scale(0.35)', easing: 'ease-in' },
        { offset: 0.38, opacity: 0, transform: 'scale(0.35)' },
        { offset: LAND - 0.001, opacity: 0, transform: 'scale(0.35)' },
        { offset: LAND, opacity: 0.8, transform: 'scale(0.35)', easing: 'ease-out' },
        { offset: LAND + 0.12, opacity: 0, transform: 'scale(1.5)' },
        { offset: LAND + 0.13, opacity: 0, transform: 'scale(0.35)', easing: 'ease-out' },
        { offset: 1, opacity: 0.3, transform: 'scale(0.35)' },
      ],
      { duration: spinMs, fill: 'forwards' },
    );
    return () => {
      flight.cancel();
      dark.cancel();
      ring?.cancel();
    };
  }, []);
  const half = depth / 2;
  const face = (content: ReactNode, back: boolean) => (
    <div
      className={`absolute inset-0 overflow-hidden rounded-full [backface-visibility:hidden] ${text}`}
      style={{ transform: `${back ? 'rotateX(180deg) ' : ''}translateZ(${half + 0.5}px)`, boxShadow: `inset 0 0 0 ${Math.round(px / 30)}px ${look.rim}aa` }}
    >
      {content}
      {/* A soft shine, as on metal. */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.45),transparent_55%)]" />
    </div>
  );
  return (
    // With `headroom`, room above the coin for the top of its arc, so it never flies over what's above it (the flip's heading).
    <div className="shrink-0" style={{ width: px, paddingTop: headroom && moving ? rise + px * 0.08 : 0 }}>
      <div className="relative" style={{ height: flat ? px : px * 1.18 }}>
        {/* The shadow on the table under it. */}
        {!flat && <div ref={shadow} className="absolute left-[10%] w-[80%] rounded-[50%] bg-black/55 blur-[3px]" style={{ top: px * 0.98, height: px * 0.14 }} />}
        <div className="absolute inset-x-0 top-0 [perspective:600px]" style={{ height: px }}>
          {/* Seen a little from above and to one side (TILT), not head on, so its rim shows even at rest. */}
          <div className="h-full w-full [transform-style:preserve-3d]" style={{ transform: flat ? 'none' : TILT }}>
            <div ref={body} className="relative h-full w-full [transform-style:preserve-3d]" style={{ transform: `rotateX(${final}deg)` }}>
              {/* The rim: thin discs stacked between the faces, seen edge on as the coin turns. */}
              {Array.from({ length: depth }, (_, i) => (
                <div key={i} className="absolute inset-0 rounded-full" style={{ background: look.rim, transform: `translateZ(${i - half + 0.5}px)` }} />
              ))}
              {face(look.heads, false)}
              {face(look.tails, true)}
            </div>
          </div>
        </div>
        {moving && (
          <>
            {/* The flick: streaks bursting from the coin and a flash on it, where it is as it's flicked (its middle, dipped a little). */}
            <div className="pointer-events-none absolute left-1/2" style={{ top: px * 0.56 }}>
              <span className="coin-flash absolute -left-3 -top-3 h-6 w-6 rounded-full bg-white/80" style={{ animationDelay: `${spinMs * FLICK}ms` }} />
              {STREAKS.map((a) => (
                <span key={a} className="coin-streak absolute -left-px h-2.5 w-0.5 rounded-full bg-white/90" style={{ '--a': `${a}deg`, animationDelay: `${spinMs * FLICK}ms` } as CSSProperties} />
              ))}
            </div>
            {/* The landing: a ring of dust spreading over the table, and a few specks thrown up. */}
            <div className="pointer-events-none absolute left-1/2" style={{ top: px * 1.05 }}>
              <span
                ref={dust}
                className="absolute rounded-[50%] border-2 border-slate-300/60 opacity-30"
                style={{ width: px * 1.2, height: px * 0.24, left: -px * 0.6, top: -px * 0.12, transform: 'scale(0.35)' }}
              />
              {DUST.map((dx) => (
                <span key={dx} className="coin-dust-bit absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full bg-slate-300/80" style={{ '--dx': `${(dx * px) / 96}px`, animationDelay: `${spinMs * LAND}ms` } as CSSProperties} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
