// The Super Contests' inputs (README: Super Contests): feeding a Pokédex entry, its contest moves, entering, and each
// round's play, as the campaign package's contest.ts takes them.
import { DEX_SIZE } from '@poke-tcg/idle';
import { z } from 'zod';

const species = z.number().int().min(1).max(DEX_SIZE);

/** A Pokéblock or Poffin (by its row's id) fed to a Pokédex entry. */
export const contestFeedInput = z.object({ species, kind: z.enum(['pokeblock', 'poffin']), id: z.uuid() });
/** An entry's contest moves: 1-4 of its level-up learnset (2 to enter). */
export const contestMovesInput = z.object({ species, moves: z.array(z.string().min(1).max(40)).min(1).max(4) });
/** An entry's nature (0 Hardy … 24 Quirky) and held item (a contest scarf's key, or null). */
export const contestProfileInput = z.object({
  species,
  nature: z.number().int().min(0).max(24),
  item: z.enum(['red-scarf', 'blue-scarf', 'pink-scarf', 'green-scarf', 'yellow-scarf']).nullable(),
});
/** Entering a contest: the entry, the rank (0 Normal … 3 Master) and the category (0 Cool … 4 Tough). */
export const contestStartInput = z.object({ species, rank: z.number().int().min(0).max(3), category: z.number().int().min(0).max(4) });
const version = z.number().int().min(0);
/** The Visual Competition's outfit: the accessories worn (ids 0-99; at most 20). */
export const contestVisualInput = z.object({ expectedVersion: version, outfit: z.array(z.number().int().min(0).max(99)).max(20) });
/** The Dance Competition's presses: each cycle (0-7), its frame in the cycle and the move (1 Jump, 2 Front, 3 Left, 4 Right). */
export const contestDanceInput = z.object({
  expectedVersion: version,
  presses: z.array(z.object({ cycle: z.number().int().min(0).max(7), frame: z.number().int().min(0).max(2000), move: z.number().int().min(1).max(4) })).max(200),
});
/** An Acting Competition turn: the move and the judge (0 Jordan, 1 Dexter, 2 Keira). */
export const contestActInput = z.object({ expectedVersion: version, move: z.string().min(1).max(40), judge: z.number().int().min(0).max(2) });
