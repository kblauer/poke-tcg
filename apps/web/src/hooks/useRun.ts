import type { AppRouter } from '@poke-tcg/api/router';
import type { RunAction, RunTypeId } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../lib/trpc';

export type Overview = inferRouterOutputs<AppRouter>['run']['overview'];
export type ClientRun = NonNullable<Overview['run']>;
export type RunViewData = ClientRun['view'];

/**
 * The home screen's data (account, latest run, decks, run types) and the run's moves. A move that starts
 * a battle goes straight to its game; every move replaces the cached run with the server's answer.
 */
export function useRun() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const overviewKey = trpc.run.overview.queryKey();
  // Always fresh on arrival: decks edited on the Collection tab change which ones can start a run.
  const overview = useQuery({ ...trpc.run.overview.queryOptions(), staleTime: 0 });
  const run = overview.data?.run ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: overviewKey });
  const onRun = {
    onSuccess: (next: ClientRun) => {
      queryClient.setQueryData(overviewKey, (old) => old && { ...old, run: next });
      // A card gained is unlocked for the deck builder at once.
      if (next.view.gained.length !== run?.view.gained.length) {
        queryClient.invalidateQueries({ queryKey: trpc.decks.unlocked.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
      }
      if (next.gameId && next.gameId !== run?.gameId) navigate({ to: '/game/$gameId', params: { gameId: next.gameId } });
      // Escaped from the battle (an Escape Rope): back to the run.
      else if (run?.gameId && !next.gameId) navigate({ to: '/' });
    },
    onError: refresh,
  };
  const act = useMutation(trpc.run.act.mutationOptions(onRun));
  const choose = useMutation(trpc.run.choose.mutationOptions(onRun));
  // Using an item also changes how many are left.
  const itemUse = useMutation(
    trpc.run.useItem.mutationOptions({
      ...onRun,
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }),
    }),
  );
  const retry = useMutation(trpc.run.retry.mutationOptions(onRun));
  const start = useMutation(trpc.run.start.mutationOptions({ onSuccess: refresh }));

  const busy = act.isPending || choose.isPending || itemUse.isPending || retry.isPending || start.isPending;
  const error = act.error ?? choose.error ?? itemUse.error ?? retry.error ?? start.error;
  return {
    overview,
    run,
    busy,
    error: error?.message ?? null,
    send(action: RunAction) {
      if (run && !busy) act.mutate({ runId: run.id, expectedVersion: run.version, action });
    },
    /** Takes option `option` on the map; for a battle, `deckId` switches to that deck first. */
    choose(option: number, deckId?: string) {
      if (run && !busy) choose.mutate({ runId: run.id, expectedVersion: run.version, option, deckId });
    },
    applyItem(itemId: string) {
      if (run && !busy) itemUse.mutate({ runId: run.id, itemId });
    },
    retry() {
      if (run && !busy) retry.mutate({ runId: run.id });
    },
    start(type: RunTypeId, deckId: string) {
      if (!busy) start.mutate({ type, deckId });
    },
  };
}

export type RunControl = ReturnType<typeof useRun>;
