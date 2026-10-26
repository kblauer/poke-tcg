import type { AppRouter } from '@poke-tcg/api/router';
import type { TowerAction } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../lib/trpc';

export type TowerOverview = inferRouterOutputs<AppRouter>['tower']['overview'];
export type ClientTower = NonNullable<TowerOverview['challenge']>;
export type TowerViewData = ClientTower['view'];

/** The Battle Tower's desk (tower.overview): the latest challenge, the highest floor beaten, the start floors and the BP. */
export function useTowerOverview(enabled = true) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.tower.overview.queryOptions(), staleTime: 0, enabled });
}

/**
 * The account's Battle Points while the player is in the Battle Tower mode (its page, or its challenge's battle), for the
 * top bar (the user's: shown only then); null anywhere else.
 */
export function useTowerBp(): number | null {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const game = path.startsWith('/game/') ? path.slice('/game/'.length) : null;
  const tower = useTowerOverview(path === '/tower' || !!game).data;
  if (!tower) return null;
  return path === '/tower' || (game && tower.challenge?.gameId === game) ? tower.bp : null;
}

/** A challenge under way and not saved: no run or Training battle starts until it's saved or over (the server refuses them). */
export const towerUnderway = (challenge: ClientTower | null | undefined) => challenge?.status === 'ACTIVE' && !challenge.view.saved;

/**
 * The Battle Tower's moves: starting a challenge and the attendant's and receptionist's choices (tower.act), each
 * putting the server's answer in the cached overview; `skip` is debug's Skip battle.
 */
export function useTowerActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.tower.overview.queryKey();
  const onTower = {
    onSuccess: (next: ClientTower) => {
      queryClient.setQueryData(key, (old) => old && { ...old, challenge: next });
      // A win's ₱ and EXP are the account's at once (the top bar's figures), and its floor may unlock start floors.
      queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
      queryClient.invalidateQueries({ queryKey: key });
    },
  };
  const start = useMutation(trpc.tower.start.mutationOptions(onTower));
  const act = useMutation(trpc.tower.act.mutationOptions(onTower));
  const skip = useMutation(trpc.tower.debugSkipBattle.mutationOptions(onTower));
  return {
    busy: start.isPending || act.isPending || skip.isPending,
    start: (deckId: string, startFloor: number) => start.mutateAsync({ deckId, startFloor }),
    act: (challenge: ClientTower, action: TowerAction) => act.mutateAsync({ towerId: challenge.id, expectedVersion: challenge.version, action }),
    skip: (challenge: ClientTower) => skip.mutateAsync({ towerId: challenge.id }),
  };
}

/** The Play tab's pages: its menu, and its four modes. */
const PLAY_PATHS = ['/', '/badge', '/tower', '/idle', '/battle'];
export const isPlayPath = (path: string) => PLAY_PATHS.includes(path);
