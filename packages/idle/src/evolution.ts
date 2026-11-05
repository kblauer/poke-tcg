// Evolution after a battle (the game evolves once the battle is over) and by evolution stones. Kanto's 151 (the data
// keeps only evolutions into them) and Johto's 493 (HGSS's methods, issue #170, step 4e). Trade evolutions evolve on
// level-up at a set level instead (agreed with the user; the levels are placeholders, to balance later), and so do the
// ones these runs can't do as the game does (the user's, 2026-11-04: friendship, a trade with a held item, a held item
// by day or night, a Sinnoh place, Beauty; SET_LEVELS).
import { species } from './data.js';
import type { TimeOfDay } from './encounters4.js';
import { autoSlots, movesAt } from './mon.js';
import { calcStats } from './stats.js';
import type { Mon } from './types.js';

/** The level a trade evolution happens at here (placeholders: Kadabra 36, Machoke 37, Graveler 37, Haunter 38). */
export const TRADE_LEVELS: Record<number, number> = { 64: 36, 67: 37, 75: 37, 93: 38 };

/**
 * The level the evolutions these runs can't do as HGSS does happen at instead (placeholders, the user's, 2026-11-04; we
 * may add friendship later), by the species evolved into: friendship (Crobat, Pikachu, Clefairy, Jigglypuff, Togetic,
 * Blissey, Espeon by day, Umbreon by night, Roselia, Lucario, Chimecho, Lopunny, Snorlax), a trade with a held item
 * (Steelix, Scizor, Kingdra, Politoed, Slowking, Porygon2, Porygon-Z, Electivire, Magmortar, Rhyperior, Dusknoir,
 * Huntail, Gorebyss), a held item by night or day (Weavile, Gliscor, Chansey from Happiny), a Sinnoh place (Magnezone,
 * Probopass, Leafeon, Glaceon) and Beauty (Milotic). Where a Pokémon has two ways, the game's first in its list comes first.
 */
export const SET_LEVELS: Record<number, number> = {
  169: 35, 25: 10, 35: 10, 39: 10, 176: 15, 242: 40, 196: 25, 197: 25, 315: 15, 448: 25, 358: 20, 428: 25, 143: 30,
  208: 35, 212: 35, 230: 45, 186: 40, 199: 40, 233: 30, 474: 45, 466: 45, 467: 45, 464: 50, 477: 45, 367: 30, 368: 30,
  461: 35, 472: 35, 113: 20, 462: 40, 476: 35, 470: 30, 471: 30, 350: 30,
};
const SET_LEVEL_METHODS = new Set(['friendship', 'friendship_day', 'friendship_night', 'trade_item', 'item_day', 'item_night', 'coronet', 'eterna', 'beauty']);

/** What a level-up evolution may look at besides the Pokémon: the run's time of day (HGSS's; none in Kanto) and the party. */
export interface EvolutionContext {
  time?: TimeOfDay | null;
  party?: readonly Pick<Mon, 'species'>[];
}

/**
 * The species a Pokémon evolves into on reaching its level now, if any (EVO_LEVEL, the trade levels; HGSS's: a known
 * move, a gender, Tyrogue's Attack and Defense, Wurmple's personality (its uid's, here), Nincada (Shedinja: the run's),
 * Mantyke with a Remoraid in the party, and SET_LEVELS for the rest, by day (not night) or by night where the game says).
 */
export function levelEvolution(mon: Pick<Mon, 'species' | 'level'> & Partial<Pick<Mon, 'moves' | 'gender' | 'ivs' | 'evs' | 'nature' | 'uid'>>, ctx: EvolutionContext = {}): number | null {
  const night = ctx.time === 'night';
  for (const e of species(mon.species).evolutions) {
    const at = e.level !== undefined && mon.level >= e.level;
    switch (e.method) {
      case 'level':
      case 'level_ninjask':
        if (at) return e.into;
        break;
      case 'trade':
        if (mon.level >= (TRADE_LEVELS[mon.species] ?? 101)) return e.into;
        break;
      case 'has_move':
        if (mon.moves?.includes(e.move!)) return e.into;
        break;
      case 'level_male':
      case 'level_female':
        if (at && mon.gender === (e.method === 'level_male' ? 'male' : 'female')) return e.into;
        break;
      case 'level_atk_gt_def':
      case 'level_atk_eq_def':
      case 'level_atk_lt_def': {
        if (!at || !mon.ivs || !mon.evs) break;
        const s = calcStats(mon.species, mon.level, mon.ivs, mon.evs, mon.nature ?? 0);
        const c = Math.sign(s[1] - s[2]);
        if (c === { level_atk_gt_def: 1, level_atk_eq_def: 0, level_atk_lt_def: -1 }[e.method]) return e.into;
        break;
      }
      case 'level_pid_lo':
      case 'level_pid_hi':
        // Wurmple: its personality's high half mod 10 below 5 (Silcoon) or not (Cascoon), from its uid here.
        if (at && (parseInt((mon.uid ?? '0').slice(0, 4), 36) % 10 < 5) === (e.method === 'level_pid_lo')) return e.into;
        break;
      case 'other_party_mon':
        if (ctx.party?.some((p) => p.species === e.with)) return e.into;
        break;
      default:
        if (SET_LEVEL_METHODS.has(e.method) && mon.level >= (SET_LEVELS[e.into] ?? 101)) {
          if (/_night$/.test(e.method) && !night) break;
          if (/_day$/.test(e.method) && night) break;
          return e.into;
        }
    }
  }
  return null;
}

/** Whether Nincada's evolution leaves a Shedinja (HGSS's level_shedinja: with room in the party and a Poké Ball, the run's). */
export const leavesShedinja = (from: number) => species(from).evolutions.some((e) => e.method === 'level_shedinja');
export const SHEDINJA = 292;

/** The species a stone evolves a Pokémon into, if it does (EVO_ITEM; HGSS's Dawn Stone by gender). */
export function stoneEvolution(mon: Pick<Mon, 'species'> & Partial<Pick<Mon, 'gender'>>, item: string): number | null {
  return species(mon.species).evolutions.find((e) => e.item === item && (e.method === 'item' || (e.method === 'stone_male' && mon.gender === 'male') || (e.method === 'stone_female' && mon.gender === 'female')))?.into ?? null;
}

/** The stones a Pokémon can use. */
export const usableStones = (mon: Pick<Mon, 'species'> & Partial<Pick<Mon, 'gender'>>) =>
  species(mon.species).evolutions.filter((e) => e.item && (e.method === 'item' || (e.method === 'stone_male' && mon.gender === 'male') || (e.method === 'stone_female' && mon.gender === 'female'))).map((e) => e.item!);

/**
 * A Pokémon evolved into `into`: the new species keeps everything, learning the new species' moves for its level (as the
 * game does on evolving); automatic slots picked again, with the bag's TMs it can learn (`bag`, the run's).
 */
export function evolve(mon: Mon, into: number, bag: Record<string, number> = {}): { mon: Mon; learned: string[] } {
  const next: Mon = { ...mon, species: into, moves: [...mon.moves] };
  const learned = movesAt(into, mon.level).filter((m) => !next.moves.includes(m));
  next.moves.push(...learned);
  // A new ability slot only if the new species has fewer abilities.
  if (next.abilitySlot >= species(into).abilities.length) next.abilitySlot = 0;
  if (next.autoSlots) next.slots = autoSlots(next, bag);
  return { mon: next, learned };
}
