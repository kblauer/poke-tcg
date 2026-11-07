import type { InPlayPokemon, PlayerView } from '@poke-tcg/game-engine';
import { useRef } from 'react';
import { isMatType, type MatType } from '../utils/typeMats';

/** The type a type mat shows, and whose Active Pokémon brought it (its burst starts from that card); null side: as the battle was opened. */
export interface MatChoice {
  type: string | null;
  side: 'self' | 'opponent' | null;
}

/**
 * A type mat's type (the user's, 2026-11-06, as Pokémon TCG Live's): the first printed type of the player's Active
 * Pokémon, only theirs (the user's, 2026-11-07: the opponent's never changes it), of the types the mat's set has a scene
 * for (`types`, typeMats.ts's `setTypes`): one of any other type leaves the mat as it is, until another Active Pokémon of the player's changes
 * it. A new card on top of the Active Pokémon (switched in, promoted, evolved) counts as coming in; the Active Spot left
 * empty for a moment and filled by the same card doesn't. A battle opened part way through starts on its type.
 */
export function useMatType(view: PlayerView, types: readonly MatType[] = []): MatChoice {
  const typeOf = (p: InPlayPokemon | null) => {
    const def = p ? view.cards[p.card.defId] : undefined;
    return def?.kind === 'pokemon' && isMatType(def.type) && types.includes(def.type) ? def.type : null;
  };
  const mine = view.self.active;
  // The last card seen in the Active Spot (an empty spot keeps it) and the choice so far.
  const last = useRef<{ uid: string | null; choice: MatChoice } | null>(null);
  if (!last.current) last.current = { uid: mine?.card.uid ?? null, choice: { type: typeOf(mine), side: null } };
  let choice = last.current.choice;
  if (mine && mine.card.uid !== last.current.uid && typeOf(mine)) choice = { type: typeOf(mine), side: 'self' };
  last.current = { uid: mine?.card.uid ?? last.current.uid, choice };
  return choice;
}
