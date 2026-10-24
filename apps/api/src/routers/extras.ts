import { afterRound, berriesOf, buyCoinsError, COIN_OFFERS, coinRoundError, farmOf, gameCornerDay, MAX_COINS, slotMachineId, SLOT_MACHINES, farmView, GROW_MS, harvest, harvestAll, makePoffin, makePokeblock, afterRoundSummary, levelsGained, newBoard, newVoltorbFlipState, opponentBerries, poffinLevel, pokeblockLevel, random, rngFrom, settleRound, voltorbFlipStateOf, type BerryFarm } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { blendBerryInput, buyCoinsInput, coinRoundInput, cookPoffinInput, harvestBerryInput, voltorbRoundInput, voltorbSettleInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { lockUser } from '../runs.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** How many of the account's Pokéblocks the Berry Blender lists, newest first; and of its Poffins, the Poffin cooking (the game's Poffin Case holds 100). */
const POKEBLOCKS_SHOWN = 50;
const POFFINS_SHOWN = 100;

const farmData = (farm: BerryFarm, berries: Record<string, number>, now: number) => ({ now, growMs: GROW_MS, trees: farmView(farm, now), berries });

/**
 * The Extras page's minigames: the Berry Farm (`farm`, `harvest`: a tree of every berry growing in real time,
 * campaign's berry-farm.ts) and the Berry Blender (`blender`, `blend`: the game is played in the browser, the API makes
 * the Pokéblock from the berry and the top speed, campaign's berry-blender.ts) and Poffin cooking (`poffins`, `cook`: the
 * same, the Poffin made from the berry and how the cooking went, campaign's poffin-cooking.ts) and the Game Corner
 * (`gameCorner`, `buyCoins`, `coinRound`: the roulette and slots are played in the browser, the API settles each round,
 * campaign's game-corner.ts) and Voltorb Flip (`voltorbRound`, `voltorbSettle`: the API makes each board and settles
 * each round against it, campaign's voltorb-flip.ts). The account's farm, berries, blender record, coins and Voltorb
 * Flip session are on `User`, its Pokéblocks in `Pokeblock` and its Poffins in `Poffin`.
 */
export const extrasRouter = router({
  /**
   * The farm's trees (each one's berry, plot, stage and when it's ripe), the account's berries and the server's time.
   * A query that writes, once: the first time it's opened (or a berry is added to the game) the new trees are planted
   * and saved, so their times stay put.
   */
  farm: protectedProcedure.query(async ({ ctx }) => {
    const now = Date.now();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berryFarm: true, berries: true } });
    const farm = farmOf(user.berryFarm, now);
    if (Object.keys(farm.planted).length !== Object.keys((user.berryFarm as Partial<BerryFarm>)?.planted ?? {}).length) {
      const saved = await prisma.$transaction(async (tx) => {
        await lockUser(tx, ctx.user.id);
        const fresh = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berryFarm: true } });
        const planted = farmOf(fresh.berryFarm, now);
        await tx.user.update({ where: { id: ctx.user.id }, data: { berryFarm: asJson(planted) } });
        return planted;
      });
      return farmData(saved, berriesOf(user.berries), now);
    }
    return farmData(farm, berriesOf(user.berries), now);
  }),

  /** Picks a ripe tree: its berries are added to the account's, and it's planted again. BAD_REQUEST if it isn't ripe. */
  harvest: protectedProcedure.input(harvestBerryInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berryFarm: true, berries: true } });
      let picked: ReturnType<typeof harvest>;
      try {
        picked = harvest(farmOf(user.berryFarm, now), input.berry, now, rngFrom(newSeed()));
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (e as Error).message });
      }
      const berries = berriesOf(user.berries);
      berries[input.berry] = (berries[input.berry] ?? 0) + picked.count;
      await tx.user.update({ where: { id: ctx.user.id }, data: { berryFarm: asJson(picked.farm), berries: asJson(berries) } });
      return { berry: input.berry, count: picked.count, ...farmData(picked.farm, berries, now) };
    }),
  ),

  /** Gathers every ripe tree at once (the farm's Gather all): their berries added to the account's, the trees planted again. */
  harvestAll: protectedProcedure.mutation(({ ctx }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berryFarm: true, berries: true } });
      const { farm, picked } = harvestAll(farmOf(user.berryFarm, now), now, rngFrom(newSeed()));
      const berries = berriesOf(user.berries);
      for (const [berry, count] of Object.entries(picked)) berries[berry] = (berries[berry] ?? 0) + count;
      if (Object.keys(picked).length) await tx.user.update({ where: { id: ctx.user.id }, data: { berryFarm: asJson(farm), berries: asJson(berries) } });
      return { picked, ...farmData(farm, berries, now) };
    }),
  ),

  /** The account's berries, its blender record (hundredths of an RPM) and its Pokéblocks, newest first. */
  blender: protectedProcedure.query(async ({ ctx }) => {
    const [user, pokeblocks, total] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berries: true, blenderRecord: true } }),
      prisma.pokeblock.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: POKEBLOCKS_SHOWN, select: { id: true, color: true, flavors: true, feel: true } }),
      prisma.pokeblock.count({ where: { userId: ctx.user.id } }),
    ]);
    return { berries: berriesOf(user.berries), record: user.blenderRecord, pokeblocks: pokeblocks.map((p) => ({ ...p, level: Math.max(...p.flavors) })), total };
  }),

  /**
   * A blend finished: the player's berry is used up (BAD_REQUEST if they have none), and the Pokéblock it made with the
   * people's berries at that top speed is added to the account's (and the record kept if it's beaten).
   */
  blend: protectedProcedure.input(blendBerryInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berries: true, blenderRecord: true } });
      const berries = berriesOf(user.berries);
      if (!berries[input.berry]) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You have none of that berry' });
      berries[input.berry]! -= 1;
      if (!berries[input.berry]) delete berries[input.berry];
      const block = makePokeblock([input.berry, ...opponentBerries(input.berry)], input.maxRpm, rngFrom(newSeed()));
      const record = Math.max(user.blenderRecord, input.maxRpm);
      await tx.user.update({ where: { id: ctx.user.id }, data: { berries: asJson(berries), blenderRecord: record } });
      await tx.pokeblock.create({ data: { userId: ctx.user.id, color: block.color, flavors: block.flavors, feel: block.feel, berries: [input.berry, ...opponentBerries(input.berry)], maxRpm: input.maxRpm } });
      return { pokeblock: { ...block, level: pokeblockLevel(block) }, record, newRecord: input.maxRpm > user.blenderRecord, berries };
    }),
  ),

  /** The account's berries and its Poffins (each with its level), newest first. */
  poffins: protectedProcedure.query(async ({ ctx }) => {
    const [user, poffins, total] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berries: true } }),
      prisma.poffin.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: POFFINS_SHOWN, select: { id: true, type: true, flavors: true, smoothness: true } }),
      prisma.poffin.count({ where: { userId: ctx.user.id } }),
    ]);
    return { berries: berriesOf(user.berries), poffins: poffins.map((p) => ({ ...p, level: poffinLevel(p) })), total };
  }),

  /**
   * A cooking finished: the berry is used up (BAD_REQUEST if the account has none), and the Poffin it made (from the
   * cooking's time, spills and burns: makePoffin) is added to the account's.
   */
  cook: protectedProcedure.input(cookPoffinInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berries: true } });
      const berries = berriesOf(user.berries);
      if (!berries[input.berry]) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You have none of that berry' });
      berries[input.berry]! -= 1;
      if (!berries[input.berry]) delete berries[input.berry];
      const rng = rngFrom(newSeed());
      const poffin = makePoffin([input.berry], input, () => Math.floor(random(rng) * 2 ** 32));
      await tx.user.update({ where: { id: ctx.user.id }, data: { berries: asJson(berries) } });
      await tx.poffin.create({ data: { userId: ctx.user.id, type: poffin.type, flavors: poffin.flavors, smoothness: poffin.smoothness, berries: [input.berry], frames: input.frames, spills: input.spills, burns: input.burns } });
      return { poffin: { ...poffin, level: poffinLevel(poffin) }, berries };
    }),
  ),

  /** The account's coins and banked ₱, and each slot machine's luck today (the game's machine ids, slotMachineId). */
  gameCorner: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, bank: true } });
    const day = gameCornerDay(Date.now());
    return { coins: user.coins, bank: user.bank, machines: Array.from({ length: SLOT_MACHINES }, (_, m) => slotMachineId(m, day)) };
  }),

  /** Buys one of the counter's coin offers with banked ₱. BAD_REQUEST if the Coin Case would overflow or the bank is short. */
  buyCoins: protectedProcedure.input(buyCoinsInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, bank: true } });
      const offer = COIN_OFFERS.find((o) => o.coins === input.coins)!;
      const error = buyCoinsError(user.coins, user.bank, offer);
      if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error });
      return tx.user.update({ where: { id: ctx.user.id }, data: { coins: user.coins + offer.coins, bank: user.bank - offer.price }, select: { coins: true, bank: true } });
    }),
  ),

  /**
   * A round of the roulette or a spin of the slots, over: its bet is taken and its payout added (the Coin Case kept to
   * 9999). BAD_REQUEST if the account hasn't the coins for the bet or the round can't be (coinRoundError).
   */
  coinRound: protectedProcedure.input(coinRoundInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true } });
      const error = coinRoundError(input.game, input.bet, input.payout) ?? (user.coins < input.bet ? "You don't have enough coins" : null);
      if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error });
      return tx.user.update({ where: { id: ctx.user.id }, data: { coins: afterRound(user.coins, input.bet, input.payout) }, select: { coins: true } });
    }),
  ),

  /**
   * Voltorb Flip's next board (VoltorbFlipTaskEngine_NewRound_Begin): its level from the session's last rounds (a new
   * session, from Lv. 1, when the game is entered: `restart`), saved with the session, and how many levels it moved.
   * The board in play is given again if there is one. None while the Coin Case is full (`full`), as the game won't play.
   */
  voltorbRound: protectedProcedure.input(voltorbRoundInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const saved = input.restart ? newVoltorbFlipState() : voltorbFlipStateOf(user.voltorbFlip);
      if (user.coins >= MAX_COINS) {
        if (input.restart) await tx.user.update({ where: { id: ctx.user.id }, data: { voltorbFlip: asJson(saved) } });
        return { full: true as const, coins: user.coins };
      }
      const rng = rngFrom(newSeed());
      const state = saved.board ? saved : { ...saved, board: newBoard(saved, () => Math.floor(random(rng) * 2 ** 32)) };
      if (state !== saved || input.restart) await tx.user.update({ where: { id: ctx.user.id }, data: { voltorbFlip: asJson(state) } });
      return { full: false as const, coins: user.coins, board: state.board!, levelsGained: levelsGained(state) };
    }),
  ),

  /**
   * A Voltorb Flip round over: its flips checked against the board (settleRound; BAD_REQUEST if there's no board or the
   * board couldn't have played them), its coins added to the Coin Case (kept to 9999) and the round kept in the session.
   */
  voltorbSettle: protectedProcedure.input(voltorbSettleInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const state = voltorbFlipStateOf(user.voltorbFlip);
      if (!state.board) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No round is being played' });
      const settled = settleRound(state.board, input.flips, input.outcome);
      if ('error' in settled) throw new TRPCError({ code: 'BAD_REQUEST', message: settled.error });
      const coins = Math.min(MAX_COINS, user.coins + settled.payout);
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins, voltorbFlip: asJson(afterRoundSummary(state, settled.summary)) } });
      return { coins, payout: settled.payout };
    }),
  ),

  /** Debug: fills the Coin Case (a debugProcedure: never in production). */
  fillCoins: debugProcedure.mutation(({ ctx }) => prisma.user.update({ where: { id: ctx.user.id }, data: { coins: MAX_COINS }, select: { coins: true } })),

  /** Debug: every tree on the farm ripe at once (a debugProcedure: never in production). */
  ripenAll: debugProcedure.mutation(({ ctx }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { berryFarm: true, berries: true } });
      const farm = farmOf(user.berryFarm, now);
      for (const berry of Object.keys(farm.planted)) farm.planted[berry] = Math.min(farm.planted[berry]!, now - GROW_MS);
      await tx.user.update({ where: { id: ctx.user.id }, data: { berryFarm: asJson(farm) } });
      return farmData(farm, berriesOf(user.berries), now);
    }),
  ),
});
