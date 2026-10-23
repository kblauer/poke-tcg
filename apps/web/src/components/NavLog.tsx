import type { LogEntry, PlayerId, PlayerView } from '@poke-tcg/game-engine';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** The game on screen's log, for the site menu's Battle log tab (NavRail), and its id and view for the Debug tab. */
export type GameLogFeed = { log: LogEntry[]; you: PlayerId; gameId: string; view: PlayerView };

const NavLogContext = createContext<{ game: GameLogFeed | null; setGame: (game: GameLogFeed | null) => void } | null>(null);

/** Around the layout: holds the log the game page passes up (useGameLogInNav) for the site menu. */
export function NavLogProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameLogFeed | null>(null);
  return <NavLogContext.Provider value={{ game, setGame }}>{children}</NavLogContext.Provider>;
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
