import { loadRunMaps, type RunMaps } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';

/**
 * A run type's maps (its routes and gym), loaded with its region's (loadRunMaps: the site holds no region's tile maps until
 * a run screen asks for them; apps/web/scripts/check-dist.mjs checks it). Undefined while they load (or with no run type);
 * kept for the session once loaded. The run screen, its heading and auto play share them (one load per region).
 */
export function useRunMaps(typeId: string | undefined): { maps: RunMaps | undefined; error: Error | null } {
  const query = useQuery({ queryKey: ['runMaps', typeId], queryFn: () => loadRunMaps(typeId!), enabled: !!typeId, staleTime: Infinity, gcTime: Infinity });
  return { maps: query.data, error: query.error };
}
