// HeartGold's wild encounters (issue #170, step 4d; pokeheartgold's src/field/encounter_check.c, the user's: Johto by
// Gen 4's rules, Kanto's FireRed's as they were): the step check, the slots by the run's time of day, the lead's
// abilities (the user's, 2026-11-04: the full set), fishing's bite. Our RNG, not the cartridge's, but the game's rolls in
// its order.
import { int, type Rng } from '@poke-tcg/campaign';
import { species } from './data.js';
import { abilityOf } from './mon.js';
import type { EncounterSlots, EncounterTable, Mon, TypeName } from './types.js';

/** HGSS's times of day for wild Pokémon (gf_rtc.c's GF_RTC_GetTimeOfDayWildParamByHour): 04–09 morning, 10–19 day (its evening too), 20–03 night. */
export type TimeOfDay = 'morning' | 'day' | 'night';
export const timeOfDay = (hour: number): TimeOfDay => (hour >= 4 && hour < 10 ? 'morning' : hour >= 10 && hour < 20 ? 'day' : 'night');

/** The land slots' odds (EncounterSlot_WildMonSlotRoll_Land) and the surf slots' (_Surfing): FireRed's. Each rod's 5 slots (_Fishing). */
const LAND_ODDS = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
const WATER_ODDS = [60, 30, 5, 4, 1];
const ROD_ODDS = [40, 30, 15, 10, 5];
/** The rods' tables, by RODS' index (the Old Rod's, the Good Rod's, the Super Rod's). */
export const ROD_TABLES = ['oldRod', 'goodRod', 'superRod'] as const;

/**
 * The step counters (FieldSystem's): `steps` the steps since the last map change or battle (encounterInhibitSteps: none
 * on the first 3), `buff` the turns back the way it came on encounter tiles (reverseTurnFrameSteps), `face` the way it
 * last faced at a check, `map` the map it's on.
 */
export interface EncounterState4 {
  steps: number;
  buff: number;
  prev: string;
  face?: string;
}

const OPPOSITE: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Whether a step on a wild encounter tile brings out a wild Pokémon (FieldSystem_PerformLandOrSurfEncounterCheck), the
 * step already counted (`enc.steps`, every step): none while the steps since a map change or battle are 3 or fewer; the
 * turns back counted; the table's rate by the lead's ability (Arena Trap, No Guard, Illuminate ×2; Stench, White Smoke,
 * Quick Feet ÷2; Snow Cloak's only in snow, which no map here has), at most 100; then two rolls: R(100) < m (40 running
 * or surfing, the player running: HGSS's Running Shoes, the user's, 2026-11-04; more for turning back: +30, +40, +60 at 2, 3, 4) and
 * R(100) < the rate.
 */
export function wildCheck4(rng: Rng, enc: EncounterState4, rate: number, lead: Mon, face: string | undefined): boolean {
  if (enc.steps <= 3) return false;
  if (face) {
    if (enc.face && OPPOSITE[enc.face] === face) enc.buff = Math.min(0xffff, enc.buff + 1);
    enc.face = face;
  }
  const ability = abilityOf(lead);
  if (ability === 'arena-trap' || ability === 'no-guard' || ability === 'illuminate') rate *= 2;
  else if (ability === 'white-smoke' || ability === 'quick-feet' || ability === 'stench') rate = Math.floor(rate / 2);
  rate = Math.min(rate, 100);
  const m = Math.min(100, 40 + (enc.buff >= 4 ? 60 : enc.buff === 3 ? 40 : enc.buff === 2 ? 30 : 0));
  return int(rng, 100) < m && int(rng, 100) < rate;
}

/** A Pokémon fished up's bite (FieldSystem_PerformFishEncounterCheck): R(100) < the rod's rate, doubled by a lead with Sticky Hold or Suction Cups, at most 100. */
export function fishBite4(rng: Rng, table: EncounterSlots, lead: Mon): boolean {
  const ability = abilityOf(lead);
  const rate = Math.min(100, ability === 'sticky-hold' || ability === 'suction-cups' ? table.rate * 2 : table.rate);
  return int(rng, 100) < rate;
}

