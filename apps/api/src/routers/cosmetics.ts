import { COSMETICS, DEFAULT_COSMETIC, hasCosmetic, type CosmeticKind } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { buyCosmeticInput, useCosmeticInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { env } from '../env.js';
import { protectedProcedure, router } from '../trpc.js';

/**
 * What an account has of the cosmetics (hasCosmetic): the ones it bought (CosmeticUnlock), the run types it has beaten
 * (for those unlocked by beating one), and every one while debugging (never in production: env.debugEnabled).
 */
async function cosmeticsOf(userId: string) {
  const [bought, won] = await Promise.all([
    prisma.cosmeticUnlock.findMany({ where: { userId }, select: { cosmeticId: true } }),
    prisma.run.groupBy({ by: ['type'], where: { ownerId: userId, status: 'WON' } }),
  ]);
  const account = { bought: new Set(bought.map((b) => b.cosmeticId)), beaten: new Set<string>(won.map((r) => r.type)), debug: env.debugEnabled };
  return (id: string) => {
    const def = COSMETICS[id];
    return !!def && hasCosmetic(def, account);
  };
}

/** The cosmetic of `kind` in use: the one picked if the account (still) has it, otherwise the default. */
function inUse(kind: CosmeticKind, picked: string | null, has: (id: string) => boolean) {
  return picked && COSMETICS[picked]?.kind === kind && has(picked) ? picked : DEFAULT_COSMETIC[kind];
}

export const cosmeticsRouter = router({
  /** Every cosmetic with whether the account has it, the card back, playmat and coin in use, and the ₱ in the bank. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [has, user] = await Promise.all([
      cosmeticsOf(ctx.user.id),
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { cardBack: true, playmat: true, coin: true, bank: true } }),
    ]);
    return {
      cosmetics: Object.values(COSMETICS).map((c) => ({ ...c, owned: has(c.id) })),
      cardBack: inUse('cardBack', user.cardBack, has),
      playmat: inUse('playmat', user.playmat, has),
      coin: inUse('coin', user.coin, has),
      bank: user.bank,
    };
  }),

  /** Buys a cosmetic sold for ₱ with ₱ from the bank (once: one already had isn't bought again). */
  buy: protectedProcedure.input(buyCosmeticInput).mutation(async ({ ctx, input }) => {
    const def = COSMETICS[input.id]!;
    if (def.unlock.type !== 'buy') throw new TRPCError({ code: 'BAD_REQUEST', message: `${def.name} isn't for sale` });
    const price = def.unlock.price;
    const has = await cosmeticsOf(ctx.user.id);
    if (has(def.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: `You already have ${def.name}` });
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, bank: { gte: price } }, data: { bank: { decrement: price } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `${def.name} costs ₱${price}: not enough in the bank` });
      await tx.cosmeticUnlock.create({ data: { userId: ctx.user.id, cosmeticId: def.id } });
      return { ok: true };
    });
  }),

  /** Puts a cosmetic the account has in use for its kind (null: back to the default). */
  use: protectedProcedure.input(useCosmeticInput).mutation(async ({ ctx, input }) => {
    if (input.id !== null) {
      const def = COSMETICS[input.id]!;
      if (def.kind !== input.kind) throw new TRPCError({ code: 'BAD_REQUEST', message: `${def.name} isn't a ${{ cardBack: 'card back', playmat: 'playmat', coin: 'coin' }[input.kind]}` });
      if (!(await cosmeticsOf(ctx.user.id))(def.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: `You don't have ${def.name} yet` });
    }
    await prisma.user.update({ where: { id: ctx.user.id }, data: { [input.kind]: input.id } });
    return { ok: true };
  }),
});
