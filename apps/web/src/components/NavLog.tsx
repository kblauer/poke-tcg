import type { LogEntry, PlayerId, PlayerView } from '@poke-tcg/game-engine';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The game on screen's log, for the site menu's Battle log tab (NavRail), and its id and view for the Debug tab. */
export type GameLogFeed = { log: LogEntry[]; you: PlayerId; gameId: string; view: PlayerView };

/**
 * The places in the site menu a page can fill with its own figures, buttons and log (useNavPage; Safari Draft's, the
 * user's, 2026-11-22: as the Badge Challenge's run has there): under the pages in the open menu, in the minimised one,
 * and in the phone's ☰ panel. The page draws into them with a portal, so the layout imports nothing of the page's.
 */
export type NavSlotKind = 'open' | 'mini' | 'phone';
export type NavSlots = Record<NavSlotKind, HTMLElement | null>;
const NO_SLOTS: NavSlots = { open: null, mini: null, phone: null };

const NavLogContext = createContext<{
  game: GameLogFeed | null;
  setGame: (game: GameLogFeed | null) => void;
  slots: NavSlots;
  setSlot: (kind: NavSlotKind, el: HTMLElement | null) => void;
  claimed: boolean;
  setClaimed: (claimed: boolean) => void;
} | null>(null);

/** Around the layout: holds the log the game page passes up (useGameLogInNav) for the site menu, and a page's places in it. */
export function NavLogProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameLogFeed | null>(null);
  const [slots, setSlots] = useState<NavSlots>(NO_SLOTS);
  const [claimed, setClaimed] = useState(false);
  const setSlot = useCallback((kind: NavSlotKind, el: HTMLElement | null) => setSlots((s) => (s[kind] === el ? s : { ...s, [kind]: el })), []);
  const value = useMemo(() => ({ game, setGame, slots, setSlot, claimed, setClaimed }), [game, slots, setSlot, claimed]);
  return <NavLogContext.Provider value={value}>{children}</NavLogContext.Provider>;
}

/** The game log the site menu shows, while a game is on screen. */
export function useNavGameLog(): GameLogFeed | null {
  return useContext(NavLogContext)?.game ?? null;
}

/** Shows `feed` (the game page's log, as it's played back) in the site menu while the calling page is mounted. */
export function useGameLogInNav(feed: GameLogFeed | null) {
  const setGame = useContext(NavLogContext)?.setGame;
  useEffect(() => setGame?.(feed), [setGame, feed?.view, feed?.gameId]);
  useEffect(() => () => setGame?.(null), [setGame]);
}

/** Whether the page on screen fills the site menu's places itself (the menu then shows them instead of the run's). */
export function useNavPageClaimed(): boolean {
  return useContext(NavLogContext)?.claimed ?? false;
}

/** One of the site menu's places for the page on screen: an empty element the page draws into (useNavPage). */
export function NavPageSlot({ kind, className }: { kind: NavSlotKind; className?: string }) {
  const setSlot = useContext(NavLogContext)?.setSlot;
  const ref = useCallback((el: HTMLDivElement | null) => setSlot?.(kind, el), [setSlot, kind]);
  return <div ref={ref} className={className} />;
}

/**
 * The site menu's places, the calling page's while it's mounted: draw into each that exists with `createPortal`. The
 * open menu's is a column as tall as the rest of the menu; the minimised one's a narrow column; the phone panel's a block.
 */
export function useNavPage(): NavSlots {
  const ctx = useContext(NavLogContext);
  const setClaimed = ctx?.setClaimed;
  useEffect(() => {
    setClaimed?.(true);
    return () => setClaimed?.(false);
  }, [setClaimed]);
  return ctx?.slots ?? NO_SLOTS;
}
