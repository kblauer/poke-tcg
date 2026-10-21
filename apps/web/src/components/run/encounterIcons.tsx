import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CastleIcon from '@mui/icons-material/Castle';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import ShieldIcon from '@mui/icons-material/Shield';
import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { isBossKind, type EncounterKind } from '@poke-tcg/campaign';
import type { ComponentType } from 'react';

/** A symbol and colour for each kind of encounter, on the map and its panels. */
export const ENCOUNTER_STYLE: Record<EncounterKind, { Icon: ComponentType<{ sx?: object }>; color: string; name: string }> = {
  battle: { Icon: SportsMartialArtsIcon, color: 'bg-rose-600', name: 'Battle' },
  elite: { Icon: MilitaryTechIcon, color: 'bg-fuchsia-700', name: 'Elite battle' },
  gymTrainer: { Icon: SportsKabaddiIcon, color: 'bg-orange-600', name: 'Gym Trainer' },
  gymLeader: { Icon: CastleIcon, color: 'bg-yellow-500', name: 'Gym leader' },
  eliteFour: { Icon: ShieldIcon, color: 'bg-indigo-600', name: 'Elite Four' },
  champion: { Icon: EmojiEventsIcon, color: 'bg-amber-400', name: 'Champion' },
  shop: { Icon: StorefrontIcon, color: 'bg-sky-600', name: 'Card shop' },
  gift: { Icon: CardGiftcardIcon, color: 'bg-emerald-600', name: 'Free card' },
  trade: { Icon: SwapHorizIcon, color: 'bg-teal-600', name: 'Card trade' },
  event: { Icon: QuestionMarkIcon, color: 'bg-violet-600', name: 'Mystery' },
  center: { Icon: LocalHospitalIcon, color: 'bg-pink-500', name: 'Pokémon Center' },
};

/** What an encounter is called: its label, but a Gym Trainer by their name (their label is the gym's, "Celadon Gym Trainer"). */
export const encounterLabel = (o: { kind: EncounterKind; label: string; trainer?: string }) => (o.kind === 'gymTrainer' && o.trainer ? o.trainer : o.label);

/** Bosses (gym leaders, the Elite Four, the Champion) are drawn bigger on the map. */
export const isBoss = isBossKind;

/** A round badge with the encounter's symbol. */
export function EncounterBadge({ kind, size = 32, dim }: { kind: EncounterKind; size?: number; dim?: boolean }) {
  const { Icon, color, name } = ENCOUNTER_STYLE[kind];
  return (
    <span title={name} className={`${color} ${dim ? 'opacity-40' : ''} inline-flex shrink-0 items-center justify-center rounded-full text-white shadow`} style={{ width: size, height: size }}>
      <Icon sx={{ fontSize: Math.round(size * 0.6) }} />
    </span>
  );
}
