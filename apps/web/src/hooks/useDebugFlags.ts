import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { DEBUG_BUILD, NO_DEBUG, useDebugEnabled } from '../utils/debug';

/**
 * The Settings page's debug switch (debug.flags; only while debugging): `unlockAll`, everything locked unlocked
 * (cards, packs, run types, Battle Tower floors, cosmetics, card flair); `set` changes it. `add` adds 1,000,000 to the bank,
 * Stardust or EXP (a button, each press adding it again). Both reload everything they touch (every query: unlocks, packs, the bank…).
 */
export function useDebugFlags() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const debug = useDebugEnabled();
  const flags = useQuery({ ...trpc.debug.flags.queryOptions(), enabled: debug });
  const set = useMutation(DEBUG_BUILD ? trpc.debug.setFlags.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }) : NO_DEBUG);
  const add = useMutation(DEBUG_BUILD ? trpc.debug.addCurrency.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }) : NO_DEBUG);
  return {
    debug,
    unlockAll: debug && !!flags.data?.unlockAll,
    loaded: flags.data !== undefined,
    set,
    add,
    pending: set.isPending || add.isPending,
  };
}
