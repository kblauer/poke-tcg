import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTRPC } from '../lib/trpc';

/**
 * The account's favorite cards (the Collection tab's Favorites filter): `ids` the latest first, `isFavorite`,
 * and `toggle` to add a card or take it out. A toggle shows at once and is undone if it can't be saved.
 */
export function useFavorites() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.decks.favorites.queryKey();
  const favorites = useQuery(trpc.decks.favorites.queryOptions());
  const set = useMutation(
    trpc.decks.setFavorite.mutationOptions({
      onMutate: async ({ cardId, favorite }) => {
        await queryClient.cancelQueries({ queryKey: key });
        const before = queryClient.getQueryData(key);
        queryClient.setQueryData(key, (old = []) => [...(favorite ? [cardId] : []), ...old.filter((id) => id !== cardId)]);
        return { before };
      },
      onError: (_error, _input, saved) => saved && queryClient.setQueryData(key, saved.before),
      onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    }),
  );
  const ids = useMemo(() => favorites.data ?? [], [favorites.data]);
  const favoriteSet = useMemo(() => new Set(ids), [ids]);
  const isFavorite = useCallback((cardId: string) => favoriteSet.has(cardId), [favoriteSet]);
  const toggle = useCallback((cardId: string) => set.mutate({ cardId, favorite: !favoriteSet.has(cardId) }), [set, favoriteSet]);
  return { ids, isFavorite, toggle };
}
