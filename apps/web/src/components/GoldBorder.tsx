import '../styles/gold-border.css';
import { setEra } from '../utils/holo';

/**
 * The gold ramp the art frame's and banner's yellow is mapped onto (gold-border.css), by lightness: 21 steps from dark
 * bronze to pale gold, sampled from the stops #1c1204 0, #5e4010 .3, #a8771a .55, #d9ae3a .72, #f6d870 .86, #fff6c8 1.
 */
const RAMP = {
  r: '0.110 0.153 0.196 0.239 0.282 0.325 0.369 0.427 0.485 0.543 0.601 0.659 0.715 0.772 0.828 0.875 0.916 0.957 0.975 0.987 1.000',
  g: '0.071 0.101 0.131 0.161 0.191 0.221 0.251 0.294 0.337 0.380 0.424 0.467 0.530 0.594 0.657 0.718 0.776 0.835 0.881 0.923 0.965',
  b: '0.016 0.024 0.031 0.039 0.047 0.055 0.063 0.071 0.078 0.086 0.094 0.102 0.139 0.176 0.213 0.273 0.348 0.424 0.538 0.661 0.784',
};

/**
 * Card flair's gold border over the card it's in (its parent fills the card; gold-border.css): a gold ring over the
 * printed border, shaped for the card's layout, and on a classic or Neo Pokémon card (`pokemon`) its art frame, banner
 * (and Neo's stage tab) turned gold too: a copy of the card's image (`img`, the one shown), clipped to them, whose
 * yellow pixels are mapped onto a gold ramp (the SVG filter), the print on them kept.
 */
export function GoldBorder({ cardId, img, pokemon }: { cardId: string; img: string; pokemon: boolean }) {
  const set = cardId.slice(0, cardId.lastIndexOf('-'));
  const era = setEra(set);
  const frame = pokemon && era === 'wotc' ? (set.startsWith('neo') ? 'neo' : 'classic') : null;
  return (
    <div className="gold-border" data-era={era} aria-hidden>
      <div className="gold-border__ring" />
      {frame && (
        <>
          <img className="gold-border__frame" data-frame={frame} src={img} alt="" draggable={false} />
          {/* The filter the frame copy uses (url(#gold-border-map)): every gold border has one, the first in the page is used. */}
          <svg className="gold-border__defs" width="0" height="0">
            <filter id="gold-border-map" colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
              {/* Lightness in every channel, then through the gold ramp. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values=".299 .587 .114 0 0  .299 .587 .114 0 0  .299 .587 .114 0 0  0 0 0 1 0" result="light" />
              <feComponentTransfer in="light" result="gold">
                <feFuncR type="table" tableValues={RAMP.r} />
                <feFuncG type="table" tableValues={RAMP.g} />
                <feFuncB type="table" tableValues={RAMP.b} />
              </feComponentTransfer>
              {/* Only the yellow pixels (high red and green, low blue): text, stamps and pictures stay as printed. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 6 -8 0 -2.5" result="yellow" />
              <feComposite in="gold" in2="yellow" operator="in" />
            </filter>
          </svg>
        </>
      )}
    </div>
  );
}
