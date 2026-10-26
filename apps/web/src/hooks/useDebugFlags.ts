import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { useDebugEnabled } from '../utils/debug';

/**
 * The Settings page's debug switches (debug.flags; only while debugging): `unlockAll`, everything locked unlocked
 * (cards, packs, run types, Battle Tower floors, cosmetics, card flair), and `million`, 1,000,000 ₱ added to the bank. `set`
 * changes them and reloads everything they touch (every query: unlocks, packs, the bank…).
 */
export function useDebugFlags() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const debug = useDebugEnabled();
  const flags = useQuery({ ...trpc.debug.flags.queryOptions(), enabled: debug });
  const set = useMutation(trpc.debug.setFlags.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }));
  return { debug, unlockAll: debug && !!flags.data?.unlockAll, million: debug && !!flags.data?.million, loaded: flags.data !== undefined, set, pending: set.isPending };
}
