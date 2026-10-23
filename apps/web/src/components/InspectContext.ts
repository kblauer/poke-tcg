import { createContext, useContext, type MouseEvent } from 'react';
import type { CatalogCard } from '../utils/cardList';
import { PreviewContext } from './PreviewContext';

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
 * (yet), they're empty, so right-click works as usual. `clearsPreview`: a card with the large hover preview (Card,
 * RunCard) hides it first, so it doesn't sit over the inspector.
 */
export function useInspectOnRightClick({ clearsPreview = false }: { clearsPreview?: boolean } = {}) {
  const inspect = useContext(InspectContext);
  const catalog = useContext(CatalogContext);
  const setPreview = useContext(PreviewContext);
  return (card: CatalogCard | string | undefined): { onContextMenu?: (e: MouseEvent) => void } => {
    const found = typeof card === 'string' ? catalog?.get(card) : card;
    if (!inspect || !found) return {};
    return {
      onContextMenu(e: MouseEvent) {
        if (clearsPreview) setPreview(null);
        e.preventDefault();
        e.stopPropagation();
        inspect(found);
      },
    };
  };
}
