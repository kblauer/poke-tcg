// Idle Adventure runs on the server (README: Idle Adventure), as runs.ts and towers.ts do for theirs: loading and saving
// a run with its version checked (CONFLICT when stale), the time it's played up to (`simulatedAt`), banking its money
// when it ends, and the account's Pokédex (IdleDex: each species' best IVs and EVs, merged from a segment's notes).
import { BALLS, bankedMoney, momShare, reachedArea, runEndMiles, UPGRADE_TUNING, type IdleUpgrades, CATCH_UP_CAP_MS, cuts, DEFAULT_IDLE_SETTINGS, generation, idleView, inGeneration, repairState, throwable, throwTick, tickStartMs, TOWN_WAIT_MS, withPending, type DexNote, type IdleAction, type IdleGen, type IdleSettings, type IdleState, type SegmentEvent } from '@poke-tcg/idle';
import { prisma, type IdleRun, type Prisma } from '@poke-tcg/db';
import { TRPCError } from '@trpc/server';
import { asJson } from './games.js';
import { lockUser } from './runs.js';

export type LoadedIdleRun = Omit<IdleRun, 'state'> & { state: IdleState };

/**
 * Why a generation can't be started (null: it can): each region after Kanto until a run of the one before it has beaten
 * the Champion (the user's: Kanto opens Johto, Johto opens Hoenn; issue #226).
 */
export const generationLocked = (gen: IdleGen, beaten: Set<number>) =>
  gen === 1 || beaten.has(gen - 1) ? null : `${inGeneration(gen, () => generation().region)} opens once a ${inGeneration((gen - 1) as IdleGen, () => generation().region)} run has beaten the Champion`;

// (Its indexes put back in bounds should the data have changed under a saved run: repairState.)
const loaded = (run: IdleRun): LoadedIdleRun => ({ ...run, state: repairState(run.state as unknown as IdleState) });

/** The account's upgrades (issue #270: User.idleUpgrades), as the rules read them. */
export async function idleUpgrades(userId: string, db: Db = prisma): Promise<IdleUpgrades> {
  const { idleUpgrades: owned } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { idleUpgrades: true } });
  return (owned ?? {}) as IdleUpgrades;
}

/**
 * A run with the account's upgrades in its state (IdleState.upgrades: the account's, not the run's), so one bought mid-run
 * applies from the next segment; none bought, none set (a run plays as before).
 */
