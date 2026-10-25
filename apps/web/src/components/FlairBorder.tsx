import '../styles/flair-border.css';
import { setEra } from '../utils/holo';

/** The rainbows' ridges: rounded lines round the card, following its corners, by how far in they are (cqw: hundredths of the card's width). */
const RIDGES = [
  { inset: 0.5, tone: 'light' },
  { inset: 1.05, tone: 'dark' },
  { inset: 1.7, tone: 'light' },
  { inset: 2.25, tone: 'dark' },
  { inset: 2.9, tone: 'light' },
] as const;

/**
 * Card flair's border over the card it's in (its parent fills the card and clips it; flair-border.css), `border` a
 * BORDERS key (gold, rainbow, pastel, black): a ring over the printed border alone, shaped for the card's layout (the
 * rainbows with ridges round it). Nothing inside the border changes (the user's).
 */
export function FlairBorder({ border, cardId }: { border: string; cardId: string }) {
  const rainbow = border === 'rainbow' || border === 'pastel';
  return (
    <div className="flair-border" data-border={border} data-era={setEra(cardId.slice(0, cardId.lastIndexOf('-')))} aria-hidden>
      <div className="flair-border__ring">
        {rainbow && RIDGES.map((r) => <span key={r.inset} className="flair-border__ridge" data-tone={r.tone} style={{ '--inset': `${r.inset}cqw` } as React.CSSProperties} />)}
      </div>
    </div>
  );
}
