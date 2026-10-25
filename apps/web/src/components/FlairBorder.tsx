import '../styles/flair-border.css';
import { setEra } from '../utils/holo';

/**
 * The ramps a classic or Neo Pokémon card's yellow art frame and banner are mapped onto (flair-border.css), by
 * lightness, 21 steps each: gold for the gold border (#1c1204 0, #5e4010 .3, #a8771a .55, #d9ae3a .72, #f6d870 .86,
 * #fff6c8 1), silver for the rainbow ones (#15171b 0, #4d525b .3, #9ca3ad .55, #cdd2da .72, #e9ecf1 .86, #ffffff 1).
 */
const RAMPS = {
  gold: {
    r: '0.110 0.153 0.196 0.239 0.282 0.325 0.369 0.427 0.485 0.543 0.601 0.659 0.715 0.772 0.828 0.875 0.916 0.957 0.975 0.987 1.000',
    g: '0.071 0.101 0.131 0.161 0.191 0.221 0.251 0.294 0.337 0.380 0.424 0.467 0.530 0.594 0.657 0.718 0.776 0.835 0.881 0.923 0.965',
    b: '0.016 0.024 0.031 0.039 0.047 0.055 0.063 0.071 0.078 0.086 0.094 0.102 0.139 0.176 0.213 0.273 0.348 0.424 0.538 0.661 0.784',
  },
  silver: {
    r: '0.082 0.119 0.156 0.192 0.229 0.265 0.302 0.364 0.426 0.488 0.550 0.612 0.668 0.725 0.781 0.827 0.867 0.906 0.938 0.969 1.000',
    g: '0.090 0.129 0.167 0.206 0.244 0.283 0.322 0.385 0.449 0.512 0.576 0.639 0.693 0.748 0.802 0.845 0.882 0.918 0.947 0.973 1.000',
    b: '0.106 0.148 0.190 0.231 0.273 0.315 0.357 0.421 0.485 0.550 0.614 0.678 0.730 0.782 0.834 0.874 0.906 0.939 0.961 0.980 1.000',
  },
};

/**
 * Card flair's border over the card it's in (its parent fills the card; flair-border.css), `border` a BORDERS key
 * (gold, rainbow, pastel): a ring over the printed border, shaped for the card's layout, and on a classic or Neo
 * Pokémon card (`pokemon`) its art frame, banner (and Neo's stage tab) recoloured to go with it, gold or silver: a copy
 * of the card's image (`img`, the one shown), clipped to them, whose yellow pixels are mapped onto the ramp (an SVG
 * filter), the print on them kept.
 */
export function FlairBorder({ border, cardId, img, pokemon }: { border: string; cardId: string; img: string; pokemon: boolean }) {
  const set = cardId.slice(0, cardId.lastIndexOf('-'));
  const era = setEra(set);
  const frame = pokemon && era === 'wotc' ? (set.startsWith('neo') ? 'neo' : 'classic') : null;
  const ramp = border === 'gold' ? 'gold' : 'silver';
  return (
    <div className="flair-border" data-border={border} data-era={era} aria-hidden>
      <div className="flair-border__ring" />
      {frame && (
        <>
          <img className="flair-border__frame" data-frame={frame} data-ramp={ramp} src={img} alt="" draggable={false} />
          {/* The filter the frame copy uses (url(#flair-border-gold) or -silver): every border has one, the first in the page is used. */}
          <svg className="flair-border__defs" width="0" height="0">
            <filter id={`flair-border-${ramp}`} colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
              {/* Lightness in every channel, then through the ramp. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values=".299 .587 .114 0 0  .299 .587 .114 0 0  .299 .587 .114 0 0  0 0 0 1 0" result="light" />
              <feComponentTransfer in="light" result="mapped">
                <feFuncR type="table" tableValues={RAMPS[ramp].r} />
                <feFuncG type="table" tableValues={RAMPS[ramp].g} />
                <feFuncB type="table" tableValues={RAMPS[ramp].b} />
              </feComponentTransfer>
              {/* Only the yellow pixels (high red and green, low blue): text, stamps and pictures stay as printed. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 6 -8 0 -2.5" result="yellow" />
              <feComposite in="mapped" in2="yellow" operator="in" />
            </filter>
          </svg>
        </>
      )}
    </div>
  );
}
