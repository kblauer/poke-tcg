import type { CardDef } from '@poke-tcg/game-engine';
import { createContext } from 'react';

/** Large card shown next to the pointer while hovering a card. */
export interface Preview {
  def: CardDef;
  /** Pointer position when the hover started; CardPreview tracks it from there. */
  x: number;
  y: number;
  /** false: the scroll wheel scrolls the page as usual instead of resizing the preview (in lists of cards to pick from). */
  scrollZoom?: boolean;
  /**
   * The card hovered. The preview goes once the pointer is no longer over it, or it's gone, even when its mouseleave
   * never comes (the card removed or covered under the pointer, as when picking a reward).
   */
  from?: Element;
}

/** Shows (or, with null, hides) the hover preview. Provided by the Board. */
export const PreviewContext = createContext<(preview: Preview | null) => void>(() => {});
