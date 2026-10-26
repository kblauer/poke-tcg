import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The battle transitions (the user's: several, one at random each battle), as the mainline games' trainer battles open:
 * each starts with the screen flashing white twice (FLASH_MS), then closes it black over WIPE_MS. blinds: bands sweeping
 * in from alternate sides; iris: a circle closing on the middle; shutters: the top and bottom halves closing; bars:
 * columns dropping and rising in turn; diagonal: a wipe from the top left corner. First the Battle Tower's, then every
 * Play mode's battle (the user's): a run's, after its trainer's "!", Training's and the Battle Tower's (`useBattleTransition`),
 * all over the play area; the Idle Adventure's over its scene (`SceneTransition`).
 */
const TRANSITIONS = ['blinds', 'iris', 'shutters', 'bars', 'diagonal'] as const;
type Transition = { kind: (typeof TRANSITIONS)[number]; stamp: number };
const FLASH_MS = 450;
const WIPE_MS = 650;
/** The blinds' bands and the bars' columns, each starting BAND_STAGGER_MS after the one before. */
const BANDS = 8;
const BAND_STAGGER_MS = 25;
/** The whole transition, its last band's wipe included, a moment held closed at its end. */
export const TRANSITION_MS = FLASH_MS + WIPE_MS + (BANDS - 1) * BAND_STAGGER_MS + 150;
/** How long the black takes to lift once the battle's page is open (useBattleTransition's). */
const LIFT_MS = 300;

/** One of TRANSITIONS at random. */
const randomTransition = (): Transition => ({ kind: TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)]!, stamp: Date.now() });

/** Where a play-area transition goes (fixed, in px from the window's edges). */
type Bounds = { top: number; left: number; right: number; bottom: number };

/**
 * The play area's part of the window (the user's: the transitions cover the page, not the site menu
 * or the top bar): the layout's `<main>` (`data-battle-area`) below the sticky top bar (`data-top-bar`); the whole window without them.
 */
function playArea(): Bounds {
  const main = document.querySelector('[data-battle-area]')?.getBoundingClientRect();
  const bar = document.querySelector('[data-top-bar]')?.getBoundingClientRect();
  if (!main) return { top: 0, left: 0, right: 0, bottom: 0 };
  return { top: Math.max(0, main.top, bar?.bottom ?? 0), left: Math.max(0, main.left), right: Math.max(0, window.innerWidth - main.right), bottom: 0 };
}

/**
 * A battle transition over `bounds`: the double flash, then the screen closing (TransitionLayers). It stays closed until
 * `lifting` fades it out.
 */
function BattleTransition({ kind, bounds, lifting }: { kind: Transition['kind']; bounds: Bounds; lifting: boolean }) {
  return (
    <div className="pointer-events-none fixed overflow-hidden" style={{ ...bounds, zIndex: 10000, opacity: lifting ? 0 : 1, transition: `opacity ${LIFT_MS}ms` }}>
      <TransitionLayers kind={kind} />
    </div>
  );
}

/**
 * A battle transition inside its parent (the Idle Adventure's scene, the user's: the play area's transitions, not its
 * own flash): one of TRANSITIONS at random, chosen when it mounts, over the parent's whole box, staying closed at its end.
 */
export function SceneTransition() {
  const [kind] = useState(() => randomTransition().kind);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <TransitionLayers kind={kind} />
    </div>
  );
}

/** A transition's layers: the double flash, then the screen closing (the keyframes in index.css, `tower-*`), each band a little after the one before. */
function TransitionLayers({ kind }: { kind: Transition['kind'] }) {
  const run = (name: string, delay = 0, extra: CSSProperties = {}): CSSProperties => ({ animation: `${name} ${WIPE_MS}ms ease-in ${FLASH_MS + delay}ms both`, ...extra });
  const black = 'absolute bg-black';
  return (
    <>
      {kind === 'blinds' &&
        Array.from({ length: BANDS }, (_, i) => (
          <div key={i} className={`${black} inset-x-0`} style={{ top: `${(100 / BANDS) * i}%`, height: `${100 / BANDS + 0.5}%`, transformOrigin: i % 2 ? 'right' : 'left', ...run('tower-wipe-x', i * BAND_STAGGER_MS) }} />
        ))}
      {kind === 'bars' &&
        Array.from({ length: BANDS }, (_, i) => (
          <div key={i} className={`${black} inset-y-0`} style={{ left: `${(100 / BANDS) * i}%`, width: `${100 / BANDS + 0.5}%`, transformOrigin: i % 2 ? 'bottom' : 'top', ...run('tower-wipe-y', i * BAND_STAGGER_MS) }} />
        ))}
      {kind === 'shutters' && (
        <>
          <div className={`${black} inset-x-0 top-0 h-1/2`} style={{ transformOrigin: 'top', ...run('tower-wipe-y') }} />
          <div className={`${black} inset-x-0 bottom-0 h-1/2`} style={{ transformOrigin: 'bottom', ...run('tower-wipe-y') }} />
        </>
      )}
      {kind === 'iris' && <div className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full" style={run('tower-iris', 0, { boxShadow: '0 0 0 200vmax black' })} />}
      {kind === 'diagonal' && <div className="absolute inset-0 bg-black" style={run('tower-diagonal')} />}
      <div className="absolute inset-0 bg-white" style={{ animation: `tower-flash ${FLASH_MS}ms linear both` }} />
    </>
  );
}

/** Plays a transition over the play area, then `open` (the battle's page: its navigation, awaited), then lifts the black. */
type Open = (open: () => unknown) => Promise<void>;
const TransitionContext = createContext<Open | null>(null);

/**
 * The play area's battle transition (in the layout): `useBattleTransition()(open)` plays one at random over the page
 * (`playArea`, measured as it starts), opens the battle
 * when the screen is closed and fades the black away once its page is there. A second call while one plays replaces it.
 */
export function BattleTransitionProvider({ children }: { children: ReactNode }) {
  const [transition, setTransition] = useState<(Transition & { bounds: Bounds }) | null>(null);
  const [lifting, setLifting] = useState(false);
  const current = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const wait = (ms: number) => new Promise<void>((done) => timers.current.push(window.setTimeout(done, ms)));
  const play = useCallback<Open>(async (open) => {
    const t = { ...randomTransition(), bounds: playArea() };
    current.current = t.stamp;
    setLifting(false);
    setTransition(t);
    try {
      await wait(TRANSITION_MS);
      if (current.current !== t.stamp) return;
      await open();
    } finally {
      if (current.current === t.stamp) {
        setLifting(true);
        await wait(LIFT_MS);
        if (current.current === t.stamp) setTransition(null);
      }
    }
  }, []);
  return (
    <TransitionContext.Provider value={play}>
      {children}
      {transition && <BattleTransition key={transition.stamp} kind={transition.kind} bounds={transition.bounds} lifting={lifting} />}
    </TransitionContext.Provider>
  );
}

/** The play area's battle transition (BattleTransitionProvider's); without the provider, the battle just opens. */
export function useBattleTransition(): Open {
  return useContext(TransitionContext) ?? (async (open) => void (await open()));
}
