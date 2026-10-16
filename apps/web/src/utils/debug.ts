import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

/**
 * Whether this build includes the debug tools (testing cheats): on in the dev server, off in a
 * production build (`vite build`) unless VITE_ENABLE_DEBUG=true; VITE_ENABLE_DEBUG=false turns it off
 * in dev too. Set in vite.config.ts as a constant, so a production build drops the guarded code.
 */
export const DEBUG_BUILD: boolean = __DEBUG_BUILD__;

/**
 * Whether to offer the debug tools: the build includes them and the API accepts them (it refuses
 * them in production whatever the client does, see debugProcedure in the API).
 */
export function useDebugEnabled(): boolean {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.debug.enabled.queryOptions(), enabled: DEBUG_BUILD, staleTime: Infinity });
  return DEBUG_BUILD && data === true;
}
