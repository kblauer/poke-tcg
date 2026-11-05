// The Idle Adventure's TMs and HMs (README: Idle Adventure, Buy TMs; the user's, 2026-10-27): every store's Buy TM/HM
// once the run has reached Celadon City (Johto's: Goldenrod City; Generation.tmShop, tmShopOpen in idle.ts), the 50 TMs and the 8 HMs in one list (machineList(); 4 groups
// by first letter before, 2026-10-27), each bought once (BUY), kept in the bag. A machine owned is a move any Pokémon that can learn it (FireRed's
// tmhm_learnsets.h, data/gen1/tms.ts by tools/idle/firered_tms.py) can have in its slots (SET_SLOTS), never used up.
import { itemData } from './data.js';
import { generation, perGeneration } from './generation.js';
import type { Mon } from './types.js';

/** The area whose reaching opens every store's Buy TMs (the user's). */

/** An HM's price (FireRed sells none: ₱0 in its data); a placeholder for the balance pass. */
export const HM_PRICE = 3000;

/** Buy TM/HM's list (the user's: one list): every TM, TM01 to TM50, then every HM. */
export const machineList = perGeneration((g): readonly string[] => Object.keys(g.tmMoves));

export const isMachine = (item: string) => item in generation().tmMoves;
export const isHm = (item: string) => item.startsWith('hm') && isMachine(item);

/** A machine's move. */
export const machineMove = (item: string) => generation().tmMoves[item]!;

/** A machine's price: FireRed's for a TM, HM_PRICE for an HM. */
export const machinePrice = (item: string) => (isHm(item) ? HM_PRICE : itemData(item).price);

/** Whether a species can learn a machine's move (FireRed's tmhm_learnsets.h). */
export const canLearnMachine = (speciesId: number, item: string) => (generation().tmLearners[speciesId] ?? []).includes(item);

/** The moves the bag's machines give a Pokémon (those its species can learn), in the machines' order, none it knows already. */
export const machineMoves = (mon: Pick<Mon, 'species' | 'moves'>, bag: Record<string, number>) =>
  Object.keys(generation().tmMoves)
    .filter((item) => (bag[item] ?? 0) > 0 && canLearnMachine(mon.species, item))
    .map(machineMove)
    .filter((m, i, all) => !mon.moves.includes(m) && all.indexOf(m) === i);

/** Every move a Pokémon can have in its slots: those it has learned and its owned machines' (the user's). */
export const slotMoves = (mon: Pick<Mon, 'species' | 'moves'>, bag: Record<string, number>) => [...mon.moves, ...machineMoves(mon, bag)];
