import type { GameAction, PlayerView } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Board, type LastMove } from '../components/Board';
import { COIN_MS } from '../components/CoinFlip';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

/** How long each move of a reply stays on screen before the next one, plus the time for its coin flips. */
const MOVE_MS = 900;

/** A move still to be shown: the view after it, and how long to show it. */
type Frame = LastMove & { view: PlayerView; ms: number };

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);
  /** The moves of the last reply still being played back, oldest first; the board shows the first. */
  const [replay, setReplay] = useState<Frame[]>([]);
  /** The move that led to the view on screen, for its animation. */
  const [lastMove, setLastMove] = useState<LastMove | null>(null);

  // The response already includes the CPU's reply, so no polling or realtime is needed. It comes as the
  // view after every move; the cache gets the last one, and the rest are played back one at a time.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: ({ frames }) => {
        const final = frames.at(-1)!;
        let seen = data?.view.log.at(-1)?.n ?? 0;
        const timed = frames.slice(0, -1).map((f) => {
          const coins = f.view.log.filter((e) => e.coin && (e.n ?? 0) > seen).length;
          seen = f.view.log.at(-1)?.n ?? seen;
          return { player: f.player, type: f.type, version: f.view.version, view: f.view, ms: MOVE_MS + coins * COIN_MS };
        });
        queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view: final.view });
        setReplay(timed);
        setLastMove({ player: final.player, type: final.type, version: final.view.version });
      },
      onError: () => {
        setReplay([]);
        queryClient.invalidateQueries({ queryKey: viewQuery.queryKey });
      },
    }),
  );

  const current = replay[0];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setReplay((r) => r.slice(1)), current.ms);
    return () => clearTimeout(timer);
  }, [current]);

  if (error) return <p className={`${PAGE_WIDTH} text-red-400`}>{error.message}</p>;
  if (!data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const view = data.view;
  const replaying = current !== undefined;
  // One move at a time: a second click would be built on a stale version and rejected. Nothing can be done while the reply plays.
  const send = (action: GameAction) => {
    if (!act.isPending && !replaying) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  return (
    <Board
      gameId={gameId}
      view={current?.view ?? view}
      lastMove={current ?? lastMove}
      replaying={replaying}
      send={send}
      pending={pending}
      error={act.error?.message}
      errorAt={act.submittedAt}
    />
  );
}
