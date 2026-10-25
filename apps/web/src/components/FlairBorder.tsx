import { useId } from 'react';
import '../styles/flair-border.css';
import { setEra } from '../utils/holo';

/**
 * The ramps a classic or Neo Pokémon card's yellow art frame and banner are mapped onto (flair-border.css), by
 * lightness, 21 steps each: gold for the gold border (#1c1204 0, #5e4010 .3, #a8771a .55, #d9ae3a .72, #f6d870 .86,
 * #fff6c8 1), silver for the rainbow ones (#15171b 0, #4d525b .3, #9ca3ad .55, #cdd2da .72, #e9ecf1 .86, #ffffff 1),
 * which the rainbow then colours.
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

/** The rainbows' colours round the card from the top, clockwise, at 0°, 30°… 330° (flair-border.css's conic gradients; keep them the same). */
const RAINBOWS: Record<string, string[]> = {
  rainbow: ['#3a7bff', '#7a4dff', '#c44dff', '#ff3b8d', '#ff4a3b', '#ff9a1f', '#ffe02e', '#8ee83a', '#2fd16b', '#22c9e8', '#2f9bff', '#d14dff'],
  pastel: ['#a9c3ff', '#bfaeff', '#ddb2ff', '#ffb3cf', '#ffb8b0', '#ffd3a3', '#fff1a8', '#d3f5a8', '#b3ecc6', '#ace8f4', '#accfff', '#e6b5ff'],
};

/** The scan's size: the frame's tint is drawn in its pixels, over the image as it's shown (object-fit: cover, so `slice`). */
const SCAN = { w: 600, h: 825 };

/** A rainbow as wedges from the card's centre, 4° each (SVG has no conic gradient), each the colour at its middle. */
function wedges(colors: string[]) {
  const rgb = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const at = (deg: number) => {
    const i = Math.floor(deg / 30) % 12;
    const f = (deg % 30) / 30;
    const [a, b] = [rgb[i]!, rgb[(i + 1) % 12]!];
    return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(' ')})`;
  };
  const [cx, cy, r] = [SCAN.w / 2, SCAN.h / 2, 1200];
  const point = (deg: number) => `${(cx + r * Math.sin((deg * Math.PI) / 180)).toFixed(1)} ${(cy - r * Math.cos((deg * Math.PI) / 180)).toFixed(1)}`;
  // A little overlap between wedges, so no seam shows between them.
  return Array.from({ length: 90 }, (_, i) => ({ d: `M${cx} ${cy}L${point(i * 4 - 0.3)}L${point(i * 4 + 4.3)}Z`, fill: at(i * 4 + 2) }));
}

const WEDGES: Record<string, { d: string; fill: string }[]> = { rainbow: wedges(RAINBOWS.rainbow!), pastel: wedges(RAINBOWS.pastel!) };

/** The rainbows' ridges: rounded lines round the card, following its corners, by how far in they are (cqw: hundredths of the card's width). */
const RIDGES = [
  { inset: 0.5, tone: 'light' },
  { inset: 1.05, tone: 'dark' },
  { inset: 1.7, tone: 'light' },
  { inset: 2.25, tone: 'dark' },
  { inset: 2.9, tone: 'light' },
] as const;

/**
 * Card flair's border over the card it's in (its parent fills the card; flair-border.css), `border` a BORDERS key
 * (gold, rainbow, pastel): a ring over the printed border, shaped for the card's layout (the rainbows with ridges round
 * it), and on a classic or Neo Pokémon card (`pokemon`) its art frame, banner (and Neo's stage tab) recoloured to go
 * with it: a copy of the card's image (`img`, the one shown), clipped to them, whose yellow pixels are mapped onto the
 * gold or silver ramp (an SVG filter), the print on them kept; for the rainbows, the rainbow's colour over that silver
 * (the tint: rainbow wedges masked to the image's yellow pixels, `mix-blend-mode: color`).
 */
export function FlairBorder({ border, cardId, img, pokemon }: { border: string; cardId: string; img: string; pokemon: boolean }) {
  const maskId = `flair-border-mask-${useId().replace(/[^\w-]/g, '')}`;
  const set = cardId.slice(0, cardId.lastIndexOf('-'));
  const era = setEra(set);
  const frame = pokemon && era === 'wotc' ? (set.startsWith('neo') ? 'neo' : 'classic') : null;
  const ramp = border === 'gold' ? 'gold' : 'silver';
  const rainbow = WEDGES[border];
  return (
    <div className="flair-border" data-border={border} data-era={era} aria-hidden>
      <div className="flair-border__ring">
        {rainbow && RIDGES.map((r) => <span key={r.inset} className="flair-border__ridge" data-tone={r.tone} style={{ '--inset': `${r.inset}cqw` } as React.CSSProperties} />)}
      </div>
      {frame && (
        <>
          <img className="flair-border__frame" data-frame={frame} data-ramp={ramp} src={img} alt="" draggable={false} />
          {rainbow && (
            <svg className="flair-border__tint" data-frame={frame} viewBox={`0 0 ${SCAN.w} ${SCAN.h}`} preserveAspectRatio="xMidYMid slice">
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SCAN.w} height={SCAN.h}>
                <image href={img} width={SCAN.w} height={SCAN.h} preserveAspectRatio="none" filter="url(#flair-border-yellow)" />
              </mask>
              <g mask={`url(#${maskId})`}>
                {rainbow.map((w) => (
                  <path key={w.d} d={w.d} fill={w.fill} />
                ))}
              </g>
            </svg>
          )}
          {/* The filters the frame uses (url(#flair-border-gold) or -silver, and -yellow for the tint's mask): every border has them, the first in the page is used. */}
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
            {rainbow && (
              // White where the image is yellow (the same yellowness as above): the tint's mask.
              <filter id="flair-border-yellow" colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
                <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2 6 -8 0 -2.5" />
              </filter>
            )}
          </svg>
        </>
      )}
    </div>
  );
}
