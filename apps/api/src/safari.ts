// Safari Draft runs on the server (README: Safari Draft; issue #239, section 9, and #254): the units (the safari package's
// own table, one a Pokémon, with each one's picture picked from the catalog, built once per instance), starting a run, and
// applying the player's actions to it with the version check. The server resolves everything: shops, merges, encounters
// and battles are the safari package's applySafariAction from the run's RNG state, which never leaves the server (the
// browser gets safariView). A won run's ₱ are banked once, with the user row locked.
import { GEN2_SETS, GEN3_SETS, POOL_SETS } from '@poke-tcg/campaign';
import { prisma, type SafariRun } from '@poke-tcg/db';
import { RULES, allUnits, applySafariAction, bankablePokedollars, createSafari, safariView, type SafariAction, type SafariState, type Unit } from '@poke-tcg/safari';
import { TRPCError } from '@trpc/server';
import { catalogInIdOrder, type CatalogRow } from './catalog.js';
import { asJson, newSeed } from './games.js';
import { lockUser } from './runs.js';

/** The sets a unit's picture comes from, the earliest first: Gen 1–3's, so the WOTC-era frames (the screen's art window) before the e-Card and EX ones. */
const PICTURE_SETS = [...POOL_SETS, ...GEN2_SETS, ...GEN3_SETS];

type PictureRow = Pick<CatalogRow, 'id' | 'setId' | 'name' | 'kind' | 'imageUrl' | 'data'>;
const plain = (name: string) => name.replace(/\s/g, '');

/**
 * Each unit's picture: a print of its Pokémon (the catalog's Pokédex number, one Pokémon a card) with an image, from
 * Gen 1–3's sets, never a reverse-holo print: one printed with the Pokémon's plain name first (no Dark, owner's, ex or δ
 * print), then the earliest set, then the lowest card id. By Pokédex number.
 */
export function unitPictures(rows: readonly PictureRow[], units: readonly Unit[]): Map<number, string> {
  const names = new Map(units.map((u) => [u.dex, plain(u.name)]));
  const rank = (r: PictureRow, dex: number) => [plain(r.name) === names.get(dex) ? 0 : 1, PICTURE_SETS.indexOf(r.setId)];
  const best = new Map<number, PictureRow>();
  for (const r of rows) {
    const dex = (r.data as { dexId?: number[] | null } | null)?.dexId;
    if (r.kind !== 'POKEMON' || !r.imageUrl || r.id.endsWith('-reverse') || !PICTURE_SETS.includes(r.setId) || dex?.length !== 1 || !names.has(dex[0]!)) continue;
    const held = best.get(dex[0]!);
    const [a, b] = [rank(r, dex[0]!), held ? rank(held, dex[0]!) : [2, 0]];
    if (a[0]! < b[0]! || (a[0] === b[0] && a[1]! < b[1]!)) best.set(dex[0]!, r);
  }
  return new Map([...best].map(([dex, r]) => [dex, r.id]));
}

/** The package's units with their pictures (`card`, and `fromCard`: the Pokémon it evolves from's). */
export function unitsWithPictures(rows: readonly PictureRow[]): Unit[] {
  const units = allUnits();
  const pictures = unitPictures(rows, units);
  const byName = new Map(units.map((u) => [u.name, u]));
  return units.map((u) => {
    const card = pictures.get(u.dex);
    const fromCard = u.evolvesFrom ? pictures.get(byName.get(u.evolvesFrom)!.dex) : undefined;
    return { ...u, ...(card && { card }), ...(fromCard && { fromCard }) };
  });
}

let units: Promise<Unit[]> | undefined;

/** The draft's units, once per instance. A run's rules read only what the package wrote: the pictures are for the screen. */
export function safariUnits(): Promise<Unit[]> {
  units ??= catalogInIdOrder().then(unitsWithPictures);
  units.catch(() => (units = undefined));
  return units;
}

export type LoadedSafari = Omit<SafariRun, 'state'> & { state: SafariState };
const loaded = (run: SafariRun): LoadedSafari => ({ ...run, state: run.state as unknown as SafariState });

/** A run's status column for its state. */
export const safariStatus = (state: SafariState) => (state.phase === 'won' ? 'WON' : state.phase === 'lost' ? 'LOST' : 'ACTIVE');

/** Whether a saved run is of the rules played now (RULES): one of older rules holds units that no longer exist. */
export const currentRules = (state: Pick<SafariState, 'rules'>) => state.rules === RULES;

/** The account's latest run (under way or over), if any: never one of older rules, which can't be shown. */
export async function latestSafari(userId: string): Promise<LoadedSafari | null> {
  const run = await prisma.safariRun.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return run && currentRules(loaded(run).state) ? loaded(run) : null;
}

/**
 * Starts a run (at its starter pick). One at a time: not while another is under way (the issue: one run of a mode). A run
 * of older rules still under way is closed first, lost, with nothing banked (issue #254).
 */
export async function startSafari(userId: string): Promise<LoadedSafari> {
  const all = await safariUnits();
  const run = await prisma.$transaction(async (tx) => {
    // The lock makes the check below hold against two starts at once.
    await lockUser(tx, userId);
    const active = await tx.safariRun.findMany({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true, state: true } });
    const old = active.filter((r) => !currentRules(r.state as unknown as SafariState));
    if (old.length < active.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish or concede your Safari Draft first' });
    if (old.length) await tx.safariRun.updateMany({ where: { id: { in: old.map((r) => r.id) } }, data: { status: 'LOST' } });
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
    if (!currentRules(row.state as unknown as SafariState)) throw new TRPCError({ code: 'BAD_REQUEST', message: "This run is from before Safari Draft's cards changed: start a new one" });
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

/** What the browser gets of a run: its view (safariView: no RNG state, no board before it's picked, the prices it shows), never its state. */
export const clientSafari = (run: LoadedSafari, units: readonly Unit[]) => ({ id: run.id, status: run.status, version: run.version, banked: run.banked, view: safariView(run.state, units) });
