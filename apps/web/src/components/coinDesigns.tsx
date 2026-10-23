import BoltIcon from '@mui/icons-material/Bolt';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SpaIcon from '@mui/icons-material/Spa';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import type { ComponentType, ReactNode } from 'react';

/**
 * A coin cosmetic's look (COSMETICS in the campaign package, kind 'coin'): its heads and tails faces (drawn to fill the
 * face, a circle) and its rim's colour, the edge seen as the coin turns. Drawn here, no images.
 */
export interface CoinDesign {
  heads: ReactNode;
  tails: ReactNode;
  rim: string;
}

/** A ball coin's heads: the ball itself, `top` its upper half (with `marks` drawn over it) above a white lower half. */
function ballHeads(top: string, marks?: ReactNode, bottom = '#f8fafc') {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <circle cx="50" cy="50" r="50" fill={bottom} />
      <path d="M0 50a50 50 0 0 1 100 0z" fill={top} />
      {marks}
      <rect x="0" y="45.5" width="100" height="9" fill="#1e1b2e" />
      <circle cx="50" cy="50" r="15" fill="#1e1b2e" />
      <circle cx="50" cy="50" r="10" fill="#f8fafc" />
      <circle cx="50" cy="50" r="5.5" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
    </svg>
  );
}

/** A ball coin's tails: the ball's colour, with its button embossed in the middle. */
function ballTails(colour: string) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <circle cx="50" cy="50" r="50" fill={colour} />
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <circle cx="50" cy="50" r="16" fill="rgba(0,0,0,0.25)" />
      <circle cx="50" cy="50" r="10" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

/**
 * An Energy coin's face (the board's Energy symbols): heads the type's colour with a white symbol, tails the inverse, a
 * white face with the symbol in the type's colour.
 */
function energyFace(Icon: ComponentType<{ sx?: object }>, from: string, to: string, tails = false) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-full"
      style={{ background: tails ? 'radial-gradient(circle at 35% 30%, #ffffff, #e2e8f0)' : `radial-gradient(circle at 35% 30%, ${from}, ${to})` }}
    >
      <span style={{ color: tails ? to : 'rgba(255,255,255,0.92)', display: 'flex' }}>
        <Icon sx={{ fontSize: '1.6em', filter: `drop-shadow(0 1px 1px rgba(0,0,0,${tails ? 0.25 : 0.45}))` }} />
      </span>
    </div>
  );
}

/** The classic coin's faces: an H on gold, a T on silver. */
function letterFace(letter: string, gradient: string) {
  return <div className={`flex h-full w-full items-center justify-center rounded-full font-black text-amber-900/70 ${gradient}`}>{letter}</div>;
}

export const COIN_DESIGNS: Record<string, CoinDesign> = {
  'coin-classic': {
    heads: letterFace('H', 'bg-gradient-to-br from-amber-100 via-amber-300 to-amber-600'),
    tails: letterFace('T', 'bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600'),
    rim: '#a16207',
  },
  'coin-pokeball': { heads: ballHeads('#e3350d'), tails: ballTails('#c2280a'), rim: '#7f1d1d' },
  'coin-greatball': {
    heads: ballHeads(
      '#2563eb',
      <>
        <path d="M14 22 L30 12 L36 36 L22 42 Z" fill="#ef4444" />
        <path d="M86 22 L70 12 L64 36 L78 42 Z" fill="#ef4444" />
      </>,
    ),
    tails: ballTails('#1d4ed8'),
    rim: '#1e3a8a',
  },
  'coin-ultraball': {
    heads: ballHeads(
      '#1f2937',
      <>
        <rect x="24" y="8" width="10" height="38" rx="3" fill="#facc15" />
        <rect x="66" y="8" width="10" height="38" rx="3" fill="#facc15" />
      </>,
    ),
    tails: ballTails('#111827'),
    rim: '#a16207',
  },
  'coin-masterball': {
    heads: ballHeads(
      '#7e22ce',
      <>
        <circle cx="22" cy="30" r="8" fill="#f472b6" />
        <circle cx="78" cy="30" r="8" fill="#f472b6" />
        <path d="M38 38 L38 20 L50 31 L62 20 L62 38" fill="none" stroke="#f8fafc" strokeWidth="5" strokeLinejoin="round" />
      </>,
    ),
    tails: ballTails('#6b21a8'),
    rim: '#4c1d95',
  },
  'coin-gsball': {
    heads: ballHeads(
      '#d4a72c',
      <text x="50" y="34" textAnchor="middle" fontSize="20" fontWeight="900" fill="#7c5a10">
        GS
      </text>,
      '#cbd5e1',
    ),
    tails: ballTails('#b8901f'),
    rim: '#854d0e',
  },
  'coin-luxuryball': {
    heads: ballHeads(
      '#1c1917',
      <>
        <rect x="0" y="30" width="100" height="6" fill="#dc2626" />
        <rect x="0" y="38" width="100" height="3" fill="#eab308" />
      </>,
    ),
    tails: ballTails('#292524'),
    rim: '#eab308',
  },
  'coin-fire': { heads: energyFace(LocalFireDepartmentIcon, '#fb923c', '#c2410c'), tails: energyFace(LocalFireDepartmentIcon, '#fb923c', '#c2410c', true), rim: '#7c2d12' },
  'coin-water': { heads: energyFace(WaterDropIcon, '#60a5fa', '#1d4ed8'), tails: energyFace(WaterDropIcon, '#60a5fa', '#1d4ed8', true), rim: '#1e3a8a' },
  'coin-grass': { heads: energyFace(SpaIcon, '#4ade80', '#15803d'), tails: energyFace(SpaIcon, '#4ade80', '#15803d', true), rim: '#14532d' },
  'coin-lightning': { heads: energyFace(BoltIcon, '#fde047', '#ca8a04'), tails: energyFace(BoltIcon, '#fde047', '#ca8a04', true), rim: '#854d0e' },
  'coin-psychic': { heads: energyFace(VisibilityIcon, '#c084fc', '#7e22ce'), tails: energyFace(VisibilityIcon, '#c084fc', '#7e22ce', true), rim: '#581c87' },
};
