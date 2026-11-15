// Emerald's wild encounters (issue #226, step 3; pokeemerald's src/wild_encounter.c and field_control_avatar.c's
// CheckStandardWildEncounter, the user's: Hoenn by Emerald's rules, Kanto's FireRed's as they were): the steps after a
// battle or a map change with none, the step check by the lead's ability, the Pokémon (Magnet Pull and Static's slots,
// Hustle's level, Keen Eye's scare, Cute Charm's gender, Synchronize's nature) and fishing's bite. Our RNG, not the
// cartridge's, but the game's rolls in its order, each ability's drawn only when the lead has it.
import { int, type Rng } from '@poke-tcg/campaign';
import { species } from './data.js';
import { abilityOf } from './mon.js';
import type { EncounterSlots, Mon, TypeName } from './types.js';

/** The step counters: `steps` the steps since the last battle or map change (sWildEncounterImmunitySteps, none on the first 4), `prev` the last tile's code, `map` the map it's on. */
export interface EncounterStateE {
  steps: number;
  buff: number;
  prev: string;
  map?: string;
}

/** WildEncounterCheck's cap (MAX_ENCOUNTER_RATE): the rate × 16 out of 2880, FireRed's 1600. */
const MAX_RATE = 2880;

/**
 * Whether a step brings out a wild Pokémon (CheckStandardWildEncounter, then StandardWildEncounter's check), counted on
 * every step: none for the first 4 after a battle or a map change (the counter set back by the caller); then off an
 * encounter tile nothing (`rate` null); a 60% roll when the tile's kind changes (AllowWildCheckOnNewMetatile); the
 * table's rate × 16 by the lead's ability (Stench, White Smoke ÷2; Illuminate, Arena Trap ×2; Sand Veil ÷2 in a
 * sandstorm), out of 2880. The run's bike, flutes and Cleanse Tag aren't modelled (nor Kanto's).
 */
export function wildCheckE(rng: Rng, enc: EncounterStateE, rate: number | null, tile: string, lead: Mon, weather?: string): boolean {
  const prev = enc.prev;
  enc.prev = tile;
  if (enc.steps < 4) {
    enc.steps += 1;
    return false;
  }
  if (rate === null) return false;
  if (prev !== tile && int(rng, 100) >= 60) return false;
  let r = rate * 16;
  const ability = abilityOf(lead);
  if (ability === 'stench' || ability === 'white-smoke' || (ability === 'sand-veil' && weather === 'sandstorm')) r = Math.floor(r / 2);
  else if (ability === 'illuminate' || ability === 'arena-trap') r *= 2;
  return int(rng, MAX_RATE) < Math.min(r, MAX_RATE);
}

/** A Pokémon fished up's bite (field_player_avatar.c's Fishing_CheckForBite): with Suction Cups or Sticky Hold leading, 85%, else (or when that misses) half the time. */
export function fishBiteE(rng: Rng, lead: Mon): boolean {
  const ability = abilityOf(lead);
  if ((ability === 'suction-cups' || ability === 'sticky-hold') && int(rng, 100) > 14) return true;
  return int(rng, 2) === 0;
}

/** A wild Pokémon to meet: its species and level, and the nature and gender the lead's ability gives it, if any. */
export interface WildE {
  species: number;
  level: number;
  nature?: number;
  gender?: 'male' | 'female';
}

/** The slot picked by its odds (ChooseWildMonIndex_Land, _WaterRock, _Fishing: FireRed's). */
function bySlotOdds(rng: Rng, odds: readonly number[], first: number): number {
  let r = int(rng, 100);
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i]!;
    if (r < 0) return first + i;
  }
  return first + odds.length - 1;
}

/**
 * A wild Pokémon from a table's slots (TryGenerateWildMon, GenerateFishingWildMon, CreateWildMon), or null when the
 * lead's Keen Eye or Intimidate scares it off: on land Magnet Pull (Steel), then Static (Electric), on the water Static,
 * each half the time picking one of the slots of that type alike, whatever their odds (when some but not all are: the
 * table's own slots, not the 12 land ones the game reads past a water table's end, a bug); else a slot by `odds` (from
 * `first`, a rod's); the level rolled in the slot's range (ChooseWildMonLevel), Hustle, Vital Spirit or Pressure half the
 * time the highest; then, not when fishing, Keen Eye or Intimidate, a lead above level 5, half the time no Pokémon 5 or
 * more levels below it; Cute Charm two times in three the other gender (a species with both), Synchronize half the time
 * the lead's nature.
 */
export function pickWildE(rng: Rng, table: EncounterSlots, odds: readonly number[], kind: 'land' | 'water' | 'fishing', lead: Mon, first = 0): WildE | null {
  const ability = abilityOf(lead);
  const slots = table.mons.slice(first, first + odds.length);
  const byType = (type: TypeName): number | null => {
    if (int(rng, 2) !== 0) return null;
    const found = slots.flatMap((s, i) => (species(s[2]).types.includes(type) ? [i] : []));
    return found.length > 0 && found.length < slots.length ? first + found[int(rng, found.length)]! : null;
  };
  let slot: number | null = null;
  if (kind === 'land' && ability === 'magnet-pull') slot = byType('steel');
  if (slot === null && kind !== 'fishing' && ability === 'static') slot = byType('electric');
  if (slot === null) slot = bySlotOdds(rng, odds, first);
  let [lo, hi, id] = table.mons[slot]!;
  if (lo > hi) [lo, hi] = [hi, lo];
  let r = int(rng, 65536) % (hi - lo + 1);
  if (ability === 'hustle' || ability === 'vital-spirit' || ability === 'pressure') {
    if (int(rng, 2) === 0) r = hi - lo;
    else if (r !== 0) r -= 1;
  }
  const level = lo + r;
  if (kind !== 'fishing' && (ability === 'keen-eye' || ability === 'intimidate') && lead.level > 5 && level <= lead.level - 5 && int(rng, 2) === 0) return null;
  const out: WildE = { species: id, level };
  const ratio = species(id).genderRatio;
  if (ability === 'cute-charm' && lead.gender && ratio > 0 && ratio < 254 && int(rng, 3) !== 0) out.gender = lead.gender === 'male' ? 'female' : 'male';
  if (ability === 'synchronize' && int(rng, 2) === 0) out.nature = lead.nature;
  return out;
}
