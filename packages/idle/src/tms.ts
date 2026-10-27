// The Idle Adventure's TMs and HMs (README: Idle Adventure, Buy TMs; the user's, 2026-10-27): every store's Buy TMs
// once the run has reached Celadon City (tmShopOpen, idle.ts), the 50 TMs in 4 groups by their move's first letter and
// the 8 HMs, each bought once (BUY), kept in the bag. A machine owned is a move any Pokémon that can learn it (FireRed's
// tmhm_learnsets.h, data/gen1/tms.ts by tools/idle/firered_tms.py) can have in its slots (SET_SLOTS), never used up.
import { itemData, moveData } from './data.js';
import { TM_LEARNERS, TM_MOVES } from './data/gen1/tms.js';
import type { Mon } from './types.js';

export { TM_MOVES };

/** The area whose reaching opens every store's Buy TMs (the user's). */
export const TM_SHOP_AREA = 'celadon-city';

/** An HM's price (FireRed sells none: ₱0 in its data); a placeholder for the balance pass. */
export const HM_PRICE = 3000;

export type TmGroup = { id: string; label: string; hm?: true; from?: string; to?: string };

/** Buy TMs' groups (the user's: 4 of TMs by their move's first letter, as even as the letters allow, and the HMs). */
export const TM_GROUPS: readonly TmGroup[] = [
  { id: 'a-f', label: 'TMs A–F', from: 'A', to: 'F' },
  { id: 'g-r', label: 'TMs G–R', from: 'G', to: 'R' },
  { id: 's', label: 'TMs S', from: 'S', to: 'S' },
  { id: 't-z', label: 'TMs T–Z', from: 'T', to: 'Z' },
  { id: 'hm', label: 'HMs', hm: true },
];

export const isMachine = (item: string) => item in TM_MOVES;
export const isHm = (item: string) => item.startsWith('hm') && isMachine(item);

/** A machine's move. */
export const machineMove = (item: string) => TM_MOVES[item]!;

/** A machine's price: FireRed's for a TM, HM_PRICE for an HM. */
export const machinePrice = (item: string) => (isHm(item) ? HM_PRICE : itemData(item).price);

/** A group's machines, in their numbers' order (a TM group by its move's first letter). */
export function tmGroupStock(id: string): string[] {
  const group = TM_GROUPS.find((g) => g.id === id);
  if (!group) return [];
  return Object.keys(TM_MOVES).filter((item) => {
    if (group.hm) return isHm(item);
    if (isHm(item)) return false;
    const letter = moveData(machineMove(item)).name[0]!.toUpperCase();
    return letter >= group.from! && letter <= group.to!;
  });
}

/** Whether a species can learn a machine's move (FireRed's tmhm_learnsets.h). */
export const canLearnMachine = (speciesId: number, item: string) => (TM_LEARNERS[speciesId] ?? []).includes(item);

/** The moves the bag's machines give a Pokémon (those its species can learn), in the machines' order, none it knows already. */
export const machineMoves = (mon: Pick<Mon, 'species' | 'moves'>, bag: Record<string, number>) =>
  Object.keys(TM_MOVES)
    .filter((item) => (bag[item] ?? 0) > 0 && canLearnMachine(mon.species, item))
    .map(machineMove)
    .filter((m, i, all) => !mon.moves.includes(m) && all.indexOf(m) === i);

/** Every move a Pokémon can have in its slots: those it has learned and its owned machines' (the user's). */
export const slotMoves = (mon: Pick<Mon, 'species' | 'moves'>, bag: Record<string, number>) => [...mon.moves, ...machineMoves(mon, bag)];
