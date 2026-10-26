// Idle Adventure runs on the server (README: Idle Adventure), as runs.ts and towers.ts do for theirs: loading and saving
// a run with its version checked (CONFLICT when stale), the time it's played up to (`simulatedAt`), banking its money
// when it ends, and the account's Pokédex (IdleDex: each species' best IVs and EVs, merged from a segment's notes).
import { bankedMoney, DEFAULT_IDLE_SETTINGS, idleView, type DexNote, type IdleSettings, type IdleState } from '@poke-tcg/idle';
import { prisma, type IdleRun, type Prisma } from '@poke-tcg/db';
import { TRPCError } from '@trpc/server';
import { asJson } from './games.js';
import { lockUser } from './runs.js';

export type LoadedIdleRun = Omit<IdleRun, 'state'> & { state: IdleState };
const loaded = (run: IdleRun): LoadedIdleRun => ({ ...run, state: run.state as unknown as IdleState });

type Db = Prisma.TransactionClient | typeof prisma;

/** The run's status column for its state. */
export const idleStatusOf = (state: IdleState) => (state.phase === 'won' ? 'BEATEN' : state.phase === 'given-up' ? 'GIVEN_UP' : 'ACTIVE');

export async function loadOwnIdleRun(runId: string, userId: string): Promise<LoadedIdleRun> {
  const run = await prisma.idleRun.findUnique({ where: { id: runId } });
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!run || run.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' });
  return loaded(run);
}

/** The account's latest run (under way or over). */
export async function latestIdleRun(userId: string): Promise<LoadedIdleRun | null> {
  const run = await prisma.idleRun.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return run && loaded(run);
}

/** The account's settings for the mode, the defaults filling what's missing. */
export async function idleSettings(userId: string, db: Db = prisma): Promise<IdleSettings> {
  const { idleSettings: saved } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { idleSettings: true } });
  return { ...DEFAULT_IDLE_SETTINGS, ...(saved as Partial<IdleSettings>) };
}

/** The species the account has caught (auto-catch's "new", and the starters it can pick from the second run on). */
export async function caughtSpecies(userId: string, db: Db = prisma): Promise<number[]> {
  const rows = await db.idleDex.findMany({ where: { userId, caught: true }, select: { species: true } });
  return rows.map((r) => r.species);
}

const maxEach = (a: number[], b: readonly number[]) => a.map((v, i) => Math.max(v, b[i] ?? 0));

/**
 * A segment's dex notes merged per species: a note with stats is one of the account's Pokémon (a party Pokémon, one
 * caught or released: caught), one without only a Pokémon seen; each stat's highest IV and EV among the owned.
 */
export function mergeNotes(notes: DexNote[]) {
  const by = new Map<number, { caught: boolean; shiny: boolean; iv: number[]; ev: number[] }>();
  for (const n of notes) {
    const e = by.get(n.species) ?? { caught: false, shiny: false, iv: [0, 0, 0, 0, 0, 0], ev: [0, 0, 0, 0, 0, 0] };
    if (n.ivs) {
      e.caught = true;
      e.shiny ||= !!n.shiny;
      e.iv = maxEach(e.iv, n.ivs);
      e.ev = maxEach(e.ev, n.evs ?? []);
    }
    by.set(n.species, e);
  }
  return by;
}

/**
 * Records a segment's notes in the account's Pokédex (agreed with the user): seen and caught only ever turn on, and
 * each stat's best IV and EV is the highest any of the account's Pokémon of the species ever had (each stat on its own).
 */
export async function recordDex(tx: Prisma.TransactionClient, userId: string, notes: DexNote[]) {
  if (!notes.length) return;
  const merged = mergeNotes(notes);
  const existing = new Map((await tx.idleDex.findMany({ where: { userId, species: { in: [...merged.keys()] } } })).map((r) => [r.species, r]));
  for (const [species, e] of merged) {
    const old = existing.get(species);
    const data = {
      seen: true,
      caught: (old?.caught ?? false) || e.caught,
      shiny: (old?.shiny ?? false) || e.shiny,
      bestIv: maxEach(old?.bestIv ?? [0, 0, 0, 0, 0, 0], e.iv),
      bestEv: maxEach(old?.bestEv ?? [0, 0, 0, 0, 0, 0], e.ev),
    };
    await tx.idleDex.upsert({ where: { userId_species: { userId, species } }, create: { userId, species, ...data }, update: data });
  }
}

/**
 * Saves a run's new state (CONFLICT if someone else saved since), with its dex notes and its time played up to; when it
 * ends, its money goes to the bank once (`banked`), only if the Champion was beaten (`bankedMoney`, the user's: a run
 * given up banks nothing).
 */
export async function saveIdleRun(run: LoadedIdleRun, state: IdleState, o: { dex?: DexNote[]; simulatedAt?: Date } = {}): Promise<LoadedIdleRun> {
  const status = idleStatusOf(state);
  const bank = status !== 'ACTIVE' && !run.banked;
  const saved = await prisma.$transaction(async (tx) => {
    if (bank) await lockUser(tx, run.ownerId);
    const { count } = await tx.idleRun.updateMany({
      where: { id: run.id, version: run.version },
      data: { state: asJson(state), version: state.version, status, ...(bank && { banked: true }), ...(o.simulatedAt && { simulatedAt: o.simulatedAt }) },
    });
    if (count === 0) return false;
    if (bank && bankedMoney(state) > 0) await tx.user.update({ where: { id: run.ownerId }, data: { bank: { increment: bankedMoney(state) } } });
    await recordDex(tx, run.ownerId, o.dex ?? []);
    return true;
  });
  if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
  return { ...run, state, version: state.version, status, banked: run.banked || bank, simulatedAt: o.simulatedAt ?? run.simulatedAt };
}

/** What the browser gets of a run. */
export function clientIdleRun(run: LoadedIdleRun) {
  return { id: run.id, version: run.version, status: run.status, simulatedAt: run.simulatedAt.toISOString(), view: idleView(run.state) };
}

export type ClientIdleRun = ReturnType<typeof clientIdleRun>;
