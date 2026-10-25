import { PATTERN_PRICE, patternsFor } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { buyFlairInput, equipFlairInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { catalogIndex, holoEnergyStyle, isGalaxyFoil, isHolo, isReverseHolo } from '../cards.js';
import { lockUser } from '../runs.js';
import { protectedProcedure, router } from '../trpc.js';

/** The catalog card for `cardId` and the patterns it can be given (patternsFor), or BAD_REQUEST for an unknown card. */
async function flairCard(cardId: string) {
  const card = (await catalogIndex()).get(cardId);
  if (!card) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown card' });
  return { card, patterns: patternsFor({ holo: isHolo(card), galaxy: isGalaxyFoil(card), holoEnergy: holoEnergyStyle(card), reverseHolo: isReverseHolo(card) }) };
}

export const flairRouter = router({
  /** The flair the account has bought (`owned`) and what each card shows (`equipped`; a card with none shows its own look). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [owned, equipped] = await Promise.all([
      prisma.flairUnlock.findMany({ where: { userId: ctx.user.id }, select: { cardId: true, slot: true, key: true } }),
      prisma.cardFlair.findMany({ where: { userId: ctx.user.id }, select: { cardId: true, slot: true, key: true } }),
    ]);
    return { owned, equipped };
  }),

  /**
   * Buys a holo pattern for one card with Stardust (PATTERN_PRICE), and shows it on the card. Only a card the account
   * has unlocked that can switch patterns (canSwitchPattern), and not a pattern it already has for that card.
   */
  buy: protectedProcedure.input(buyFlairInput).mutation(async ({ ctx, input }) => {
    const { card, patterns } = await flairCard(input.cardId);
    const pattern = patterns.find((p) => p.key === input.key);
    if (!pattern) throw new TRPCError({ code: 'BAD_REQUEST', message: `${card.name} can't be given that pattern` });
    const where = { userId: ctx.user.id, cardId: card.id, slot: input.slot };
    return prisma.$transaction(async (tx) => {
      // Checked with the user row locked, so buying twice at once can't take the Stardust twice.
      await lockUser(tx, ctx.user.id);
      const unlocked = await tx.cardUnlock.findUnique({ where: { userId_cardId: { userId: ctx.user.id, cardId: card.id } }, select: { cardId: true } });
      if (!unlocked) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unlock ${card.name} first` });
      const had = await tx.flairUnlock.findUnique({ where: { userId_cardId_slot_key: { ...where, key: pattern.key } }, select: { key: true } });
      if (had) throw new TRPCError({ code: 'BAD_REQUEST', message: `${card.name} already has the ${pattern.label} pattern` });
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, stardust: { gte: PATTERN_PRICE } }, data: { stardust: { decrement: PATTERN_PRICE } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `A pattern takes ${PATTERN_PRICE} Stardust` });
      await tx.flairUnlock.create({ data: { ...where, key: pattern.key } });
      await tx.cardFlair.upsert({ where: { userId_cardId_slot: where }, create: { ...where, key: pattern.key }, update: { key: pattern.key } });
      const { stardust } = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { stardust: true } });
      return { stardust };
    });
  }),

  /** Switches the flair a card shows, for nothing: to one the account bought for it, or (`key` null) back to the card's own look. */
  equip: protectedProcedure.input(equipFlairInput).mutation(async ({ ctx, input }) => {
    const { card } = await flairCard(input.cardId);
    const where = { userId: ctx.user.id, cardId: card.id, slot: input.slot };
    if (input.key === null) {
      await prisma.cardFlair.deleteMany({ where });
      return { ok: true };
    }
    const had = await prisma.flairUnlock.findUnique({ where: { userId_cardId_slot_key: { ...where, key: input.key } }, select: { key: true } });
    if (!had) throw new TRPCError({ code: 'BAD_REQUEST', message: `Buy that pattern for ${card.name} first` });
    await prisma.cardFlair.upsert({ where: { userId_cardId_slot: where }, create: { ...where, key: input.key }, update: { key: input.key } });
    return { ok: true };
  }),
});
