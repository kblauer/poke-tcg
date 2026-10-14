import type { CardDef } from '@poke-tcg/game-engine';
import { createContext } from 'react';

/** Large card shown next to the pointer while hovering a card. */
export interface Preview {
  def: CardDef;
  /** Pointer position when the hover started; CardPreview tracks it from there. */
  x: number;
  y: number;
}

/** Shows (or, with null, hides) the hover preview. Provided by the Board. */
export const PreviewContext = createContext<(preview: Preview | null) => void>(() => {});
