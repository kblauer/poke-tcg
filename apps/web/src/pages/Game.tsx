import type { GameAction, PlayerView } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Board, type LastMove } from '../components/Board';
import { CoinFlip, flipsAfter, type Flip } from '../components/CoinFlip';
import { RunStats } from '../components/run/RunStats';
import { useIsPhone } from '../hooks/useIsPhone';
import { useRun } from '../hooks/useRun';
import { useSkipFlips } from '../hooks/useSkipFlips';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

/** How long each move of a reply stays on screen before the next one. */
const MOVE_MS = 900;

/** A move still to be shown: the view after it. */
type Frame = LastMove & { view: PlayerView };

const lastEntry = (view: PlayerView) => view.log.at(-1)?.n ?? 0;

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);
  /** The moves of the last action still to be played back, oldest first; the last is the view in the cache. */
  const [replay, setReplay] = useState<Frame[]>([]);
  /** While they play back: the view on screen (the move before the next one). Null shows the cached view. */
  const [shownView, setShownView] = useState<PlayerView | null>(null);
  /** The next move's coin flips, playing before the move is shown. */
  const [flips, setFlips] = useState<Flip[]>([]);
  /** The next move is on screen, and the one after it follows shortly. */
  const [revealed, setRevealed] = useState(false);
  const [skipFlips] = useSkipFlips();
  /** The move that led to the view on screen, for its animation. */
  const [lastMove, setLastMove] = useState<LastMove | null>(null);

  // The response already includes the CPU's reply, so no polling or realtime is needed. It comes as the
  // view after every move; the cache gets the last one, and they're all played back one at a time.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: ({ frames }) => {
        if (data) setShownView(data.view);
        queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view: frames.at(-1)!.view });
        // An action that ends the battle (won or lost) goes straight to the result: no coin flips or move-by-move replay.
        const shown = frames.at(-1)!.view.phase === 'finished' ? frames.slice(-1) : frames;
        setReplay(shown.map((f) => ({ player: f.player, type: f.type, version: f.view.version, view: f.view })));
      },
      onError: () => {
        setReplay([]);
        setShownView(null);
        setFlips([]);
        queryClient.invalidateQueries({ queryKey: viewQuery.queryKey });
      },
    }),
  );

  // Each move's coin flips play first, while the board still shows what came before, so their results only
  // appear once the coins have landed (or are skipped). Then the move is shown, and after a moment the next.
  const next = replay[0];
  const reveal = () => {
    setFlips([]);
    setShownView(next!.view);
    setLastMove({ player: next!.player, type: next!.type, version: next!.version });
    setRevealed(true);
  };
  useEffect(() => {
    if (!next) return;
    const before = shownView ?? data?.view;
    const fresh = before ? flipsAfter(next.view.log, lastEntry(before)) : [];
    // Once the battle is over, its flips aren't shown.
    if (fresh.length && !skipFlips && next.view.phase !== 'finished') setFlips(fresh);
    else reveal();
  }, [next]);
  useEffect(() => {
    if (!revealed) return;
    const last = replay.length === 1;
    const timer = setTimeout(
      () => {
        setRevealed(false);
        setReplay((r) => r.slice(1));
        if (last) setShownView(null);
      },
      last ? 0 : MOVE_MS,
    );
    return () => clearTimeout(timer);
  }, [revealed]);

  if (error) return <p className={`${PAGE_WIDTH} text-red-400`}>{error.message}</p>;
  if (!data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const view = data.view;
  const replaying = next !== undefined;
  // One move at a time: a second click would be built on a stale version and rejected. Nothing can be done while
  // the reply plays back, coin flips included.
  const send = (action: GameAction) => {
    if (!act.isPending && !replaying) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  const shown = shownView ?? view;
  return (
    <>
      <Board
        gameId={gameId}
        view={shown}
        lastMove={lastMove}
        replaying={replaying}
        send={send}
        pending={pending}
        error={act.error?.message}
        errorAt={act.submittedAt}
        runTab={data.runId ? <GameRunTab /> : undefined}
        overlay={
          flips.length > 0 ? (
            <CoinFlip flips={flips} you={view.you} onDone={reveal} />
          ) : (
            shown.phase === 'finished' && <BattleResult view={shown} opponent={data.opponent} run={data.runId !== null} />
          )
        }
        info={<BattleInfo view={shown} opponent={data.opponent} />}
      />
      <BattleBanner view={shown} opponent={data.opponent} />
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

/** Who you're up against, the battle's rules and your items at work, on one line (or nothing, when there's none). */
function BattleInfo({ view, opponent }: { view: PlayerView; opponent: string | null }) {
  const rules = view.rules.flatMap((r) => (r.kind === 'typeDamage' ? [`${r.type[0]!.toUpperCase()}${r.type.slice(1)} Pokémon do ${r.multiplier}× damage`] : []));
  // Your items at work in this battle (their rules carry the item's name).
  const items = [...new Set(view.rules.flatMap((r) => (r.kind !== 'typeDamage' && r.player === view.you && r.label ? [r.label] : [])))];
  if (!opponent && !rules.length && !items.length) return null;
  return (
    <>
      {opponent && <>vs {opponent}</>}
      {rules.length > 0 && <span className="text-violet-300">{opponent && ' · '}{rules.join(' · ')}</span>}
      {items.length > 0 && <span className="text-emerald-300">{(opponent || rules.length > 0) && ' · '}{items.join(', ')}</span>}
    </>
  );
}

/**
 * Who you're up against and the run's battle rules (BattleInfo), at the top of the screen while the battle lasts
 * (on a phone, the board's top line has them instead).
 */
function BattleBanner({ view, opponent }: { view: PlayerView; opponent: string | null }) {
  const phone = useIsPhone();
  if (view.phase === 'finished' || phone || (!opponent && !view.rules.length)) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-2 z-30 -translate-x-1/2 rounded-full bg-slate-800/90 px-4 py-1 text-xs text-slate-300 ring-1 ring-slate-600 empty:hidden">
      <BattleInfo view={view} opponent={opponent} />
    </div>
  );
}

/**
 * Once the battle is over, centred on the play area (the Board's overlay): the result and the way back, to the run
 * for a run's battle, otherwise to the Practice tab.
 */
function BattleResult({ view, opponent, run }: { view: PlayerView; opponent: string | null; run: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const won = view.winner === view.you;
  return (
    <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center p-4">
      <div data-keep-action className="pointer-events-auto w-fit space-y-3 rounded-lg bg-slate-800 p-6 text-center shadow-2xl ring-1 ring-slate-600">
        <p className={`text-2xl font-bold ${won ? 'text-yellow-300' : 'text-rose-300'}`}>{won ? `You beat ${opponent ?? 'your opponent'}!` : `${opponent ?? 'Your opponent'} won.`}</p>
        {run ? (
          <>
            <p className="text-sm text-slate-400">{won ? 'Your reward is waiting.' : 'You lose 1 HP.'}</p>
            <Link
              to="/"
              onClick={() => queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() })}
              className="inline-block rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95"
            >
              Back to the run
            </Link>
          </>
        ) : (
          <Link to="/battle" className="inline-block rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95">
            Next battle
          </Link>
        )}
      </div>
    </div>
  );
}
