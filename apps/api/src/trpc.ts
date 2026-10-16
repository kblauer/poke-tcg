import { initTRPC, TRPCError } from '@trpc/server';
import type { AuthUser } from './auth.js';
import { env } from './env.js';

export interface Context {
  user: AuthUser | null;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

/** A signed-in procedure that only exists while debugging is enabled (never in production): otherwise it's NOT_FOUND. */
export const debugProcedure = protectedProcedure.use(({ next }) => {
  if (!env.debugEnabled) throw new TRPCError({ code: 'NOT_FOUND' });
  return next();
});
