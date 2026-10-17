import type { GameAction, PlayerView } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Board, type LastMove } from '../components/Board';
import { COIN_MS } from '../components/CoinFlip';
import { RunStats } from '../components/run/RunStats';
import { useRun } from '../hooks/useRun';
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
  const shown = current?.view ?? view;
  return (
    <>
      <Board
        gameId={gameId}
        view={shown}
        lastMove={current ?? lastMove}
        replaying={replaying}
        send={send}
        pending={pending}
        error={act.error?.message}
        errorAt={act.submittedAt}
        runTab={data.runId ? <GameRunTab /> : undefined}
      />
      {data.runId && <RunBattleBanner view={shown} opponent={data.opponent} />}
    </>
  );
}

/** The side panel's Run tab during a run's battle: the run's HP, ₱, EXP and Bag. */
function GameRunTab() {
  const run = useRun();
  const data = run.overview.data;
  if (!data?.run) return <p className="text-xs text-slate-500">Loading…</p>;
  return <RunStats view={data.run.view} account={data.account} run={run} />;
}

/**
 * A run's battle: who you're up against and the run's battle rules, at the top of the screen; once the
 * battle is over, the result and the way back to the run.
 */
function RunBattleBanner({ view, opponent }: { view: PlayerView; opponent: string | null }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const over = view.phase === 'finished';
  const won = view.winner === view.you;
  const rules = view.rules.map((r) => `${r.type[0]!.toUpperCase()}${r.type.slice(1)} Pokémon do ${r.multiplier}× damage`);
  if (!over) {
    if (!opponent && !rules.length) return null;
    return (
      <div className="pointer-events-none fixed left-1/2 top-2 z-30 -translate-x-1/2 rounded-full bg-slate-800/90 px-4 py-1 text-xs text-slate-300 ring-1 ring-slate-600">
        {opponent && <>vs {opponent}</>}
        {rules.length > 0 && <span className="text-violet-300">{opponent && ' · '}{rules.join(' · ')}</span>}
      </div>
    );
  }
  return (
    <div className="fixed inset-x-0 top-1/3 z-40 mx-auto w-fit space-y-3 rounded-lg bg-slate-800 p-6 text-center shadow-2xl ring-1 ring-slate-600">
      <p className={`text-2xl font-bold ${won ? 'text-yellow-300' : 'text-rose-300'}`}>{won ? `You beat ${opponent ?? 'your opponent'}!` : `${opponent ?? 'Your opponent'} won.`}</p>
      <p className="text-sm text-slate-400">{won ? 'Your reward is waiting.' : 'You lose 1 HP.'}</p>
      <Link
        to="/"
        onClick={() => queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() })}
        className="inline-block rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95"
      >
        Back to the run
      </Link>
    </div>
  );
}
