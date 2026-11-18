// Safari Draft runs on the server (README: Safari Draft; issue #239, section 9): the units (Gen 1's, from the catalog,
// built once per instance), starting a run, and applying the player's actions to it with the version check. The server
// resolves everything: shops, merges, encounters and battles are the safari package's applySafariAction from the run's
// RNG state, which never leaves the server (the browser gets safariView). A won run's ₱ are banked once, with the user
// row locked.
import { BASE4_REPRINTS, LC_REPRINTS, type CardDef, type PokemonCardDef } from '@poke-tcg/game-engine';
import { prisma, type SafariRun } from '@poke-tcg/db';
import { applySafariAction, bankablePokedollars, createSafari, safariView, unitsFrom, type SafariAction, type SafariState, type Unit } from '@poke-tcg/safari';
import { TRPCError } from '@trpc/server';
import { catalogIndex } from './catalog.js';
import { asJson, newSeed } from './games.js';
import { cardPool } from './pool.js';
import { lockUser } from './runs.js';

/** The word-for-word reprints left out of the units (issue #239, 2.1): Base Set 2's and Legendary Collection's. */
const REPRINTS: ReadonlySet<string> = new Set([...Object.keys(BASE4_REPRINTS), ...Object.keys(LC_REPRINTS)]);

/** A generation's units from its pool's card definitions and the catalog's Pokédex numbers (tested against the package's own). */
export const unitsFromDefs = (defs: readonly CardDef[], dexOf: (id: string) => readonly number[] | undefined) =>
  unitsFrom(defs.filter((d): d is PokemonCardDef => d.kind === 'pokemon'), REPRINTS, dexOf);

let units: Promise<Unit[]> | undefined;

/** Gen 1's draft units: the Gen 1 run pool's Pokémon (cardPool(1), the catalog through the card fixes), once per instance. */
export function safariUnits(): Promise<Unit[]> {
  units ??= Promise.all([cardPool(1), catalogIndex()]).then(([pool, rows]) =>
    unitsFromDefs(
      pool.map((c) => c.def),
      (id) => (rows.get(id)?.data as { dexId?: number[] | null } | undefined)?.dexId ?? undefined,
    ),
  );
  units.catch(() => (units = undefined));
  return units;
}

export type LoadedSafari = Omit<SafariRun, 'state'> & { state: SafariState };
const loaded = (run: SafariRun): LoadedSafari => ({ ...run, state: run.state as unknown as SafariState });

/** A run's status column for its state. */
export const safariStatus = (state: SafariState) => (state.phase === 'won' ? 'WON' : state.phase === 'lost' ? 'LOST' : 'ACTIVE');

/** The account's latest run (under way or over), if any. */
export async function latestSafari(userId: string): Promise<LoadedSafari | null> {
  const run = await prisma.safariRun.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return run && loaded(run);
}

/** Starts a run (at its starter pick). One at a time: not while another is under way (the issue: one run of a mode). */
export async function startSafari(userId: string): Promise<LoadedSafari> {
  const all = await safariUnits();
  const run = await prisma.$transaction(async (tx) => {
    // The lock makes the check below hold against two starts at once.
    await lockUser(tx, userId);
    if (await tx.safariRun.findFirst({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true } })) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish or concede your Safari Draft first' });
    }
    const seed = newSeed();
    const state = createSafari(seed, all);
    return tx.safariRun.create({ data: { ownerId: userId, seed, state: asJson(state), version: state.version } });
  });
  return loaded(run);
}

/**
 * Applies a player's action to their run, if it's still at `expectedVersion` (CONFLICT otherwise), and saves it. The run
 * that's just been won banks its ₱ (bankablePokedollars) in the same transaction, once (`banked`).
 */
export async function actSafari(userId: string, runId: string, expectedVersion: number, action: SafariAction): Promise<LoadedSafari> {
  const all = await safariUnits();
  const run = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const row = await tx.safariRun.findUnique({ where: { id: runId } });
    // Same error for "missing" and "not yours" so ids can't be probed.
    if (!row || row.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' });
    if (row.version !== expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
    const result = applySafariAction(row.state as unknown as SafariState, action, all);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    const state = result.state;
    const status = safariStatus(state);
    const bank = toBank(row.banked, state);
    const { count } = await tx.safariRun.updateMany({ where: { id: row.id, version: row.version }, data: { state: asJson(state), version: state.version, status, ...(bank && { banked: true }) } });
    if (count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
    if (bank) await tx.user.update({ where: { id: userId }, data: { bank: { increment: bank } } });
    return { ...row, state: asJson(state), version: state.version, status, banked: row.banked || bank > 0 } as SafariRun;
  });
  return loaded(run);
}

/** What saving a run moves to the bank: a won run's ₱, once (`banked`: already moved). */
export const toBank = (banked: boolean, state: SafariState) => (banked ? 0 : bankablePokedollars(state));

/** What the browser gets of a run: its view (safariView: no RNG state, no board before it's picked), never its state. */
export const clientSafari = (run: LoadedSafari) => ({ id: run.id, status: run.status, version: run.version, banked: run.banked, view: safariView(run.state) });
