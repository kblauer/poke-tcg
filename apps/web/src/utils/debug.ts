import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

/**
 * Whether this build includes the debug tools (testing cheats): on in the dev server, off in a
 * production build (`vite build`) unless VITE_ENABLE_DEBUG=true; VITE_ENABLE_DEBUG=false turns it off
 * in dev too. Set in vite.config.ts as a constant, so a production build drops the guarded code.
 */
export const DEBUG_BUILD: boolean = __DEBUG_BUILD__;

/**
 * In place of a debug procedure's mutation options in a build without the debug tools, so a hook can still be called:
 * `useMutation(DEBUG_BUILD ? trpc.x.debugY.mutationOptions(…) : NO_DEBUG)`. Written out as that ternary at each place (not
 * in a helper taking a function), the build drops the procedure's name with the rest (scripts/check-dist.mjs checks).
 */
export const NO_DEBUG = { mutationFn: () => Promise.reject(new Error('The debug tools are off in this build.')) } as never;

/**
 * Whether to offer the debug tools: the build includes them and the API accepts them (it refuses
 * them in production whatever the client does, see debugProcedure in the API).
 */
export function useDebugEnabled(): boolean {
  return useDebugStatus() === 'on';
}

/** As useDebugEnabled, but 'loading' until the API has answered (for a page that's only there in debug: the Idle Adventure). */
export function useDebugStatus(): 'on' | 'off' | 'loading' {
  const trpc = useTRPC();
  const { data, isPending } = useQuery({ ...trpc.debug.enabled.queryOptions(), enabled: DEBUG_BUILD, staleTime: Infinity });
  if (!DEBUG_BUILD) return 'off';
  return data === true ? 'on' : isPending ? 'loading' : 'off';
}
