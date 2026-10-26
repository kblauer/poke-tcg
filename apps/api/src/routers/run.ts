import { bossSummary, currentGameId, EQUIP_SLOTS, isBattleKind, fitsSlot, item, ITEMS, MAX_CONSUMABLES_PER_RUN, onlyOne, RUN_TYPE_IDS, RUN_TYPES, runView, shopStock, type EquipSlot, type RunTypeId, type StarterId } from '@poke-tcg/campaign';
import { Prisma, prisma } from '@poke-tcg/db';
import { DECK_NAME_LENGTH } from '@poke-tcg/shared';
import { buyItemInput, DEFAULT_TRAINER_SPRITE, equipInput, playerGenderInput, runActInput, runChooseInput, runIdInput, saveRunDeckInput, startRunInput, trainerSpriteInput, useConsumableInput, useItemInput, type PlayerGender } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { debugWinGame } from '../games.js';
import { runPool } from '../pool.js';
import { towerUnderway } from '../towers.js';
import { runTypeProgress } from '../progress.js';
import { abandonBattle, advanceRun, ensureAccount, latestRun, loadOwnRun, lockUser, needsStarter, settleBattle, startRun, syncRunDeck, takeItem, type LoadedRun } from '../runs.js';
import { holoTwins, lockedProblem, unlockedIds } from '../unlocks.js';
import { markPlayed, playableDeck, playProblems, type DeckCosmetics } from './decks.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** The default name for saving a run's deck: the run's number among the account's runs and its type, "Run #3 – Celadon City". */
async function runDeckName(run: LoadedRun) {
  const number = await prisma.run.count({ where: { ownerId: run.ownerId, createdAt: { lte: run.createdAt } } });
  return `Run #${number} – ${RUN_TYPES[run.type as keyof typeof RUN_TYPES]?.name ?? run.type}`.slice(0, DECK_NAME_LENGTH);
}

/** The post-run shop's stock: rolled from the latest run's seed, so it's new after each run and the same until then. */
async function latestStock(userId: string) {
  const run = await prisma.run.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true, seed: true, status: true, shop: true } });
  if (Array.isArray(run?.shop)) return (run.shop as string[]).flatMap((id) => (ITEMS[id] ? [ITEMS[id]] : []));
  // One-of-a-kind items the account has aren't offered.
  const owned = new Set((await prisma.inventoryItem.findMany({ where: { userId, quantity: { gt: 0 } }, select: { itemId: true } })).map((i) => i.itemId));
  // Not the run's own seed, which rolled its map.
  const stock = shopStock(((run?.seed ?? 0) ^ 0x5eed5) >>> 0, (id) => owned.has(id));
  // Fixed once the run is over (the shop is open), so buying something doesn't change what's offered.
  if (run && run.status !== 'ACTIVE') await prisma.run.updateMany({ where: { id: run.id, shop: { equals: Prisma.DbNull } }, data: { shop: stock.map((i) => i.id) } });
  return stock;
}

/** Starts a run of `type` with one of the account's own decks, which must be playable, or (its first run) the starter deck it picked. */
async function startWithDeck(userId: string, type: RunTypeId, { deckId, starter }: { deckId?: string; starter?: StarterId }) {
  await towerUnderway(userId);
  if (starter) return startRun(userId, type, { starter });
  const deck = await playableDeck(deckId!, userId);
  if (deck.runDeck) throw new TRPCError({ code: 'BAD_REQUEST', message: "Start a run with one of your own decks (save the run's deck first)" });
  const started = await startRun(userId, type, deck);
  await Promise.all([markPlayed(userId, deckId!), runDeckCosmetics(userId, deck.cosmetics)]);
  return started;
}

/**
 * Chooses an option on the map, like `act` with CHOOSE. `deckId` switches the run to that deck first (one of the account's
 * decks that can be played; SET_DECK), whatever the option: a battle is then played with it.
 */
