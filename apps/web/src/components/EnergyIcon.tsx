import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SettingsIcon from '@mui/icons-material/Settings';
import SpaIcon from '@mui/icons-material/Spa';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import StarIcon from '@mui/icons-material/Star';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import type { EnergyType, PoolEnergy } from '@poke-tcg/game-engine';
import type { ComponentType } from 'react';
import { energyColor } from '../utils/cardColors';

/** A symbol per type, so types tell apart by shape and not only by colour (Fire and Fighting are both warm). */
const ICONS: Record<EnergyType, ComponentType<{ sx?: object }>> = {
  grass: SpaIcon,
  fire: LocalFireDepartmentIcon,
  water: WaterDropIcon,
  lightning: BoltIcon,
  psychic: VisibilityIcon,
  fighting: SportsMmaIcon,
  darkness: DarkModeIcon,
  metal: SettingsIcon,
  colorless: StarIcon,
};

/** Rainbow Energy (every type): a rainbow disc. */
const RAINBOW = 'bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)]';

/** Colorless and Metal are light, so their symbol is dark. */
const DARK_SYMBOL: Partial<Record<EnergyType, boolean>> = { colorless: true, metal: true };

/** Sizes in px: on a small (benched) card, a large (active) card, and in panels. */
const SIZES = { sm: 18, lg: 22, panel: 22 } as const;

/**
 * One energy: a coloured disc with its type's symbol. `count` marks a card that provides more than one
 * (Double Colorless Energy in the retreat panel). 'any' is Rainbow Energy.
 */
export function EnergyIcon({ type, size = 'sm', count, title }: { type: PoolEnergy; size?: keyof typeof SIZES; count?: number; title?: string }) {
  const px = SIZES[size];
  const Icon = type === 'any' ? AutoAwesomeIcon : ICONS[type];
  return (
    <span
      title={title}
      className={`${type === 'any' ? RAINBOW : energyColor(type)} relative inline-flex shrink-0 items-center justify-center rounded-full border border-white shadow shadow-black/60 ${
        type !== 'any' && DARK_SYMBOL[type] ? 'text-slate-800' : 'text-white'
      }`}
      style={{ width: px, height: px }}
    >
      <Icon sx={{ fontSize: Math.round(px * 0.7) }} />
      {count !== undefined && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-900 px-1 text-[9px] font-bold leading-3 text-white">{count}</span>
      )}
    </span>
  );
}
