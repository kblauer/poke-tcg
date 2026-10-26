import { WHOS_THAT_PASS_MS, WHOS_THAT_ROUNDS } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useState } from 'react';
import type { AppRouter } from '@poke-tcg/api/router';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { BUTTON, PANEL_HEADING } from '../../utils/styles';
import { seconds } from '../../utils/whosThat';
import { Toasts } from '../Toasts';
import { NamingScreen } from '../whos-that/NamingScreen';
import { WhosThatScreen } from '../whos-that/WhosThatScreen';

type Outputs = inferRouterOutputs<AppRouter>['whosThat'];
type Round = Outputs['start'];
type Results = NonNullable<Outputs['pass']['results']>;
type Board = 'average' | 'fastest' | 'daily';

const primary = 'rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40';
const panel = 'space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600';

/** A Pokémon done in the game under way: its name, and its time (or passed). */
interface Done {
  cardId: string;
  answer: string;
  timeMs: number;
  passed: boolean;
}

/**
 * The Extras page's Who's That Pokémon? (README: Who's That Pokémon?): 10 Pokémon in a row, each named as fast as it can
 * be (typed on Emerald's naming screen and sent with Enter, the next one shown at once: NamingScreen; Pass shows it and
 * counts WHOS_THAT_PASS_MS), the time kept by the server
 * (`whosThat.start`, `guess`, `pass`). Random Pokémon, or today's playlist (the same 10 for everyone, one go a day). The
 * leaderboards beside it (`whosThat.leaderboard`, public): best average, fastest Pokémon, and today's playlist.
 */
export function WhosThat() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const status = useQuery(trpc.whosThat.status.queryOptions());
  const [round, setRound] = useState<Round | null>(null);
  // When the Pokémon on screen was shown, by this browser's clock (the server's time, less how long it's been up).
  const [shownAt, setShownAt] = useState(0);
  const [done, setDone] = useState<Done[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const show = (next: Round) => {
    setRound(next);
    setShownAt(Date.now() - next.elapsedMs);
  };
  const finish = (r: Results) => {
    setRound(null);
    setResults(r);
    void queryClient.invalidateQueries({ queryKey: trpc.whosThat.status.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.whosThat.leaderboard.queryKey() });
  };
  const onError = (err: { message: string }) => toasts.push('error', err.message);
  const start = useMutation(
    trpc.whosThat.start.mutationOptions({
      onSuccess: (r) => {
        setDone([]);
        setResults(null);
        show(r);
      },
      onError,
    }),
  );
  const guess = useMutation(trpc.whosThat.guess.mutationOptions({ onError }));
  const pass = useMutation(
    trpc.whosThat.pass.mutationOptions({
      onSuccess: (r) => {
        setDone((d) => [...d, { cardId: r.cardId, answer: r.answer, timeMs: WHOS_THAT_PASS_MS, passed: true }]);
        if (r.next) show(r.next);
        else if (r.results) finish(r.results);
      },
      onError,
    }),
  );

  useEffect(() => {
    if (!round) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [round]);

  const send = async (text: string) => {
    if (!round) return false;
    const r = await guess.mutateAsync({ gameId: round.gameId, guess: text });
    if (!r.correct) return false;
    setDone((d) => [...d, { cardId: r.cardId, answer: r.answer, timeMs: r.timeMs, passed: false }]);
    if (r.next) show(r.next);
    else if (r.results) finish(r.results);
    return true;
  };

  const daily = status.data?.daily;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {round ? (
          <div className={panel}>
            <div className="flex items-center justify-between gap-3">
              <h3 className={PANEL_HEADING}>
                {round.daily ? "Today's playlist: " : ''}Pokémon {round.index + 1} of {round.total}
              </h3>
              <span className="font-mono text-lg tabular-nums">{seconds(Math.max(0, now - shownAt))}</span>
            </div>
            <WhosThatScreen shape={round.shape} />
            <NamingScreen round={`${round.gameId}:${round.index}`} onSubmit={send} />
            <div className="flex justify-end">
              <button className={BUTTON} disabled={pass.isPending} onClick={() => pass.mutate({ gameId: round.gameId })}>
                Pass
              </button>
            </div>
            <DoneList done={done} />
          </div>
        ) : results ? (
          <div className={panel}>
            <h3 className={PANEL_HEADING}>{results.daily ? "Today's playlist" : 'Your game'}</h3>
            <div className="flex flex-wrap gap-6">
              <Stat label="Average" value={seconds(results.averageMs)} />
              <Stat label="Fastest" value={results.fastestMs === null ? '—' : seconds(results.fastestMs)} />
            </div>
            <DoneList done={done} />
            <div className="flex gap-2">
              <button className={primary} disabled={start.isPending} onClick={() => start.mutate({ daily: false })}>
                Play again
              </button>
              <button className={BUTTON} onClick={() => setResults(null)}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className={panel}>
            <WhosThatScreen shape={null} />
            <p className="text-sm text-slate-300">
              Name {WHOS_THAT_ROUNDS} Pokémon from their silhouettes as fast as you can: type the name, press Enter, and the next one appears at once. A pass shows the Pokémon and counts {WHOS_THAT_PASS_MS / 1000} seconds. Your fastest and
              average times go on the leaderboards.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={primary} disabled={start.isPending} onClick={() => start.mutate({ daily: false })}>
                Play
              </button>
              <button className={primary} disabled={start.isPending || !!daily?.finished} onClick={() => start.mutate({ daily: true })}>
                {daily?.finished ? "Today's playlist: played" : daily ? "Continue today's playlist" : "Today's playlist"}
              </button>
            </div>
            {status.data && (
              <div className="flex flex-wrap gap-6">
                <Stat label="Best average" value={status.data.best.averageMs === null ? '—' : seconds(status.data.best.averageMs)} />
                <Stat label="Fastest" value={status.data.best.fastestMs === null ? '—' : seconds(status.data.best.fastestMs)} />
                <Stat label="Games" value={String(status.data.best.games)} />
                {daily?.finished && <Stat label="Today's playlist" value={seconds(daily.averageMs)} />}
              </div>
            )}
          </div>
        )}
      </div>
      <Leaderboards />
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-mono text-xl tabular-nums">{value}</div>
    </div>
  );
}

