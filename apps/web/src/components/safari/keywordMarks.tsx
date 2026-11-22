// Safari Draft: how a card shows the keywords that change no number on it (the user's, 2026-11-22: each by how much a
// player needs to know it; which is which is mine). A keyword that changes attack or HP shows in the card's numbers, and
// one that is a number of its own (Armor 10, Splash 20, Thorns 20…) reads from its words. The others are marked:
//   - 'frame': who an attack lands on, or whether it lands at all. The card's outline or an overlay on the whole card:
//     Taunt (a stone outline), Shield (a glass shield over the card while it's up), Bodyguard (a blue outline with an
//     arrow to each neighbour it covers);
//   - 'badge': when it attacks, who it aims at, what its hits or its fainting do. A round badge down the art's left side.
import AirIcon from '@mui/icons-material/Air';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import BoltIcon from '@mui/icons-material/Bolt';
import BrushIcon from '@mui/icons-material/Brush';
import CycloneIcon from '@mui/icons-material/Cyclone';
import DiamondIcon from '@mui/icons-material/Diamond';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FlareIcon from '@mui/icons-material/Flare';
import FlightIcon from '@mui/icons-material/Flight';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import GroupsIcon from '@mui/icons-material/Groups';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import LinkIcon from '@mui/icons-material/Link';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PaidIcon from '@mui/icons-material/Paid';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Keyword, TrainerName } from '@poke-tcg/safari';
import { createContext } from 'react';
import type { SafariUnit } from '../../hooks/useSafari';

export interface KeywordMark {
  level: 'frame' | 'badge';
  Icon: SvgIconComponent;
  /** The icon's colour: game meaning, kept off the themes (on a near-black badge). */
  tone: string;
  /** What the mark says, in a few words, for the card's large view. */
  means: string;
}

const AIM = 'text-sky-300';
const DANGER = 'text-red-400';
const GUARD = 'text-emerald-300';

/** The marked keywords. One with no entry shows by its numbers or its words alone. */
export const KEYWORD_MARKS: Partial<Record<Keyword, KeywordMark>> = {
  Taunt: { level: 'frame', Icon: ShieldIcon, tone: 'text-stone-300', means: 'Stone outline: attacks must go at it' },
  Shield: { level: 'frame', Icon: ShieldIcon, tone: 'text-sky-300', means: 'Glass shield over the card: the next hit on it does nothing' },
  Bodyguard: { level: 'frame', Icon: SecurityIcon, tone: 'text-indigo-300', means: 'Blue outline and arrows: it takes the attacks aimed at its neighbours' },
  // Aim and tempo.
  Flying: { level: 'badge', Icon: FlightIcon, tone: AIM, means: 'Ignores Taunt and Bodyguard' },
  Quick: { level: 'badge', Icon: BoltIcon, tone: AIM, means: 'Attacks before the battle' },
  'Face-off': { level: 'badge', Icon: GpsFixedIcon, tone: AIM, means: 'Attacks the Pokémon across' },
  Whirlwind: { level: 'badge', Icon: AirIcon, tone: AIM, means: 'Moves its target to the end of its line' },
  Truant: { level: 'badge', Icon: BedtimeIcon, tone: 'text-gray-300', means: 'Rests after each attack' },
  // What a faint does.
  Explode: { level: 'badge', Icon: FlareIcon, tone: DANGER, means: 'Damages every opposing Pokémon when it faints' },
  'Destiny Bond': { level: 'badge', Icon: LinkIcon, tone: DANGER, means: 'Takes its attacker down with it' },
  Family: { level: 'badge', Icon: GroupsIcon, tone: GUARD, means: 'Leaves a smaller copy when it faints' },
  Sturdy: { level: 'badge', Icon: DiamondIcon, tone: GUARD, means: 'Survives its first Knock Out with 10 HP' },
  Safeguard: { level: 'badge', Icon: HealthAndSafetyIcon, tone: GUARD, means: 'It and its neighbours take no Special Condition' },
  // Special Conditions: its hits', and a hit on it.
  Paralyze: { level: 'badge', Icon: ElectricBoltIcon, tone: 'text-yellow-500', means: 'Its hits may Paralyze' },
  Static: { level: 'badge', Icon: ElectricBoltIcon, tone: 'text-yellow-500', means: 'Hitting it may Paralyze' },
  Confuse: { level: 'badge', Icon: CycloneIcon, tone: 'text-purple-300', means: 'Its hits Confuse' },
  'Cute Charm': { level: 'badge', Icon: FavoriteIcon, tone: 'text-pink-300', means: 'Hitting it Confuses' },
  Burn: { level: 'badge', Icon: LocalFireDepartmentIcon, tone: 'text-orange-400', means: 'Its hits Burn' },
  'Flame Body': { level: 'badge', Icon: LocalFireDepartmentIcon, tone: 'text-orange-400', means: 'Hitting it Burns' },
  // Others.
  Transform: { level: 'badge', Icon: AutorenewIcon, tone: 'text-fuchsia-300', means: 'Becomes the Pokémon across' },
  Sketch: { level: 'badge', Icon: BrushIcon, tone: 'text-fuchsia-300', means: 'Takes the keywords of the ally on its left' },
  'Pay Day': { level: 'badge', Icon: PaidIcon, tone: 'text-amber-300', means: 'Pays for each Knock Out' },
};

/** What a right-click shows: the card as the game has it (the user's, 2026-11-22), never its TCG print. */
export type Inspected = { kind: 'unit'; unit: SafariUnit; attack: number; hp: number; abilities: SafariUnit['abilities']; golden: boolean } | { kind: 'trainer'; trainer: TrainerName };

/** Opens the mode's own large view of a card (UnitInspector). Null outside Safari Draft's page. */
export const UnitInspectContext = createContext<((card: Inspected) => void) | null>(null);
