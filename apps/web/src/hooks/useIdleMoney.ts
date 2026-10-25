import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';

/**
 * The Idle Adventure run's money while the player is in the mode (its page), for the top bar (as the Battle Tower's BP:
 * useTowerBp); null anywhere else. Apart from useIdle.ts so the layout doesn't load the mode's data.
 */
export function useIdleMoney(): number | null {
  const trpc = useTRPC();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const run = useQuery({ ...trpc.idle.overview.queryOptions(), enabled: path === '/idle' }).data?.run;
  return path === '/idle' && run?.status === 'ACTIVE' ? run.view.money : null;
}
