import { holoPattern, type HoloPattern } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import { useTRPC } from '../lib/trpc';

/** The holo pattern each card shows (card flair; cardId → a HOLO_PATTERNS key), provided once by CardInspectProvider. A card not in it shows its own. */
export const FlairContext = createContext<ReadonlyMap<string, string>>(new Map());

/** The account's flair (flair.list): what it bought and what each card shows, loaded once a session and refreshed after a purchase or switch. */
export function useFlairList() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.flair.list.queryOptions(), staleTime: Infinity });
}

/** The patterns the cards show, for FlairContext. */
export function useEquippedPatterns(): ReadonlyMap<string, string> {
  const { data } = useFlairList();
  return useMemo(() => new Map(data?.equipped.filter((f) => f.slot === 'pattern').map((f) => [f.cardId, f.key])), [data]);
}

/** The pattern the player chose for a card, or null for its own look; always null for a card that isn't the player's (`mine` false: the CPU's). */
export function usePattern(cardId: string | undefined, mine = true): HoloPattern | null {
  const patterns = useContext(FlairContext);
  return (mine && cardId && holoPattern(patterns.get(cardId))) || null;
}
