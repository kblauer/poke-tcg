import { DEFAULT_COSMETIC, type CosmeticKind } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { useTRPC } from '../lib/trpc';
import { cardBackUrl } from '../utils/cardBack';

/** A deck's cosmetics (assigned on the Cosmetics tab): each an id, or null for the account's default. */
export type DeckCosmetics = Record<CosmeticKind, string | null>;

/** The battle's deck's cosmetics (the game page's, from game.view); null outside a battle. */
export const DeckCosmeticsContext = createContext<DeckCosmetics | null>(null);

/**
 * The cosmetics in use: in a battle those assigned to its deck (DeckCosmeticsContext), otherwise and for any kind it has
 * none of, the account's defaults (cosmetics.list's `defaults`, set on the Cosmetics tab): the card back's image, for the
 * player's own face-down cards, the playmat's id (Playmat.tsx) and the coin's (coinDesigns.tsx). The built-in defaults
 * until they've loaded.
 */
export function useCosmetics() {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.cosmetics.list.queryOptions(), staleTime: 5 * 60_000 });
  const deck = useContext(DeckCosmeticsContext);
  const pick = (kind: CosmeticKind) => deck?.[kind] ?? data?.defaults[kind] ?? DEFAULT_COSMETIC[kind];
  return { cardBack: cardBackUrl(pick('cardBack')), playmat: pick('playmat'), coin: pick('coin') };
}
