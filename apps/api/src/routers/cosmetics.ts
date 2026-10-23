import { COSMETICS, DEFAULT_COSMETIC, hasCosmetic, type CosmeticKind } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { assignCosmeticInput, buyCosmeticInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { env } from '../env.js';
import { protectedProcedure, router } from '../trpc.js';

/**
 * What an account has of the cosmetics (hasCosmetic): the ones it bought (CosmeticUnlock), the run types it has beaten
 * (for those unlocked by beating one), and every one while debugging (never in production: env.debugEnabled).
 */
export async function cosmeticsOf(userId: string) {
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

/** The account's default of `kind` (for decks with none of it): the one picked if the account (still) has it, otherwise the built-in default. */
function defaultOf(kind: CosmeticKind, picked: string | null, has: (id: string) => boolean) {
  return picked && COSMETICS[picked]?.kind === kind && has(picked) ? picked : DEFAULT_COSMETIC[kind];
}

export const cosmeticsRouter = router({
  /**
   * Every cosmetic with whether the account has it, the decks it's assigned to (`deckIds`, in the deck list's order:
   * the account's own decks, not the run deck, which copies its starting deck's) and whether it's the default for its
   * kind (`isDefault`); the defaults (`defaults`, used by decks with none of a kind and outside battles); and the ₱ in the bank.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [has, user, decks] = await Promise.all([
      cosmeticsOf(ctx.user.id),
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true, cardBack: true, playmat: true, coin: true } }),
      prisma.deck.findMany({ where: { ownerId: ctx.user.id, runId: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, cardBack: true, playmat: true, coin: true } }),
    ]);
    const defaults = { cardBack: defaultOf('cardBack', user.cardBack, has), playmat: defaultOf('playmat', user.playmat, has), coin: defaultOf('coin', user.coin, has) };
    return {
      cosmetics: Object.values(COSMETICS).map((c) => ({ ...c, owned: has(c.id), deckIds: decks.filter((d) => d[c.kind] === c.id).map((d) => d.id), isDefault: defaults[c.kind] === c.id })),
      defaults,
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

  /**
   * Sets which of the account's decks (not the run deck) use a cosmetic it has, any number of them (agreed 2026-10-23):
   * `deckIds` take it, replacing their cosmetic of its kind, and the decks that had it and aren't listed go back to none
   * (the default). `isDefault`: it's the default for decks with none of its kind (and outside battles); unticked on the
   * default, the built-in one is again.
   */
  assign: protectedProcedure.input(assignCosmeticInput).mutation(async ({ ctx, input }) => {
    const def = COSMETICS[input.id]!;
    if (!(await cosmeticsOf(ctx.user.id))(def.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: `You don't have ${def.name} yet` });
    const decks = await prisma.deck.findMany({ where: { id: { in: input.deckIds }, ownerId: ctx.user.id, runId: null }, select: { id: true } });
    if (decks.length !== new Set(input.deckIds).size) throw new TRPCError({ code: 'BAD_REQUEST', message: "Assign it to your own decks (the run's deck takes its starting deck's)" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { cardBack: true, playmat: true, coin: true } });
    const picked = user[def.kind];
    await prisma.$transaction([
      prisma.deck.updateMany({ where: { ownerId: ctx.user.id, runId: null, [def.kind]: def.id, id: { notIn: input.deckIds } }, data: { [def.kind]: null } }),
      prisma.deck.updateMany({ where: { id: { in: input.deckIds } }, data: { [def.kind]: def.id } }),
      ...(input.isDefault ? [prisma.user.update({ where: { id: ctx.user.id }, data: { [def.kind]: def.id } })] : picked === def.id ? [prisma.user.update({ where: { id: ctx.user.id }, data: { [def.kind]: null } })] : []),
    ]);
    return { ok: true };
  }),
});
