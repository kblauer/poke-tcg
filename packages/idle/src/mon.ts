// A run's Pokémon (README: Idle Adventure): making them (starters, wild, trainers'), the moves they know, their basic
// move, the energy each move costs and the default slots. The energy rule (agreed with the user): no PP; every Pokémon
// has a basic move (energy 0, always usable) and 3 slots, used in turn: it waits on the next slot (using the basic
// move while its energy builds), uses it, then the next, back to the first; it gains 1 energy after acting.
import { int, type Rng } from '@poke-tcg/campaign';
import { moveData, species } from './data.js';
import { expForLevel } from './stats.js';
import type { Mon, MoveData, Stats } from './types.js';

/** Move effects that deal damage without a fixed power (power 1 in the data): their energy cost is set here instead. */
const VARIABLE_DAMAGE_COST: Record<string, number> = {
  ohko: 6, level_damage: 3, dragon_rage: 3, sonicboom: 2, super_fang: 3, flail: 3, low_kick: 3, magnitude: 3, counter: 3,
  mirror_coat: 3, endeavor: 3, psywave: 3, present: 2, return: 4, frustration: 4, hidden_power: 3, spit_up: 4, bide: 3,
  beat_up: 3,
};

/** Status moves' energy costs by what they do (placeholders, to balance later: agreed with the user). */
const SLEEP_FREEZE = new Set(['sleep', 'yawn']);
const MAJOR_STATUS = new Set(['paralyze', 'poison', 'toxic', 'will_o_wisp', 'confuse', 'swagger', 'flatter', 'teeter_dance', 'attract']);
const ONE_STAGE = new Set([
  'attack_up', 'defense_up', 'speed_up', 'special_attack_up', 'special_defense_up', 'accuracy_up', 'evasion_up', 'attack_down',
  'defense_down', 'speed_down', 'special_attack_down', 'special_defense_down', 'accuracy_down', 'evasion_down', 'defense_curl',
  'minimize', 'charge',
]);
const HEALING = new Set(['restore_hp', 'softboiled', 'rest', 'synthesis', 'moonlight', 'morning_sun', 'wish', 'swallow', 'ingrain']);

/** A move's energy cost: by power for damaging moves, clamp(round(power / 20), 1, 6); status moves by effect (placeholders). */
export function energyCost(key: string): number {
  const m = moveData(key);
  if (m.power > 1) return Math.min(6, Math.max(1, Math.round(m.power / 20)));
  if (m.power === 1) return VARIABLE_DAMAGE_COST[m.effect] ?? 3;
  if (SLEEP_FREEZE.has(m.effect)) return 5;
  if (MAJOR_STATUS.has(m.effect)) return 4;
  if (ONE_STAGE.has(m.effect)) return 2;
  if (HEALING.has(m.effect)) return 4;
  return 3;
}

/** Whether a move deals damage (any power, fixed or variable). */
export const isDamaging = (m: MoveData) => m.power > 0;

/**
 * Hand overrides of the basic-move rule (BASIC_MOVES): species with no damaging move of their own (Abra, Ditto) or whose
 * rule gives an odd pick. Placeholders, to check with the user.
 */
const BASIC_OVERRIDES: Record<number, string> = {
  63: 'confusion', // Abra: only Teleport; Kadabra's first damaging move.
  132: 'struggle', // Ditto: only Transform (a Transformed Ditto uses its target's basic move).
};

/** A move counts for the basic-move rule when it does ordinary damage and has 20 PP or more ("high PP"). */
const basicCandidate = (key: string) => {
  const m = moveData(key);
  return m.power > 1 && m.pp >= 20 && m.effect !== 'recharge' && m.effect !== 'explosion';
};

const evolvesFrom = (id: number) => {
  for (let s = 1; s <= 151; s++) if (species(s).evolutions.some((e) => e.into === id)) return s;
  return null;
};

const basicCache = new Map<number, string>();

/**
 * A species' basic move (agreed with the user): the earliest damaging, high-PP level-up move of its own learnset
 * (Charmander, Charmeleon, Charizard: Scratch); a species that neither evolves nor evolves from anything takes the next
 * stronger such move than its most basic (Tauros: Horn Attack); one with none takes its pre-evolution's (Metapod: Tackle).
 * BASIC_OVERRIDES first.
 */
