import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTRPC } from '../lib/trpc';
import type { CatalogCard } from '../utils/cardList';

/**
 * Which cards the account has unlocked (the starter deck's, and every card gained in a run). `isLocked`
 * says a card isn't; basic Energy never is, but holo Energy is until it's pulled from a pack. `copies` is how many
 * of a holo Energy were pulled: a deck holds no more. Until the list loads, nothing shows as locked.
 */
export function useUnlocked() {
  const trpc = useTRPC();
  // Kept until something unlocks a card, which invalidates it (a run's gained cards, packs, crafting, the BP Shop, the
  // debug switches): the account's whole list, thousands of rows, so not fetched again by each deck tile that mounts.
  const unlocked = useQuery({ ...trpc.decks.unlocked.queryOptions(), staleTime: Infinity });
  const owned = useMemo(() => (unlocked.data ? new Map(Object.entries(unlocked.data)) : null), [unlocked.data]);
  const isLocked = useCallback(
    (card: Pick<CatalogCard, 'id' | 'basicEnergy'> & { holoEnergy?: unknown }) => owned !== null && (!card.basicEnergy || !!card.holoEnergy) && !owned.has(card.id),
    [owned],
  );
  const copies = useCallback((cardId: string) => owned?.get(cardId) ?? 0, [owned]);
  /** The copies unlocked of a holo, for the CardInspector: the count of one that counts them, 4 of a holo-only card once it's unlocked. Undefined for other cards. */
  const holoCopies = useCallback(
    (card: CatalogCard) => (card.limitedCopies ? copies(card.id) : card.holo ? (isLocked(card) ? 0 : 4) : undefined),
    [copies, isLocked],
  );
  return { isLocked, copies, holoCopies, loaded: owned !== null };
}
