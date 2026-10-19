import { useCallback, useState, type ReactNode } from 'react';
import { CardPreview } from './CardPreview';
import { PreviewContext, type Preview } from './PreviewContext';

/**
 * Gives the cards inside it the large hover preview that follows the pointer, as on the game board (which
 * keeps its own, for its drag and move rules). `scrollZoom: false` leaves the wheel scrolling the page, for
 * pages that scroll.
 */
export function PreviewProvider({ children, scrollZoom = true }: { children: ReactNode; scrollZoom?: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const hide = useCallback(() => setPreview(null), []);
  return (
    <PreviewContext.Provider value={(p) => setPreview(p && { scrollZoom, ...p })}>
      {children}
      {preview && <CardPreview {...preview} onLost={hide} />}
    </PreviewContext.Provider>
  );
}