/** A wild Pokémon to meet: its species and level, and the nature and gender the lead's ability gives it, if any. */
export interface Wild4 {
  species: number;
  level: number;
  nature?: number;
  gender?: 'male' | 'female';
}

/**
 * A wild Pokémon from a table (FieldSystem_GenerateRegularEncounter), or null when the lead's Keen Eye or Intimidate
 * scares it off: land's slots by the time of day (EncSlotArray_Init_Land), SoulSilver's Pokémon half the time where they
 * differ (the user's, as LeafGreen's in Kanto), a rod's with the night's fished Pokémon at night
 * (EncSlotArray_Update_NightFishing); Magnet Pull (Steel) or Static (Electric) half the time picking one of the slots of
 * that type alike (when some but not all are); else a slot by the odds; land's level the slot's, the others' rolled in
 * the slot's range; Hustle, Vital Spirit or Pressure half the time the highest; then Keen Eye or Intimidate, a lead above
 * level 5, half the time no Pokémon 5 or more levels below it; Synchronize half the time the lead's nature, Cute Charm
 * two times in three the other gender.
 */
export function pickWild4(rng: Rng, kind: 'land' | 'water' | (typeof ROD_TABLES)[number], tables: EncounterTable, lead: Mon, time: TimeOfDay): Wild4 | null {
  const table = tables[kind]!;
  const ss = table.soulSilver && int(rng, 2) === 1;
  const base = kind === 'land' ? (time === 'morning' ? (table.morning ?? table.mons) : time === 'night' ? (table.night ?? table.mons) : table.mons) : table.mons;
  const slots = base.map((s) => [...s] as [number, number, number]);
  if (ss) for (const [i, lo, hi, id] of table.soulSilver![kind === 'land' ? time : 'day'] ?? []) slots[i] = [lo, hi, id];
  if (time === 'night' && tables.nightFish && (kind === 'goodRod' || kind === 'superRod')) slots[kind === 'goodRod' ? 3 : 1]![2] = tables.nightFish;
  const odds = kind === 'land' ? LAND_ODDS : kind === 'water' ? WATER_ODDS : ROD_ODDS;
  const ability = abilityOf(lead);
  // Magnet Pull, then Static (EncounterSlot_AbilityInfluenceOnSlotChoiceCheck): one R(2) for the lead's own.
  const coerced = (type: TypeName): number | null => {
    if (int(rng, 2) !== 0) return null;
    const found = slots.flatMap((s, i) => (species(s[2]).types.includes(type) ? [i] : []));
    return found.length > 0 && found.length < slots.length ? found[int(rng, found.length)]! : null;
  };
  let slot = ability === 'magnet-pull' ? coerced('steel') : ability === 'static' ? coerced('electric') : null;
  if (slot === null) {
    let r = int(rng, 100);
    slot = odds.length - 1;
    for (let i = 0; i < odds.length; i++) {
      r -= odds[i]!;
      if (r < 0) {
        slot = i;
        break;
      }
    }
  }
  const raises = ability === 'hustle' || ability === 'vital-spirit' || ability === 'pressure';
  let [lo, hi, id] = slots[slot]!;
  let level: number;
  if (kind === 'land') {
    // ApplyAbilityEffectToSlotLevel: half the time the same species' highest slot level.
    level = hi;
    if (raises && int(rng, 2) !== 0) for (const s of slots) if (s[2] === id && s[1] > level) level = s[1];
  } else {
    // EncounterSlot_WildMonLevelRoll (the range the right way round).
    if (lo > hi) [lo, hi] = [hi, lo];
    level = lo + (int(rng, 65536) % (hi - lo + 1));
    if (raises && int(rng, 2) !== 0) level = hi;
  }
  if ((ability === 'keen-eye' || ability === 'intimidate') && lead.level > 5 && level <= lead.level - 5 && int(rng, 2) === 0) return null;
  const out: Wild4 = { species: id, level };
  if (ability === 'synchronize' && int(rng, 2) === 0) out.nature = lead.nature;
  const ratio = species(id).genderRatio;
  if (ability === 'cute-charm' && lead.gender && ratio > 0 && ratio < 254 && int(rng, 3) !== 0) out.gender = lead.gender === 'male' ? 'female' : 'male';
  return out;
}
