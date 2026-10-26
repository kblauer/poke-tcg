import { holoPattern, type FlairSlot, type HoloPattern } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import { useTRPC } from '../lib/trpc';

/** The flair each card shows (card flair; cardId → each slot's key), provided once by CardInspectProvider. A card not in it shows its own look. */
export const FlairContext = createContext<ReadonlyMap<string, Partial<Record<FlairSlot, string>>>>(new Map());

/** The account's flair (flair.list): what it bought and what each card shows, loaded once a session and refreshed after a purchase or switch. */
export function useFlairList() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.flair.list.queryOptions(), staleTime: Infinity });
}

/** The flair the cards show, for FlairContext. */
export function useEquippedFlair(): ReadonlyMap<string, Partial<Record<FlairSlot, string>>> {
  const { data } = useFlairList();
  return useMemo(() => {
    const shown = new Map<string, Partial<Record<FlairSlot, string>>>();
    for (const f of data?.equipped ?? []) shown.set(f.cardId, { ...shown.get(f.cardId), [f.slot]: f.key });
    return shown;
  }, [data]);
}

/** The key of the flair the player chose for a card in a slot, or null; always null for a card that isn't the player's (`mine` false: the CPU's). */
export function useFlair(cardId: string | undefined, slot: FlairSlot, mine = true): string | null {
  const shown = useContext(FlairContext);
  return (mine && cardId && shown.get(cardId)?.[slot]) || null;
}

/** The pattern the player chose for a card, or null for its own look (see useFlair). */
export function usePattern(cardId: string | undefined, mine = true): HoloPattern | null {
  return holoPattern(useFlair(cardId, 'pattern', mine)) ?? null;
}
