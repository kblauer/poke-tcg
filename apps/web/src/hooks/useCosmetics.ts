import { DEFAULT_COSMETIC } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { cardBackUrl } from '../utils/cardBack';

/**
 * The account's cosmetics in use (cosmetics.list): its card back's image, for its own face-down cards, its playmat's id
 * (Playmat.tsx) and its coin's (coinDesigns.tsx). The defaults until they've loaded.
 */
export function useCosmetics() {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.cosmetics.list.queryOptions(), staleTime: 5 * 60_000 });
  return { cardBack: cardBackUrl(data?.cardBack ?? DEFAULT_COSMETIC.cardBack), playmat: data?.playmat ?? DEFAULT_COSMETIC.playmat, coin: data?.coin ?? DEFAULT_COSMETIC.coin };
}
