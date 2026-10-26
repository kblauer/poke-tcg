import { flairFor, type FlairSlot } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { buyFlairInput, equipFlairInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { catalogIndex, holoEnergyStyle, isBasicEnergyCard, isGalaxyFoil, isHolo, isReverseHolo, type CardData } from '../cards.js';
import { unlocksAll } from '../debugFlags.js';
import { lockUser } from '../runs.js';
import { protectedProcedure, router } from '../trpc.js';

/** What a slot's flair is called in messages. */
const NOUN: Record<FlairSlot, string> = { pattern: 'pattern', border: 'border', 'effect-play': 'effect', 'effect-attack': 'effect', 'effect-evolve': 'effect', 'effect-ko': 'effect' };

/** The catalog card for `cardId` and what it can be given in `slot` (flairFor), or BAD_REQUEST for an unknown card. */
async function flairCard(cardId: string, slot: FlairSlot) {
  const card = (await catalogIndex()).get(cardId);
  if (!card) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown card' });
  const flags = {
    holo: isHolo(card),
    galaxy: isGalaxyFoil(card),
    holoEnergy: holoEnergyStyle(card),
    reverseHolo: isReverseHolo(card),
    basicEnergy: isBasicEnergyCard(card),
    kind: card.kind,
    stage: card.stage,
    type: card.types[0] ?? null,
    dexNumber: (card.data as CardData).dexId?.[0] ?? null,
  };
  return { card, options: flairFor(flags, slot) };
}

export const flairRouter = router({
  /**
   * The flair the account has bought (`owned`) and what each card shows (`equipped`; a card with none shows its own
   * look); `allOwned` with the debug switch to unlock everything (unlocksAll, never in production), when every flair is had.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [owned, equipped, allOwned] = await Promise.all([
      prisma.flairUnlock.findMany({ where: { userId: ctx.user.id }, select: { cardId: true, slot: true, key: true } }),
      prisma.cardFlair.findMany({ where: { userId: ctx.user.id }, select: { cardId: true, slot: true, key: true } }),
      unlocksAll(ctx.user.id),
    ]);
    return { owned, equipped, allOwned };
  }),

  /**
   * Buys a flair for one card with Stardust (its price: a holo pattern's, a border's or an effect's at one moment), and shows it on the card.
   * Only a card the account has unlocked that can have it (flairFor), and not one it already has for that card.
   */
  buy: protectedProcedure.input(buyFlairInput).mutation(async ({ ctx, input }) => {
    const { card, options } = await flairCard(input.cardId, input.slot);
    const flair = options.find((o) => o.key === input.key);
    const noun = NOUN[input.slot];
    if (!flair) throw new TRPCError({ code: 'BAD_REQUEST', message: `${card.name} can't be given that ${noun}` });
    const { price } = flair;
    const where = { userId: ctx.user.id, cardId: card.id, slot: input.slot };
    return prisma.$transaction(async (tx) => {
      // Checked with the user row locked, so buying twice at once can't take the Stardust twice.
      await lockUser(tx, ctx.user.id);
      const unlocked = await tx.cardUnlock.findUnique({ where: { userId_cardId: { userId: ctx.user.id, cardId: card.id } }, select: { cardId: true } });
      // With the debug switch to unlock everything, every card is (unlockedIds).
      if (!unlocked && !(await unlocksAll(ctx.user.id, tx))) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unlock ${card.name} first` });
      const had = await tx.flairUnlock.findUnique({ where: { userId_cardId_slot_key: { ...where, key: flair.key } }, select: { key: true } });
      if (had) throw new TRPCError({ code: 'BAD_REQUEST', message: `${card.name} already has the ${flair.label} ${noun}` });
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, stardust: { gte: price } }, data: { stardust: { decrement: price } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `The ${flair.label} ${noun} takes ${price} Stardust` });
      await tx.flairUnlock.create({ data: { ...where, key: flair.key } });
      await tx.cardFlair.upsert({ where: { userId_cardId_slot: where }, create: { ...where, key: flair.key }, update: { key: flair.key } });
      const { stardust } = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { stardust: true } });
      return { stardust };
    });
  }),

  /** Switches the flair a card shows, for nothing: to one the account bought for it (any it can have, with the debug switch to unlock everything), or (`key` null) back to the card's own look. */
  equip: protectedProcedure.input(equipFlairInput).mutation(async ({ ctx, input }) => {
    const { card, options } = await flairCard(input.cardId, input.slot);
    const where = { userId: ctx.user.id, cardId: card.id, slot: input.slot };
    if (input.key === null) {
      await prisma.cardFlair.deleteMany({ where });
      return { ok: true };
    }
    // With the debug switch to unlock everything, every flair the card can have is had (list's allOwned).
    const had = (await unlocksAll(ctx.user.id)) ? options.some((o) => o.key === input.key) : await prisma.flairUnlock.findUnique({ where: { userId_cardId_slot_key: { ...where, key: input.key } }, select: { key: true } });
    if (!had) throw new TRPCError({ code: 'BAD_REQUEST', message: `Buy that ${NOUN[input.slot]} for ${card.name} first` });
    await prisma.cardFlair.upsert({ where: { userId_cardId_slot: where }, create: { ...where, key: input.key }, update: { key: input.key } });
    return { ok: true };
  }),
});