export function basicMove(id: number): string {
  const cached = basicCache.get(id);
  if (cached) return cached;
  let found = BASIC_OVERRIDES[id];
  if (!found) {
    const s = species(id);
    const candidates = [...new Set(s.learnset.map(([, m]) => m).filter(basicCandidate))];
    const from = evolvesFrom(id);
    if (!candidates.length) found = from ? basicMove(from) : 'struggle';
    else if (!s.evolutions.length && !from) {
      const first = candidates[0]!;
      found = candidates.find((m) => moveData(m).power > moveData(first).power) ?? first;
    } else found = candidates[0]!;
  }
  basicCache.set(id, found);
  return found;
}

/**
 * A Pokémon's basic move: its species' (basicMove) once it knows it; until then (Onix at level 14 doesn't know
 * DragonBreath yet), the first damaging, high-PP move it knows, then any damaging move it knows, then Struggle.
 */
export function basicFor(mon: Pick<Mon, 'species' | 'moves'>): string {
  const rule = basicMove(mon.species);
  if (mon.moves.includes(rule) || BASIC_OVERRIDES[mon.species]) return rule;
  return mon.moves.find(basicCandidate) ?? mon.moves.find((m) => moveData(m).power > 1) ?? mon.moves.find((m) => moveData(m).power > 0) ?? 'struggle';
}

/** The level-up moves a species has learned by a level, oldest first, each once (all kept: agreed with the user). */
export function movesUpTo(id: number, level: number): string[] {
  const out: string[] = [];
  for (const [lvl, m] of species(id).learnset) if (lvl <= level && !out.includes(m)) out.push(m);
  return out;
}

/** The moves a species learns on reaching exactly `level`. */
export const movesAt = (id: number, level: number) => species(id).learnset.filter(([lvl]) => lvl === level).map(([, m]) => m);

/** The 4 moves a wild Pokémon (or a trainer's, without custom moves) knows: its last 4 level-up moves (GiveMonInitialMoveset). */
export function lastFourMoves(id: number, level: number): string[] {
  const out: string[] = [];
  for (const [lvl, m] of species(id).learnset) {
    if (lvl > level || out.includes(m)) continue;
    if (out.length === 4) out.shift();
    out.push(m);
  }
  return out;
}

/**
 * The default slots (agreed): the 3 strongest moves it knows but its basic move, newest first on ties; status moves after
 * damaging ones, newest first.
 */
export function autoSlots(mon: Pick<Mon, 'species' | 'moves'>): string[] {
  const basic = basicFor(mon);
  const known = mon.moves.filter((m) => m !== basic);
  const order = known.map((m, i) => ({ m, i, power: moveData(m).power })).sort((a, b) => b.power - a.power || b.i - a.i);
  return order.slice(0, 3).map((o) => o.m);
}

/** A random gender for a species (by its gender ratio, as the game's personality value decides it). */
export function rollGender(rng: Rng, id: number): Mon['gender'] {
  const r = species(id).genderRatio;
  if (r === 255) return null;
  if (r === 254) return 'female';
  if (r === 0) return 'male';
  return int(rng, 256) < r ? 'female' : 'male';
}

/** A fresh uid for a run's Pokémon (from the run's RNG, so a replay gives the same ids). */
export const newUid = (rng: Rng) => `${int(rng, 2 ** 31).toString(36)}${int(rng, 2 ** 31).toString(36)}`;

export interface NewMon {
  species: number;
  level: number;
  ivs?: Stats;
  evs?: Stats;
  nature?: number;
  moves?: string[];
  item?: string;
  shiny?: boolean;
}

/** A new Pokémon: random IVs, nature, gender and ability unless given; its level-up moves so far (or `moves`). */
export function createMon(rng: Rng, o: NewMon): Mon {
  const s = species(o.species);
  const ivs = o.ivs ?? (Array.from({ length: 6 }, () => int(rng, 32)) as Stats);
  const moves = o.moves ?? movesUpTo(o.species, o.level);
  const mon: Mon = {
    uid: newUid(rng),
    species: o.species,
    level: o.level,
    exp: expForLevel(s.growth, o.level),
    ivs,
    evs: o.evs ?? [0, 0, 0, 0, 0, 0],
    nature: o.nature ?? int(rng, 25),
    gender: rollGender(rng, o.species),
    abilitySlot: s.abilities.length > 1 ? int(rng, 2) : 0,
    moves,
    slots: [],
    autoSlots: true,
    ...(o.item && { item: o.item }),
    ...(o.shiny && { shiny: true }),
  };
  mon.slots = autoSlots(mon);
  return mon;
}

/** A Pokémon's ability. */
export const abilityOf = (mon: Pick<Mon, 'species' | 'abilitySlot'>) => {
  const a = species(mon.species).abilities;
  return a[mon.abilitySlot] ?? a[0] ?? 'none';
};
