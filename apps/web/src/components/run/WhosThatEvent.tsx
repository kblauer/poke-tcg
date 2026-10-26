import { WHOS_THAT_RUN_MS, type WhosThatShape } from '@poke-tcg/campaign';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { Toasts } from '../Toasts';
import { NamingScreen } from '../whos-that/NamingScreen';
import { WhosThatScreen } from '../whos-that/WhosThatScreen';
import { EncounterBadge } from './encounterIcons';

const panel = 'space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600';
const button = 'rounded bg-slate-600 px-4 py-2 font-semibold transition hover:bg-slate-500 active:scale-95 disabled:opacity-40';
const primary = 'rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40';

/**
 * A run's Who's That Pokémon? event (README: Who's That Pokémon?): Play shows the silhouette (`whosThat.runStart`) and
 * 10 seconds to type its name on Emerald's naming screen and press Enter (NamingScreen; `whosThat.runGuess`; the time is
 * the server's, the bar only shows it); named in time wins
 * the EXP. When the bar runs out the browser asks the server to settle it. Won or missed, the Pokémon is revealed and the
 * run moves on only with Continue (the settled run is held until then). Taken up again after a reload: the same picture,
 * the clock still running. Walking away is only before it starts.
 */
export function WhosThatEvent({ view, run }: { view: RunViewData; run: RunControl }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const e = view.encounter;
  const event = e?.kind === 'event' && e.event.id === 'whosThat' ? e.event : null;
  const runId = run.run?.id;
  const setRun = (next: NonNullable<RunControl['run']>) => queryClient.setQueryData(trpc.run.overview.queryKey(), (old) => old && { ...old, run: next });

  const [shape, setShape] = useState<WhosThatShape | null>(null);
  // When the 10 seconds are up, by this browser's clock (the server's time left, from when its answer came).
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const guess = useMutation(trpc.whosThat.runGuess.mutationOptions({ onError: (err) => toasts.push('error', err.message) }));
  const [result, setResult] = useState<Extract<NonNullable<typeof guess.data>, { run: unknown }> | null>(null);
  const start = useMutation(
    trpc.whosThat.runStart.mutationOptions({
      onSuccess: (r) => {
        setShape(r.shape);
        setDeadline(Date.now() + r.remainingMs);
        setRun(r.run);
      },
      onError: (err) => toasts.push('error', err.message),
    }),
  );

  // Already started (a reload): the same picture and clock again.
  const resumed = useRef(false);
  useEffect(() => {
    if (event?.startedAt === undefined || shape || resumed.current || !runId || !run.run) return;
    resumed.current = true;
    start.mutate({ runId, expectedVersion: run.run.version });
  }, [event?.startedAt, shape, runId, run.run, start]);

  const playing = shape !== null && deadline !== null && !result;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [playing]);

  const send = async (text: string) => {
    if (!runId || result) return false;
    const r = await guess.mutateAsync({ runId, guess: text });
    if (r.result === 'wrong') return false;
    setResult(r);
    return true;
  };

  // The bar ran out: the server settles it (an empty name), once.
  const timedOut = useRef(false);
  useEffect(() => {
    if (!playing || deadline === null || now < deadline || timedOut.current || guess.isPending) return;
    timedOut.current = true;
    void send('').then((settled) => {
      if (!settled) timedOut.current = false;
    });
  });

  if (!event) return null;
  const left = deadline === null ? WHOS_THAT_RUN_MS : Math.max(0, deadline - now);

  return (
    <div className={panel}>
      <div className="flex items-center gap-3">
        <EncounterBadge kind="event" size={40} />
        <h3 className="text-lg font-semibold">{view.event?.title}</h3>
      </div>
      {shape === null ? (
        <>
          <p className="text-sm text-slate-300">{view.event?.text}</p>
          <div className="flex gap-2">
            <button className={primary} disabled={run.busy || start.isPending} onClick={() => runId && run.run && start.mutate({ runId, expectedVersion: run.run.version })}>
              {view.event?.accept}
            </button>
            <button className={button} disabled={run.busy || start.isPending} onClick={() => run.send({ type: 'LEAVE' })}>
              Walk away
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mx-auto max-w-2xl">
          <WhosThatScreen shape={shape} reveal={result && { cardId: result.cardId, answer: result.answer }}>
            {!result && (
              <div className="absolute inset-x-0 top-0 h-2 bg-slate-900/40">
                <div className="h-full bg-yellow-300 transition-[width] duration-75 ease-linear" style={{ width: `${(left / WHOS_THAT_RUN_MS) * 100}%` }} />
              </div>
            )}
          </WhosThatScreen>
          </div>
          {result ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-300">{result.result === 'won' ? `You named it in time: +${result.exp} EXP!` : "Time's up!"}</p>
              <button className={primary} autoFocus onClick={() => setRun(result.run)}>
                Continue
              </button>
            </div>
          ) : (
            <>
              <div className="text-right font-mono text-lg tabular-nums">{(left / 1000).toFixed(1)}</div>
              <div className="mx-auto max-w-[480px]">
                <NamingScreen round={0} onSubmit={send} />
              </div>
            </>
          )}
        </>
      )}
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}
