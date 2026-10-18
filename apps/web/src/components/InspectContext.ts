import { createContext, useContext, type MouseEvent } from 'react';
import type { CatalogCard } from '../utils/cardList';

/** Opens a card in the deck builder's CardInspector. Outside the deck builder there's none. */
export const InspectContext = createContext<((card: CatalogCard) => void) | null>(null);

/**
 * Props for a card element that open it in the CardInspector on right-click, instead of the browser's menu.
 * Outside an InspectContext they're empty, so right-click works as usual.
 */
export function useInspectOnRightClick() {
  const inspect = useContext(InspectContext);
  return (card: CatalogCard) =>
    inspect
      ? {
          onContextMenu(e: MouseEvent) {
            e.preventDefault();
            e.stopPropagation();
            inspect(card);
          },
        }
      : {};
}
