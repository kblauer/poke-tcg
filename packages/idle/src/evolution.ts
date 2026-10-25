// Evolution after a battle (the game evolves once the battle is over) and by evolution stones. Kanto's 151 only (the
// data keeps only evolutions into them). Trade evolutions evolve on level-up at a set level instead (agreed with the
// user; the levels are placeholders, to balance later).
import { species } from './data.js';
import { autoSlots, movesAt } from './mon.js';
import type { Mon } from './types.js';

/** The level a trade evolution happens at here (placeholders: Kadabra 36, Machoke 37, Graveler 37, Haunter 38). */
export const TRADE_LEVELS: Record<number, number> = { 64: 36, 67: 37, 75: 37, 93: 38 };

/** The species a Pokémon evolves into on reaching its level now, if any (EVO_LEVEL, and the trade levels). */
export function levelEvolution(mon: Pick<Mon, 'species' | 'level'>): number | null {
  for (const e of species(mon.species).evolutions) {
    if (e.method === 'level' && e.level !== undefined && mon.level >= e.level) return e.into;
    if (e.method === 'trade' && mon.level >= (TRADE_LEVELS[mon.species] ?? 101)) return e.into;
  }
  return null;
}

/** The species a stone evolves a Pokémon into, if it does (EVO_ITEM). */
export function stoneEvolution(mon: Pick<Mon, 'species'>, item: string): number | null {
  return species(mon.species).evolutions.find((e) => e.method === 'item' && e.item === item)?.into ?? null;
}

/** The stones a Pokémon can use. */
export const usableStones = (mon: Pick<Mon, 'species'>) => species(mon.species).evolutions.filter((e) => e.method === 'item' && e.item).map((e) => e.item!);

/** A Pokémon evolved into `into`: the new species keeps everything, learning the new species' moves for its level (as the game does on evolving). */
export function evolve(mon: Mon, into: number): { mon: Mon; learned: string[] } {
  const next: Mon = { ...mon, species: into, moves: [...mon.moves] };
  const learned = movesAt(into, mon.level).filter((m) => !next.moves.includes(m));
  next.moves.push(...learned);
  // A new ability slot only if the new species has fewer abilities.
  if (next.abilitySlot >= species(into).abilities.length) next.abilitySlot = 0;
  if (next.autoSlots) next.slots = autoSlots(next);
  return { mon: next, learned };
}
