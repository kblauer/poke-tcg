// The Settings page's debug switches (User.debugFlags), only while debugging (never in production: env.debugEnabled):
// unlocking everything that's locked (cards, booster packs, run types, Battle Tower start floors, cosmetics, card
// flair), and 1,000,000 ₱, Stardust or EXP added (each taken away again when it's switched off).
import { prisma, type Prisma } from '@poke-tcg/db';
import { env } from './env.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface DebugFlags {
  unlockAll?: boolean;
  /** DEBUG_AMOUNT added to the bank (taken away again when it's switched off). */
  million?: boolean;
  /** DEBUG_AMOUNT added to the Stardust (taken away again when it's switched off). */
  dust?: boolean;
  /** DEBUG_AMOUNT added to the EXP (taken away again when it's switched off). */
  exp?: boolean;
}

/** What each currency switch adds to its currency. */
export const DEBUG_AMOUNT = 1_000_000;

/** The currency switches and the account's field each adds to. */
export const CURRENCY_FLAGS = { million: 'bank', dust: 'stardust', exp: 'exp' } as const;

/** The account's debug switches: all off unless debugging. */
export async function debugFlags(userId: string, db: Db = prisma): Promise<DebugFlags> {
  if (!env.debugEnabled) return {};
  const user = await db.user.findUnique({ where: { id: userId }, select: { debugFlags: true } });
  return (user?.debugFlags ?? {}) as DebugFlags;
}

/** Whether everything locked is unlocked for the account (its unlockAll switch, while debugging). */
export const unlocksAll = async (userId: string, db: Db = prisma) => !!(await debugFlags(userId, db)).unlockAll;
