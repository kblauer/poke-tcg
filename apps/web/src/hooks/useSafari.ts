import type { AppRouter } from '@poke-tcg/api/router';
import type { SafariAction } from '@poke-tcg/safari';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useMemo } from 'react';
import { useTRPC } from '../lib/trpc';

export type SafariOverview = inferRouterOutputs<AppRouter>['safari']['overview'];
export type ClientSafari = NonNullable<SafariOverview['run']>;
export type SafariViewData = ClientSafari['view'];
export type SafariUnit = inferRouterOutputs<AppRouter>['safari']['units'][number];

/** Safari Draft's run (safari.overview): the latest, under way or over. */
export function useSafariOverview() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.safari.overview.queryOptions(), staleTime: 0 });
}

/** Every draft unit by its card id (safari.units: the same for every account, so kept for the session). */
export function useSafariUnits() {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.safari.units.queryOptions(), staleTime: Infinity, gcTime: Infinity });
  return useMemo(() => new Map((data ?? []).map((u) => [u.id, u])), [data]);
}

/**
 * The draft's moves: starting a run and the player's actions (safari.act), each putting the server's answer in the cached
 * overview; a won run's ₱ reach the bank, so the account's figures are fetched again then.
 */
export function useSafariActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.safari.overview.queryKey();
  const onRun = {
    onSuccess: (next: ClientSafari) => {
      queryClient.setQueryData(key, { run: next });
      if (next.status !== 'ACTIVE') queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
    },
  };
  const start = useMutation(trpc.safari.start.mutationOptions(onRun));
  const act = useMutation(trpc.safari.act.mutationOptions(onRun));
  return {
    busy: start.isPending || act.isPending,
    start: () => start.mutateAsync(),
    act: (run: ClientSafari, action: SafariAction) => act.mutateAsync({ runId: run.id, expectedVersion: run.version, action }),
  };
}
