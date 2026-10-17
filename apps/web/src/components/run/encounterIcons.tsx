import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { EncounterKind } from '@poke-tcg/campaign';
import type { ComponentType } from 'react';

/** A symbol and colour for each kind of encounter, on the map and its panels. */
export const ENCOUNTER_STYLE: Record<EncounterKind, { Icon: ComponentType<{ sx?: object }>; color: string; name: string }> = {
  battle: { Icon: SportsMartialArtsIcon, color: 'bg-rose-600', name: 'Battle' },
  elite: { Icon: MilitaryTechIcon, color: 'bg-fuchsia-700', name: 'Elite battle' },
  gymLeader: { Icon: EmojiEventsIcon, color: 'bg-yellow-500', name: 'Gym leader' },
  shop: { Icon: StorefrontIcon, color: 'bg-sky-600', name: 'Card shop' },
  gift: { Icon: CardGiftcardIcon, color: 'bg-emerald-600', name: 'Free card' },
  trade: { Icon: SwapHorizIcon, color: 'bg-teal-600', name: 'Card trade' },
  event: { Icon: QuestionMarkIcon, color: 'bg-violet-600', name: 'Mystery' },
  center: { Icon: LocalHospitalIcon, color: 'bg-pink-500', name: 'Pokémon Center' },
};

/** A round badge with the encounter's symbol. */
export function EncounterBadge({ kind, size = 32, dim }: { kind: EncounterKind; size?: number; dim?: boolean }) {
  const { Icon, color, name } = ENCOUNTER_STYLE[kind];
  return (
    <span title={name} className={`${color} ${dim ? 'opacity-40' : ''} inline-flex shrink-0 items-center justify-center rounded-full text-white shadow`} style={{ width: size, height: size }}>
      <Icon sx={{ fontSize: Math.round(size * 0.6) }} />
    </span>
  );
}