/** The Pokémon done so far, in order, with their times. */
function DoneList({ done }: { done: Done[] }) {
  if (!done.length) return null;
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {done.map((d, i) => (
        <li key={i} className={`rounded px-2 py-1 ring-1 ${d.passed ? 'text-slate-400 ring-slate-600' : 'ring-slate-500'}`}>
          {d.answer} <span className="font-mono tabular-nums text-slate-400">{d.passed ? 'passed' : seconds(d.timeMs)}</span>
        </li>
      ))}
    </ol>
  );
}

const BOARDS: { id: Board; label: string }[] = [
  { id: 'average', label: 'Best average' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'daily', label: 'Today' },
];

/** The leaderboards, open to anyone: each player's best average, fastest Pokémon, and today's playlist. */
function Leaderboards() {
  const trpc = useTRPC();
  const [board, setBoard] = useState<Board>('average');
  const data = useQuery(trpc.whosThat.leaderboard.queryOptions({ board }));
  return (
    <div className={`${panel} self-start`}>
      <h3 className={PANEL_HEADING}>Leaderboards</h3>
      <div className="flex gap-1">
        {BOARDS.map((b) => (
          <button key={b.id} className={`rounded px-3 py-1 text-sm transition ${board === b.id ? 'bg-slate-600 text-slate-50' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-50'}`} onClick={() => setBoard(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      {board === 'daily' && data.data && <p className="text-xs text-slate-400">Today's playlist ({data.data.day}, UTC): everyone gets the same {data.data.rounds} Pokémon, one go each.</p>}
      {data.data && !data.data.rows.length ? (
        <p className="text-sm text-slate-400">No one yet. Be the first!</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="w-8 py-1">#</th>
              <th className="py-1">Player</th>
              <th className="py-1 text-right">{board === 'fastest' ? 'Fastest' : 'Average'}</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.rows.map((r) => (
              <tr key={r.rank} className={r.me ? 'text-yellow-300' : ''}>
                <td className="py-1 tabular-nums">{r.rank}</td>
                <td className="truncate py-1">{r.name}</td>
                <td className="py-1 text-right font-mono tabular-nums">{seconds((board === 'fastest' ? r.fastestMs : r.averageMs) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
