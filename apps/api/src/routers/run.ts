import { bossSummary, currentGameId, EQUIP_SLOTS, isBattleKind, fitsSlot, item, ITEMS, onlyOne, RUN_TYPE_IDS, RUN_TYPES, runView, SHOP_ITEMS, type EquipSlot } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { buyItemInput, equipInput, runActInput, runChooseInput, runIdInput, startRunInput, useItemInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { cardPool } from '../pool.js';
import { abandonBattle, advanceRun, ensureAccount, latestRun, loadOwnRun, startRun, type LoadedRun } from '../runs.js';
import { unlockedIds } from '../unlocks.js';
import { playableDeck, playProblems } from './decks.js';
import { protectedProcedure, router } from '../trpc.js';

/** What the client gets for a run: its view (no RNG or opponents' deck seeds) and the battle under way. */
async function clientRun(run: LoadedRun) {
  return { id: run.id, status: run.status, version: run.version, gameId: currentGameId(run.state), view: runView(run.state, await cardPool()) };
}

export const runRouter = router({
  /**
   * The home screen: the account (EXP, banked ₱), its latest run, decks and the run types to pick
   * from. Sets up a new account with the starter deck and its first run.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    await ensureAccount(ctx.user);
    // First, as settling a battle that beat the run adds its EXP to the account.
    const run = await latestRun(ctx.user.id);
    const [user, decks] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { exp: true, bank: true } }),
      prisma.deck.findMany({
        where: { ownerId: ctx.user.id },
        include: { cards: { include: { card: { select: { name: true, kind: true, stage: true, data: true } } } } },
        // The Decks tab's order.
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const unlocked = await unlockedIds(ctx.user.id);
    return {
      account: user,
      run: run && (await clientRun(run)),
      // With why each can't start a run (the deck rules, or cards not unlocked); empty when it can.
      decks: decks.map((d) => ({ id: d.id, name: d.name, cardCount: d.cards.reduce((n, c) => n + c.quantity, 0), problems: playProblems(d.cards, unlocked) })),
      runTypes: RUN_TYPE_IDS.map((id) => {
        const type = RUN_TYPES[id];
        return { id, name: type.name, description: type.description, bosses: bossSummary(type) };
      }),
    };
  }),

  /** A move in the run (choose an encounter, buy, pick, accept, leave). Starts the battle when it leads to one. */
  act: protectedProcedure.input(runActInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    if (run.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
    return clientRun(await advanceRun(run, [input.action]));
  }),

  /**
   * Chooses an option on the map, like `act` with CHOOSE. For a battle, `deckId` switches the run to that deck
   * first (one of the account's decks that can be played; SET_DECK), so the battle is played with it.
   */
  choose: protectedProcedure.input(runChooseInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    if (run.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
    if (input.deckId === undefined) return clientRun(await advanceRun(run, [{ type: 'CHOOSE', option: input.option }]));
    const option = run.state.phase === 'map' ? run.state.steps[run.state.position]?.options[input.option] : undefined;
    if (!option || !isBattleKind(option.kind)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Decks can only be switched for a battle' });
    const deck = await playableDeck(input.deckId, ctx.user.id);
    return clientRun(await advanceRun(run, [{ type: 'SET_DECK', deck: deck.cards, name: deck.name }, { type: 'CHOOSE', option: input.option }]));
  }),

  /**
   * Uses a consumable or misc item from the inventory in the run (3 consumables per run; misc items keep their own limits).
   * An Escape Rope used during a battle concedes its game, without the run counting it as a loss.
   */
  useItem: protectedProcedure.input(useItemInput).mutation(async ({ ctx, input }) => {
    const def = ITEMS[input.itemId];
    if (!def || (def.category !== 'consumable' && def.category !== 'misc')) throw new TRPCError({ code: 'BAD_REQUEST', message: "That item can't be used" });
    const owned = await prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId: ctx.user.id, itemId: def.id } } });
    if (!owned || owned.quantity < 1) throw new TRPCError({ code: 'BAD_REQUEST', message: `You have no ${def.name}` });
    const run = await loadOwnRun(input.runId, ctx.user.id);
    const next = await advanceRun(run, [{ type: 'USE_ITEM', itemId: def.id }]);
    const left = currentGameId(run.state);
    if (left && currentGameId(next.state) !== left) await abandonBattle(left);
    if (def.category === 'consumable' || def.consumedOnUse) {
      await prisma.inventoryItem.updateMany({ where: { userId: ctx.user.id, itemId: def.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
    }
    return clientRun(next);
  }),

  /**
   * Testing aid, on in production too for now: a lost run goes on from where it ended with full HP.
   * TODO: remove before release.
   */
  retry: protectedProcedure.input(runIdInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    return clientRun(await advanceRun(run, [{ type: 'RESTORE_HP' }]));
  }),

  /** Starts a new run of a type with one of the account's decks, which must be playable (banking the earlier runs' ₱). */
  start: protectedProcedure.input(startRunInput).mutation(async ({ ctx, input }) => startRun(ctx.user.id, input.type, await playableDeck(input.deckId, ctx.user.id))),

  /** The post-run shop: items for EXP, and how many of each the account already has (`owned`, by item id). */
  shop: protectedProcedure.query(async ({ ctx }) => {
    const [user, inventory] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { exp: true } }),
      prisma.inventoryItem.findMany({ where: { userId: ctx.user.id, quantity: { gt: 0 } }, select: { itemId: true, quantity: true } }),
    ]);
    return { exp: user.exp, items: SHOP_ITEMS, owned: Object.fromEntries(inventory.map((i) => [i.itemId, i.quantity])) as Record<string, number> };
  }),

  /** Buys an item with EXP. Only between runs (once the last one is over). Equipment and misc items: one at most. */
  buyItem: protectedProcedure.input(buyItemInput).mutation(async ({ ctx, input }) => {
    const def = ITEMS[input.itemId];
    if (def?.price === undefined) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not for sale' });
    const price = def.price;
    await prisma.$transaction(async (tx) => {
      if (await tx.run.count({ where: { ownerId: ctx.user.id, status: 'ACTIVE' } })) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The shop opens after a run' });
      }
      if (onlyOne(def)) {
        const owned = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId: ctx.user.id, itemId: def.id } } });
        if (owned && owned.quantity > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `You already have ${def.name}` });
      }
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, exp: { gte: price } }, data: { exp: { decrement: price } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `Not enough EXP (${price} needed)` });
      await tx.inventoryItem.upsert({
        where: { userId_itemId: { userId: ctx.user.id, itemId: def.id } },
        create: { userId: ctx.user.id, itemId: def.id, quantity: 1 },
        update: { quantity: { increment: 1 } },
      });
    });
    return { ok: true };
  }),

  /** The account's items (with their definitions), what's equipped, and how many cards are unlocked. */
  inventory: protectedProcedure.query(async ({ ctx }) => {
    const [items, equipment, unlocks] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { userId: ctx.user.id, quantity: { gt: 0 } } }),
      prisma.equipment.findMany({ where: { userId: ctx.user.id } }),
      prisma.cardUnlock.aggregate({ where: { userId: ctx.user.id }, _sum: { quantity: true }, _count: true }),
    ]);
    return {
      items: items.flatMap((i) => (ITEMS[i.itemId] ? [{ ...item(i.itemId), quantity: i.quantity }] : [])),
      equipment: Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, equipment.find((e) => e.slot === slot)?.itemId ?? null])) as Record<EquipSlot, string | null>,
      unlockedCards: { distinct: unlocks._count, total: unlocks._sum.quantity ?? 0 },
    };
  }),

  /** Equips an owned piece of equipment in a slot that fits it, or empties the slot (itemId null). */
  equip: protectedProcedure.input(equipInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    if (input.itemId === null) {
      await prisma.equipment.deleteMany({ where: { userId, slot: input.slot } });
      return { ok: true };
    }
    const def = ITEMS[input.itemId];
    if (!def || !fitsSlot(def, input.slot)) throw new TRPCError({ code: 'BAD_REQUEST', message: "That doesn't go there" });
    const [owned, elsewhere] = await Promise.all([
      prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId: def.id } } }),
      prisma.equipment.count({ where: { userId, itemId: def.id, slot: { not: input.slot } } }),
    ]);
    // Two accessories of the same kind need two of them.
    if ((owned?.quantity ?? 0) <= elsewhere) throw new TRPCError({ code: 'BAD_REQUEST', message: `You have no spare ${def.name}` });
    await prisma.equipment.upsert({ where: { userId_slot: { userId, slot: input.slot } }, create: { userId, slot: input.slot, itemId: def.id }, update: { itemId: def.id } });
    return { ok: true };
  }),
});
