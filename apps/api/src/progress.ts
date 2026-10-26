// Account progress (agreed with the user): the booster packs an account can buy, and the run types it can start. An
// account starts with no packs: a run's first battle finished without conceding it unlocks its generation's next pack,
// and beating a run unlocks all of them. The Gym Challenge needs every badge of its generation, the Champion run its
// Gym Challenge beaten (runTypeLock in the campaign package). With the debug switch to unlock everything, every pack and run type is open.
import { battlesCompleted, generation, nextPack, PACK_SETS, RUN_TYPE_IDS, RUN_TYPES, runType, runTypeLock, type RunState, type RunTypeId } from '@poke-tcg/campaign';
import { prisma, type Prisma } from '@poke-tcg/db';
import { unlocksAll } from './debugFlags.js';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The sets whose packs the user can buy: every set with packs with the debug switch to unlock everything (unlocksAll,
 * never in production), unless `owned` asks for the ones really unlocked (what a run earns next).
 */
export async function unlockedPacks(userId: string, db: Db = prisma, { owned = false }: { owned?: boolean } = {}): Promise<Set<string>> {
  if (!owned && (await unlocksAll(userId, db))) return new Set(PACK_SETS);
  return new Set((await db.packUnlock.findMany({ where: { userId }, select: { setId: true } })).map((p) => p.setId));
}

/**
 * The packs a run earned going from `prev` to `next` and the user doesn't have yet: every pack of its generation when
 * it's just been beaten, or the generation's next pack (nextPack) when its first battle was just completed. Only reads:
 * the caller unlocks them (unlockPacks) once the run is saved.
 */
export async function earnedPacks(userId: string, prev: RunState, next: RunState, db: Db = prisma): Promise<{ id: string; name: string }[]> {
  const beaten = next.phase === 'won' && prev.phase !== 'won';
  const firstBattle = battlesCompleted(prev) === 0 && battlesCompleted(next) > 0;
  if (!beaten && !firstBattle) return [];
  const g = generation(runType(next.type).generation);
  const unlocked = await unlockedPacks(userId, db, { owned: true });
  const setIds = beaten ? g.packs.filter((id) => !unlocked.has(id)) : [nextPack(g, unlocked)].filter((id): id is string => id !== null);
  if (!setIds.length) return [];
  const sets = await db.cardSet.findMany({ where: { id: { in: setIds } }, select: { id: true, name: true } });
  return setIds.map((id) => ({ id, name: sets.find((s) => s.id === id)?.name ?? id }));
}

export async function unlockPacks(userId: string, setIds: string[], db: Db = prisma) {
  if (setIds.length) await db.packUnlock.createMany({ data: setIds.map((setId) => ({ userId, setId })), skipDuplicates: true });
}

/** For the run picker: why each run type can't be started yet (null if it can; always with the debug switch to unlock everything), and how many times the account has beaten it. */
export async function runTypeProgress(userId: string, db: Db = prisma): Promise<Record<RunTypeId, { locked: string | null; beaten: number }>> {
  const [items, won, all] = await Promise.all([
    db.inventoryItem.findMany({ where: { userId, quantity: { gt: 0 } }, select: { itemId: true } }),
    db.run.groupBy({ by: ['type'], where: { ownerId: userId, status: 'WON' }, _count: true }),
    unlocksAll(userId, db),
  ]);
  const account = { badges: new Set(items.map((i) => i.itemId)), beaten: new Set(won.map((r) => r.type)) };
  const times = new Map(won.map((r) => [r.type, r._count]));
  return Object.fromEntries(RUN_TYPE_IDS.map((id) => [id, { locked: all ? null : runTypeLock(RUN_TYPES[id], account), beaten: times.get(id) ?? 0 }])) as Record<RunTypeId, { locked: string | null; beaten: number }>;
}