async function chooseOption(userId: string, input: { runId: string; expectedVersion: number; option: number; deckId?: string }) {
  const run = await loadOwnRun(input.runId, userId);
  if (run.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
  if (input.deckId === undefined) return advanceRun(run, [{ type: 'CHOOSE', option: input.option }]);
  const option = run.state.phase === 'map' ? run.state.steps[run.state.position]?.options[input.option] : undefined;
  if (!option) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No such option' });
  const deck = await playableDeck(input.deckId, userId);
  const advanced = await advanceRun(run, [{ type: 'SET_DECK', deck: deck.cards, name: deck.name }, { type: 'CHOOSE', option: input.option }]);
  if (!deck.runDeck) await Promise.all([markPlayed(userId, input.deckId), runDeckCosmetics(userId, deck.cosmetics)]);
  return advanced;
}

/** The run deck (Deck.runId) takes the cosmetics of the deck the run starts with, or switches to: its battles use them. */
const runDeckCosmetics = (userId: string, cosmetics: DeckCosmetics) => prisma.deck.updateMany({ where: { ownerId: userId, runId: { not: null } }, data: cosmetics });

/** What the client gets for a run: its view (no RNG or opponents' deck seeds) and the battle under way. */
export async function clientRun(run: LoadedRun) {
  return { id: run.id, status: run.status, version: run.version, gameId: currentGameId(run.state), view: runView(run.state, await runPool(run.state.type)) };
}

export const runRouter = router({
  /**
   * The home screen: the account (EXP, banked ₱), its latest run, decks and the run types to pick
   * from, and whether the account is still to pick its starter deck (`needsStarter`: a new account, its first run's).
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    await ensureAccount(ctx.user);
    // First, as settling a battle that beat the run adds its EXP to the account.
    const run = await latestRun(ctx.user.id);
    const [user, decks] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { exp: true, bank: true, lastDeckId: true, playerGender: true } }),
      prisma.deck.findMany({
        where: { ownerId: ctx.user.id },
        include: { cards: { include: { card: { select: { name: true, kind: true, stage: true, data: true } } } } },
        // The Collection tab's order.
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const [unlocked, limited, progress, starter] = await Promise.all([unlockedIds(ctx.user.id), holoTwins(), runTypeProgress(ctx.user.id), needsStarter(ctx.user.id)]);
    // A run started before there were automatic run decks gets one now.
    if (run?.status === 'ACTIVE' && !decks.some((d) => d.runId === run.id)) await syncRunDeck(ctx.user.id, run.id, run.state.deck);
    const runDeck = run && decks.find((d) => d.runId === run.id);
    return {
      account: { exp: user.exp, bank: user.bank },
      // A new account: its first run starts with one of the starter decks (STARTER_DECKS), picked in the run picker.
      needsStarter: starter,
      // The player's sprite on the run maps (the Inventory's choice).
      playerGender: (user.playerGender === 'female' ? 'female' : 'male') as PlayerGender,
      // The deck played most recently, the new run's deck to start with (the client falls back to the top deck when it's gone).
      lastDeckId: user.lastDeckId,
      run: run && (await clientRun(run)),
      // The latest run's automatic deck while it's not saved (its name, the default for saving it: "Run #3 – Celadon City").
      runDeck: run && (runDeck || run.status === 'ACTIVE') ? { saveName: await runDeckName(run) } : null,
      // With why each can't start a run (the deck rules, or cards not unlocked); empty when it can. Not the automatic
      // run deck: a run starts with one of the account's own decks.
      decks: decks.filter((d) => d.runId === null).map((d) => ({ id: d.id, name: d.name, favorite: d.favorite, cardCount: d.cards.reduce((n, c) => n + c.quantity, 0), cards: d.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity })), problems: playProblems(d.cards, unlocked, limited), locked: lockedProblem(d.cards, unlocked, limited) !== null })),
      // With why each can't be started yet (`locked`: badges or a Gym Challenge missing) and how often it's been beaten.
      runTypes: RUN_TYPE_IDS.map((id) => {
        const type = RUN_TYPES[id];
        return { id, name: type.name, description: type.description, bosses: bossSummary(type), generation: type.generation, ...progress[id] };
      }),
    };
  }),

  /** A move in the run (choose an encounter, buy, pick, accept, leave). Starts the battle when it leads to one. */
  act: protectedProcedure.input(runActInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    if (run.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
    return clientRun(await advanceRun(run, [input.action]));
  }),

  /** Chooses an option on the map (chooseOption). */
  choose: protectedProcedure.input(runChooseInput).mutation(async ({ ctx, input }) => clientRun(await chooseOption(ctx.user.id, input))),

  /**
   * Debug (a debugProcedure, refused in production): chooses a battle like `choose` (an Ace Trainer's accepted too), then
   * wins its game at once (the WIN debug command, saved as a DEBUG action row) and settles it as skipped: no ₱, EXP or card reward.
   */
  debugSkipBattle: debugProcedure.input(runChooseInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    const option = run.state.phase === 'map' ? run.state.steps[run.state.position]?.options[input.option] : undefined;
    if (!option || !isBattleKind(option.kind)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a battle can be skipped' });
    let chosen = await chooseOption(ctx.user.id, input);
    if (!currentGameId(chosen.state) && option.kind === 'elite') chosen = await advanceRun(chosen, [{ type: 'ACCEPT' }]);
    await debugWinGame(currentGameId(chosen.state));
    return clientRun(await settleBattle(chosen, true));
  }),

  /**
   * Uses a consumable or misc item from the inventory in the run (3 consumables per run; misc items keep their own limits).
   * An Escape Rope used during a battle concedes its game, without the run counting it as a loss.
   */
  useItem: protectedProcedure.input(useItemInput).mutation(async ({ ctx, input }) => {
    const def = ITEMS[input.itemId];
    if (!def || (def.category !== 'consumable' && def.category !== 'misc')) throw new TRPCError({ code: 'BAD_REQUEST', message: "That item can't be used" });
    const run = await loadOwnRun(input.runId, ctx.user.id);
    // The item is taken first (atomically, so two uses at once can't both spend the last one), and given back if the run
    // can't use it now; an item that isn't used up is only checked for.
    const spent = def.category === 'consumable' || !!def.consumedOnUse;
    const taken = await takeItem(ctx.user.id, def.id, spent);
    if (!taken) throw new TRPCError({ code: 'BAD_REQUEST', message: `You have no ${def.name}` });
    let next: Awaited<ReturnType<typeof advanceRun>>;
    try {
      next = await advanceRun(run, [{ type: 'USE_ITEM', itemId: def.id }]);
    } catch (error) {
      if (spent) await prisma.inventoryItem.update({ where: { userId_itemId: { userId: ctx.user.id, itemId: def.id } }, data: { quantity: { increment: 1 } } });
      throw error;
    }
    const left = currentGameId(run.state);
    if (left && currentGameId(next.state) !== left) await abandonBattle(left);
    return clientRun(next);
  }),

  /**
   * Uses a consumable from the Inventory: in the run under way (as `useItem`), or, with none, kept for the next run
   * (`User.pendingConsumables`, taken from the inventory now; startRun puts them all in effect). As they count among the
   * next run's consumables, at most MAX_CONSUMABLES_PER_RUN wait.
   */
  useConsumable: protectedProcedure.input(useConsumableInput).mutation(async ({ ctx, input }) => {
    const def = ITEMS[input.itemId];
    if (def?.category !== 'consumable') throw new TRPCError({ code: 'BAD_REQUEST', message: "That item can't be used" });
    const active = await prisma.run.findFirst({ where: { ownerId: ctx.user.id, status: 'ACTIVE' }, select: { id: true } });
    if (active) {
      const run = await loadOwnRun(active.id, ctx.user.id);
      if (!(await takeItem(ctx.user.id, def.id, true))) throw new TRPCError({ code: 'BAD_REQUEST', message: `You have no ${def.name}` });
      try {
        await advanceRun(run, [{ type: 'USE_ITEM', itemId: def.id }]);
      } catch (error) {
        await prisma.inventoryItem.update({ where: { userId_itemId: { userId: ctx.user.id, itemId: def.id } }, data: { quantity: { increment: 1 } } });
        throw error;
      }
    } else {
      // The item is taken in the same transaction as the check, which locks its row: two uses at once can't both pass.
      await prisma.$transaction(async (tx) => {
        if (!(await takeItem(ctx.user.id, def.id, true, tx))) throw new TRPCError({ code: 'BAD_REQUEST', message: `You have no ${def.name}` });
        const { pendingConsumables } = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { pendingConsumables: true } });
        if (pendingConsumables.length >= MAX_CONSUMABLES_PER_RUN) throw new TRPCError({ code: 'BAD_REQUEST', message: `${MAX_CONSUMABLES_PER_RUN} consumables are already waiting for your next run` });
        await tx.user.update({ where: { id: ctx.user.id }, data: { pendingConsumables: { push: def.id } } });
      });
    }
    return { inRun: active !== null };
  }),

  /**
   * Testing aid, on in production too for now: a lost run goes on from where it ended with full HP.
   * TODO: remove before release.
   */
  retry: protectedProcedure.input(runIdInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    return clientRun(await advanceRun(run, [{ type: 'RESTORE_HP' }]));
  }),

  /**
   * Starts a new run of a type with one of the account's decks, which must be playable (banking the earlier runs' ₱).
   * The run type must be unlocked (runTypeLock: a later generation's runs need the previous one's Gym Challenge beaten, the Gym Challenge every badge,
   * the Champion run a beaten Gym Challenge).
   */
  start: protectedProcedure.input(startRunInput).mutation(async ({ ctx, input }) => {
    const { locked } = (await runTypeProgress(ctx.user.id))[input.type];
    if (locked) throw new TRPCError({ code: 'BAD_REQUEST', message: locked });
    return startWithDeck(ctx.user.id, input.type, input);
  }),

  /** Debug (a debugProcedure, refused in production): starts a run like `start`, locked run types too. */
  debugStart: debugProcedure.input(startRunInput).mutation(async ({ ctx, input }) => startWithDeck(ctx.user.id, input.type, input)),

  /**
   * Saves the automatic run deck once its run is over: it becomes one of the account's own decks, under `name`, at the end
   * of the list. Unsaved, it's taken over by the next run instead.
   */
  saveDeck: protectedProcedure.input(saveRunDeckInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    if (run.status === 'ACTIVE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Save the deck once the run is over' });
    const deck = await prisma.deck.findUnique({ where: { runId: run.id }, select: { id: true } });
    if (!deck) throw new TRPCError({ code: 'BAD_REQUEST', message: "This run's deck is already saved" });
    const last = await prisma.deck.aggregate({ where: { ownerId: ctx.user.id }, _max: { position: true } });
    await prisma.deck.update({ where: { id: deck.id }, data: { runId: null, name: input.name, position: (last._max.position ?? -1) + 1 } });
    return { id: deck.id };
  }),

  /**
   * The post-run shop: the items in stock after the latest run (shopStock), for EXP, and how many of each the account
   * already has (`owned`, by item id). A query that writes: the first look after a run fixes its stock in `Run.shop`
   * (latestStock, only while it's unset), so every later one reads the same.
   */
  shop: protectedProcedure.query(async ({ ctx }) => {
    const [user, inventory, stock] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { exp: true } }),
      prisma.inventoryItem.findMany({ where: { userId: ctx.user.id, quantity: { gt: 0 } }, select: { itemId: true, quantity: true } }),
      latestStock(ctx.user.id),
    ]);
    return { exp: user.exp, items: stock, owned: Object.fromEntries(inventory.map((i) => [i.itemId, i.quantity])) as Record<string, number> };
  }),

  /** Buys an item with EXP. Only between runs (once the last one is over). Equipment and misc items: one at most. */
  buyItem: protectedProcedure.input(buyItemInput).mutation(async ({ ctx, input }) => {
    const def = ITEMS[input.itemId];
    if (def?.price === undefined || !(await latestStock(ctx.user.id)).some((i) => i.id === def.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not for sale' });
    const price = def.price;
    await prisma.$transaction(async (tx) => {
      // The lock makes the one-of-a-kind check hold against two buys at once.
      await lockUser(tx, ctx.user.id);
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

  /** The account's items (with their definitions), what's equipped, its trainer sprite, and how many cards are unlocked. */
  inventory: protectedProcedure.query(async ({ ctx }) => {
    const [items, equipment, unlocks, user] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { userId: ctx.user.id, quantity: { gt: 0 } } }),
      prisma.equipment.findMany({ where: { userId: ctx.user.id } }),
      prisma.cardUnlock.aggregate({ where: { userId: ctx.user.id }, _sum: { quantity: true }, _count: true }),
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { trainerSprite: true, playerGender: true, pendingConsumables: true } }),
    ]);
    return {
      trainerSprite: user.trainerSprite ?? DEFAULT_TRAINER_SPRITE,
      playerGender: (user.playerGender === 'female' ? 'female' : 'male') as PlayerGender,
      // Consumables used between runs, waiting for the next one (item ids).
      pendingConsumables: user.pendingConsumables,
      items: items.flatMap((i) => (ITEMS[i.itemId] ? [{ ...item(i.itemId), quantity: i.quantity }] : [])),
      equipment: Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, equipment.find((e) => e.slot === slot)?.itemId ?? null])) as Record<EquipSlot, string | null>,
      unlockedCards: { distinct: unlocks._count, total: unlocks._sum.quantity ?? 0 },
    };
  }),

  /** Sets the account's trainer sprite (the Inventory's trainer), one of Showdown's (TRAINER_SPRITES). */
  setTrainerSprite: protectedProcedure.input(trainerSpriteInput).mutation(async ({ ctx, input }) => {
    await prisma.user.update({ where: { id: ctx.user.id }, data: { trainerSprite: input.sprite } });
    return { ok: true };
  }),

  /** Sets the player's sprite on the run maps: the boy (Red, Ethan, Brendan) or the girl (Leaf, Lyra, May). */
  setPlayerGender: protectedProcedure.input(playerGenderInput).mutation(async ({ ctx, input }) => {
    await prisma.user.update({ where: { id: ctx.user.id }, data: { playerGender: input.gender === 'female' ? 'female' : null } });
    return { ok: true };
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
