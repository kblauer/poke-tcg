// The Settings page's debug switches (User.debugFlags), only while debugging (never in production: env.debugEnabled):
// unlocking everything that's locked (cards, booster packs, run types, Battle Tower start floors, cosmetics, card
// flair). Its buttons adding 1,000,000 ₱, Stardust or EXP are debug.addCurrency (no switch: each press adds it).
import { prisma, type Prisma } from '@poke-tcg/db';
import { env } from './env.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface DebugFlags {
  unlockAll?: boolean;
}

/** What each press of a currency button adds (debug.addCurrency). */
export const DEBUG_AMOUNT = 1_000_000;

/** The account's debug switches: all off unless debugging. */
export async function debugFlags(userId: string, db: Db = prisma): Promise<DebugFlags> {
  if (!env.debugEnabled) return {};
  const user = await db.user.findUnique({ where: { id: userId }, select: { debugFlags: true } });
  return (user?.debugFlags ?? {}) as DebugFlags;
}

/** Whether everything locked is unlocked for the account (its unlockAll switch, while debugging). */
export const unlocksAll = async (userId: string, db: Db = prisma) => !!(await debugFlags(userId, db)).unlockAll;
