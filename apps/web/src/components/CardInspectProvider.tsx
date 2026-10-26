import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { FlairContext, useEquippedFlair } from '../hooks/useFlair';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import type { CatalogCard } from '../utils/cardList';
import { BattleShownContext, CatalogContext, InspectContext } from './InspectContext';

// The inspector (with the holo card and its styles) loads the first time a card is opened, not with every page.
const CardInspector = lazy(() => import('./CardInspector').then((m) => ({ default: m.CardInspector })));

/**
 * Right-clicking a card anywhere in the app opens it in the CardInspector, large with its holo effect (the deck
 * builder's view, without its deck buttons, with its ★ for the favorites). Also provides the card catalog by id (CatalogContext), loaded once
 * per session, for cards known only by id: the game's, the run's and the packs'; and the flair each card shows (FlairContext: its holo pattern or gold border).
 */
export function CardInspectProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const byId = useMemo(() => (catalog.data ? new Map(catalog.data.map((c) => [c.id, c])) : null), [catalog.data]);
  const flair = useEquippedFlair();
  const [inspected, setInspected] = useState<CatalogCard | null>(null);
  const close = useCallback(() => setInspected(null), []);
  /** How many battle boards are on screen (useBattleShown): with any, the inspector has no flair options. */
  const [battles, setBattles] = useState(0);
  const battleShown = useCallback(() => {
    setBattles((n) => n + 1);
    return () => setBattles((n) => n - 1);
  }, []);
  return (
    <CatalogContext.Provider value={byId}>
      <FlairContext.Provider value={flair}>
        <BattleShownContext.Provider value={battleShown}>
          <InspectContext.Provider value={setInspected}>
            {children}
            {inspected && (
              <Suspense fallback={null}>
                <Inspected card={inspected} onClose={close} flair={battles === 0} />
              </Suspense>
            )}
          </InspectContext.Provider>
        </BattleShownContext.Provider>
      </FlairContext.Provider>
    </CatalogContext.Provider>
  );
}

/** The open CardInspector with its ★ and, for a card that counts its copies, how many are unlocked (the list loaded only once a card is open). */
function Inspected({ card, onClose, flair }: { card: CatalogCard; onClose: () => void; flair: boolean }) {
  const { isFavorite, toggle } = useFavorites();
  const { holoCopies } = useUnlocked();
  return <CardInspector card={card} locked={false} favorite={{ on: isFavorite(card.id), onToggle: () => toggle(card.id) }} unlocked={holoCopies(card)} onClose={onClose} flair={flair} />;
}
