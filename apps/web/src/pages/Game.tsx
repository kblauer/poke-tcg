import type { GameAction } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Board } from '../components/Board';
import { useTRPC } from '../lib/trpc';

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);

  // The response already includes the CPU's reply, so no polling or realtime is needed.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: (view) => queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view }),
      onError: () => queryClient.invalidateQueries({ queryKey: viewQuery.queryKey }),
    }),
  );

  if (error) return <p className="text-red-400">{error.message}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const view = data.view;
  // One move at a time: a second click would be built on a stale version and rejected.
  const send = (action: GameAction) => {
    if (!act.isPending) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  return <Board view={view} send={send} pending={pending} error={act.error?.message} />;
}