export function withUpgrades(run: LoadedIdleRun, upgrades: IdleUpgrades): LoadedIdleRun {
  const any = Object.values(upgrades).some((n) => (n ?? 0) > 0);
  if (!any && !run.state.upgrades) return run;
  const state = { ...run.state };
  if (any) state.upgrades = upgrades;
  else delete state.upgrades;
  return { ...run, state };
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The run's status column for its state. */
export const idleStatusOf = (state: IdleState) => (state.phase === 'won' ? 'BEATEN' : state.phase === 'given-up' ? 'GIVEN_UP' : 'ACTIVE');

export async function loadOwnIdleRun(runId: string, userId: string): Promise<LoadedIdleRun> {
  const [run, upgrades] = await Promise.all([prisma.idleRun.findUnique({ where: { id: runId } }), idleUpgrades(userId)]);
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!run || run.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' });
  return withUpgrades(loaded(run), upgrades);
}

/** The account's latest run (under way or over). */
export async function latestIdleRun(userId: string): Promise<LoadedIdleRun | null> {
  const [run, upgrades] = await Promise.all([prisma.idleRun.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } }), idleUpgrades(userId)]);
  return run && withUpgrades(loaded(run), upgrades);
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
 * A segment's notes split (#204: a catch a cut then undid stayed caught): those only seen are recorded at once (`now`),
 * those with stats (a catch, the party's) once the segment is past (`later`, kept in SegmentReplay.dex: dueNotes).
 */
export const splitNotes = (notes: DexNote[]) => ({ now: notes.filter((n) => !n.ivs), later: notes.filter((n) => n.ivs) });

/** The notes a run's last segment holds back until it's past (SegmentReplay.dex). */
export const dueNotes = (state: IdleState): DexNote[] => state.replay?.dex ?? [];

/** The account's caught species and those its run's last segment caught, not recorded yet (dueNotes): auto-catch's "new" knows them. */
export const caughtWithDue = (caught: number[], state: IdleState) => [...new Set([...caught, ...dueNotes(state).map((n) => n.species)])];

/** A run with its last segment's held-back notes taken out (recorded now: dueNotes). */
export function withoutDueNotes(state: IdleState): IdleState {
  if (!state.replay?.dex) return state;
  const { dex: _, ...replay } = state.replay;
  return { ...state, replay };
}

// ---- The router's time rules (routers/idle.ts), pure ----

/** How far ahead of now a run may be played (the browser asks for the next segment as the last one ends; a little early is fine). */
export const AHEAD_MS = 15_000;

/** Why idle.next can't play the next segment yet (null: it can): the last still playing, or a town's wait not over (the browser takes the choice then). */
export function nextWait(state: Pick<IdleState, 'phase'>, simulatedAt: number, now: number): 'Still playing the last part' | 'Waiting in town' | null {
  if (simulatedAt > now + AHEAD_MS) return 'Still playing the last part';
  if (state.phase === 'town' && now < simulatedAt + TOWN_WAIT_MS) return 'Waiting in town';
  return null;
}

/** The time offline catch-up plays (idle.catchUp): from where the run was played to, the cap on the whole absence (not each call). */
export function catchUpWindow(simulatedAt: number, now: number) {
  const from = Math.max(simulatedAt, now - CATCH_UP_CAP_MS);
  return { from, elapsed: now - from };
}

/** The choices that move a run on from where it waits (idle.act restarts its clock). */
const LEAVING: IdleAction['type'][] = ['GYM', 'CONTINUE', 'GRIND', 'BACK_ROUTE', 'LEAVE_STORE', 'CAUGHT_CHOICE'];

/**
 * When idle.act restarts a run's clock (null: it's left alone). Leaving a town (time spent waiting there isn't played),
 * the store (the town's wait starts again), a catch's choice settled, any action out of a waiting town (a grind chosen
 * there), going on after the Stop mode (time stopped isn't played either): from the end of the segment playing, or now
 * (a choice sent early waits for its end, or the rest of a gym leader's battle, a white-out or a catch would never be
 * played). Only a cut (Stop, Continue run, the Town Map's) restarts it at now, the segment playing cut there.
 */
export function restartAt(before: IdleState, after: IdleState, action: IdleAction, now: number, simulatedAt: number): Date | null {
  if (cuts(action)) return new Date(now);
  const leaving = LEAVING.includes(action.type) || (before.phase === 'town' && after.phase !== 'town');
  const unstopped = !!withPending(before).stopped && !withPending(after).stopped;
  return leaving || unstopped ? new Date(Math.max(now, simulatedAt)) : null;
}

/** How late a ball may be asked for after its tick began by the server's clock (the browser's battle waits for its pictures, and the request's way). */
export const THROW_GRACE_MS = 5000;

/** Why a ball can't be asked for on `tick` of the last segment's wild battle (idle.throwBall), before it's played again; null: it can. */
export function throwError(state: IdleState, tick: number, master: boolean): string | null {
  const replay = state.replay;
  if (!replay || !throwable(state)) return 'Too late to throw a ball in this battle';
  if (replay.throws.some((t) => throwTick(t) >= tick)) return 'A ball is already on its way';
  // The ball button throws the best ball but the Master Ball, which has its own button (the user's, 2026-11-04).
  if (master && !(replay.prev.bag['master-ball'] ?? 0)) return 'No Master Ball in the bag';
  if (!master && !BALLS.some(([b]) => b !== 'master-ball' && (replay.prev.bag[b] ?? 0) > 0)) return 'No Poké Balls in the bag';
  return null;
}

/**
 * Why the battle played again can't take the ball on `tick` (null: it can): it's over by then, or (#204) that tick has
 * been played already by the clock, from the segment's start (`from`) as the browser paces it (tickStartMs), beyond
 * THROW_GRACE_MS: a lost battle or a fled Pokémon can't be played again with a ball on its first turn.
 */
export function throwTimeError(from: number, b: Extract<SegmentEvent, { t: 'battle' }>, tick: number, now: number): string | null {
  if (tick > b.ticks) return 'The battle is over';
  if (now > from + (b.at ?? 0) + tickStartMs(b, tick) + THROW_GRACE_MS) return 'Too late to throw a ball in this battle';
  return null;
}

/** Where a segment played again with a ball is played up to: its new end, never before now (time already played isn't played twice). */
export const throwPlayedTo = (from: number, durationMs: number, now: number) => new Date(Math.max(now, from + durationMs));

/**
 * Records a segment's notes in the account's Pokédex (agreed with the user): seen and caught only ever turn on, and
 * each stat's best IV and EV is the highest any of the account's Pokémon of the species ever had (each stat on its own).
 * Each species caught for the first time pays the upgrade currency's bonus (issue #270: UPGRADE_TUNING.firstCatch);
 * how many there were is returned.
 */
export async function recordDex(tx: Prisma.TransactionClient, userId: string, notes: DexNote[]): Promise<number> {
  if (!notes.length) return 0;
  let firsts = 0;
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
    if (e.caught && !old?.caught) firsts += 1;
    await tx.idleDex.upsert({ where: { userId_species: { userId, species } }, create: { userId, species, ...data }, update: data });
  }
  if (firsts) await tx.user.update({ where: { id: userId }, data: { idleMiles: { increment: firsts * UPGRADE_TUNING.firstCatch } } });
  return firsts;
}

/**
 * What a run pays as it ends (issue #270): the upgrade currency by how far it got (runEndMiles), and Send some to Mom's
 * share of its money, kept for the next run (replacing any not yet used).
 */
export const runEndPay = (state: IdleState) => ({
  miles: inGeneration(state.gen ?? 1, () => runEndMiles({ badges: state.badges, reached: reachedArea(state), won: state.phase === 'won' })),
  mom: momShare(state.upgrades, state.money),
});

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
    if (bank) {
      // Its ₱ to the bank (the Champion beaten), the upgrade currency it earned, Mom's share for the next run.
      const pay = runEndPay(state);
      await tx.user.update({ where: { id: run.ownerId }, data: { bank: { increment: bankedMoney(state) }, idleMiles: { increment: pay.miles }, idleMom: pay.mom } });
    }
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
