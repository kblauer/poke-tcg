import '../styles/gold-border.css';
import type { HoloAttributes } from '../utils/holo';

/** Card flair's gold border, laid over the printed border of the card it's in (its parent fills the card; gold-border.css), shaped for the card's layout (`era`, cardEra). */
export function GoldBorder({ era }: { era: HoloAttributes['era'] }) {
  return <div className="gold-border" data-era={era} aria-hidden />;
}
