import { createContext, useContext, type MouseEvent } from 'react';
import type { CatalogCard } from '../utils/cardList';

/**
 * Opens a card in the CardInspector. The app provides one everywhere (CardInspectProvider: just the card); the deck
 * builder provides its own, with − and + for the open deck.
 */
export const InspectContext = createContext<((card: CatalogCard) => void) | null>(null);

/** The card catalog by id (CardInspectProvider), for cards known only by id (the game's and runs' cards). Null until loaded. */
export const CatalogContext = createContext<Map<string, CatalogCard> | null>(null);

/**
 * Props for a card element that open it in the CardInspector on right-click, instead of the browser's menu: a catalog
 * card, or a card id looked up in the catalog. Without an InspectContext, or for a card the catalog doesn't have
 * (yet), they're empty, so right-click works as usual.
 */
export function useInspectOnRightClick() {
  const inspect = useContext(InspectContext);
  const catalog = useContext(CatalogContext);
  return (card: CatalogCard | string | undefined): { onContextMenu?: (e: MouseEvent) => void } => {
    const found = typeof card === 'string' ? catalog?.get(card) : card;
    if (!inspect || !found) return {};
    return {
      onContextMenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        inspect(found);
      },
    };
  };
}
