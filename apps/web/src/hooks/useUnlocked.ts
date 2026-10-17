import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTRPC } from '../lib/trpc';
import type { CatalogCard } from '../utils/cardList';

/**
 * Which cards the account has unlocked (the starter deck's, and every card gained in a run). `isLocked`
 * says a card isn't; basic Energy never is. Until the list loads, nothing shows as locked.
 */
export function useUnlocked() {
  const trpc = useTRPC();
  const unlocked = useQuery(trpc.decks.unlocked.queryOptions());
  const ids = useMemo(() => (unlocked.data ? new Set(unlocked.data) : null), [unlocked.data]);
  const isLocked = useCallback((card: Pick<CatalogCard, 'id' | 'basicEnergy'>) => ids !== null && !card.basicEnergy && !ids.has(card.id), [ids]);
  return { isLocked, loaded: ids !== null };
}
