import { randomInt } from 'node:crypto';
import { berriesOf, buyCoinsError, COIN_OFFERS, drawSlotSpin, farmOf, gameCornerDay, gameCornerOf, keepGameCorner, leaveSlotSpin, MAX_COINS, rollRouletteBall, seededRandom16, settleSlotSpin, sitAtRoulette, sitAtSlots, slotMachineId, SLOT_MACHINES, farmView, GROW_MS, harvest, harvestAll, makePoffin, makePokeblock, afterRoundSummary, boardView, flipCard, leaveRound, levelsGained, newBoard, newVoltorbFlipState, opponentBerries, poffinLevel, pokeblockLevel, random, rngFrom, settleRound, voltorbFlipStateOf, withGameCorner, type BerryFarm } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { blendBerryInput, buyCoinsInput, cookPoffinInput, harvestBerryInput, rouletteBallInput, rouletteSitInput, slotSitInput, slotSpinInput, slotStopsInput, voltorbFlipInput, voltorbRoundInput, voltorbSettleInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { lockUser } from '../runs.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** How many of the account's Pokéblocks the Berry Blender lists, newest first; and of its Poffins, the Poffin cooking (the game's Poffin Case holds 100). */
const POKEBLOCKS_SHOWN = 50;
const POFFINS_SHOWN = 100;
/** The Game Corner's draws (a spin's seed, the lucky game, a ball's Random()): the system's, so no draw follows from the seeds handed out before it. */
const cornerSeed = () => randomInt(2 ** 31);

const farmData = (farm: BerryFarm, berries: Record<string, number>, now: number) => ({ now, growMs: GROW_MS, trees: farmView(farm, now), berries });

/**
 * The Extras page's minigames: the Berry Farm (`farm`, `harvest`: a tree of every berry growing in real time,
 * campaign's berry-farm.ts) and the Berry Blender (`blender`, `blend`: the game is played in the browser, the API makes
 * the Pokéblock from the berry and the top speed, campaign's berry-blender.ts) and Poffin cooking (`poffins`, `cook`: the
 * same, the Poffin made from the berry and how the cooking went, campaign's poffin-cooking.ts) and the Game Corner
 * (`gameCorner`, `buyCoins`; `slotSit`, `slotSpin`, `slotStops`, `rouletteSit`, `rouletteBall`: the API draws each spin
 * and ball, the browser plays it back, and the API pays what it plays itself, campaign's game-corner-rounds.ts; the
 * sittings in User.voltorbFlip's JSON beside Voltorb Flip's session) and Voltorb Flip (`voltorbRound`, `voltorbFlip`, `voltorbSettle`: the API makes each board,
 * keeps its cards and shows them one flip at a time, and settles each round, campaign's voltorb-flip.ts). The account's farm, berries, blender record, coins and Voltorb
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
   * A slot machine sat at: a new sitting (its luck today, the lucky game drawn here) in place of any before it, whose spin
   * left without its stops is played and paid first (leaveSlotSpin). Returns the machine's luck and lucky game, for the
   * screen to start the same machine.
   */
  slotSit: protectedProcedure.input(slotSitInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const corner = gameCornerOf(user.voltorbFlip);
      const coins = corner.slots ? leaveSlotSpin(corner.slots, user.coins).coins : user.coins;
      const slots = sitAtSlots(input.machine, gameCornerDay(Date.now()), (cornerSeed() & 1) === 1);
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins, voltorbFlip: asJson(withGameCorner(user.voltorbFlip, { ...corner, slots })) } });
      return { coins, machineId: slots.record.machineId, luckyGame: slots.record.luckyGame };
    }),
  ),

  /**
   * A spin's bet put in (drawSlotSpin): the coins taken and the spin's seed drawn, for the screen to play the spin with
   * (its bias and Reel Time come from it; where the reels stop is the player's). A spin before it left without its stops
   * is played and paid first. BAD_REQUEST with no machine sat at or without the coins.
   */
  slotSpin: protectedProcedure.input(slotSpinInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const corner = gameCornerOf(user.voltorbFlip);
      if (!corner.slots) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No slot machine is being played' });
      const left = leaveSlotSpin(corner.slots, user.coins);
      const drawn = drawSlotSpin(left.sitting, input.bet, left.coins, cornerSeed());
      if ('error' in drawn) throw new TRPCError({ code: 'BAD_REQUEST', message: drawn.error });
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins: drawn.coins, voltorbFlip: asJson(withGameCorner(user.voltorbFlip, { ...corner, slots: drawn.sitting })) } });
      return { coins: drawn.coins, seed: drawn.sitting.spin!.seed };
    }),
  ),

  /**
   * The spin under way, its reels stopped at `stops` (settleSlotSpin): played again here and paid, the coins kept to 9999.
   * A Replay's free spin is drawn with it (`next`, its seed). BAD_REQUEST with no spin under way or stops the reels never
   * reach.
   */
  slotStops: protectedProcedure.input(slotStopsInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const corner = gameCornerOf(user.voltorbFlip);
      if (!corner.slots) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No slot machine is being played' });
      const settled = settleSlotSpin(corner.slots, input.stops, user.coins, cornerSeed());
      if ('error' in settled) throw new TRPCError({ code: 'BAD_REQUEST', message: settled.error });
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins: settled.coins, voltorbFlip: asJson(withGameCorner(user.voltorbFlip, { ...corner, slots: settled.sitting })) } });
      return { coins: settled.coins, payout: settled.payout, next: settled.next };
    }),
  ),

  /** A roulette table sat at, at the player's hour (the game reads the clock then): a new board. A slot spin left without its stops is played and paid first. */
  rouletteSit: protectedProcedure.input(rouletteSitInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const corner = gameCornerOf(user.voltorbFlip);
      const left = corner.slots ? leaveSlotSpin(corner.slots, user.coins) : { sitting: null, coins: user.coins };
      const next = { slots: left.sitting, roulette: sitAtRoulette(input.table, input.hours) };
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins: left.coins, voltorbFlip: asJson(withGameCorner(user.voltorbFlip, next)) } });
      return { coins: left.coins };
    }),
  ),

  /**
   * A ball bet on `selection`, the wheel at `wheelAngle` as the spin starts (rollRouletteBall): the bet taken, the ball
   * played here and paid, the coins kept to 9999. `draws` are the Random() values its roll takes, for the screen to roll
   * it the same: the ball is decided and paid before they're sent. BAD_REQUEST with no table sat at, without the coins
   * or on a selection already hit.
   */
  rouletteBall: protectedProcedure.input(rouletteBallInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const corner = gameCornerOf(user.voltorbFlip);
      if (!corner.roulette) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No roulette table is being played' });
      const rolled = rollRouletteBall(corner.roulette, input.selection, input.wheelAngle, user.coins, seededRandom16(cornerSeed()));
      if ('error' in rolled) throw new TRPCError({ code: 'BAD_REQUEST', message: rolled.error });
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins: rolled.coins, voltorbFlip: asJson(withGameCorner(user.voltorbFlip, { ...corner, roulette: rolled.sitting })) } });
      return { coins: rolled.coins, payout: rolled.payout, draws: rolled.draws };
    }),
  ),

  /**
   * Voltorb Flip's next board (VoltorbFlipTaskEngine_NewRound_Begin): its level from the session's last rounds (a new
   * session, from Lv. 1, when the game is entered: `restart`), saved with the session, and how many levels it moved.
   * The browser gets only its level and the numbers beside it (boardView), never its cards. A round left with cards
   * flipped is ended first as it stands, its coins paid (leaveRound); a board in play with none flipped is given again.
   * None while the Coin Case is full (`full`), as the game won't play.
   */
  voltorbRound: protectedProcedure.input(voltorbRoundInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const left = leaveRound(voltorbFlipStateOf(user.voltorbFlip));
      const coins = Math.min(MAX_COINS, user.coins + left.payout);
      const saved = input.restart ? newVoltorbFlipState() : left.state;
      const rng = rngFrom(newSeed());
      const state = saved.board || coins >= MAX_COINS ? saved : { ...saved, board: newBoard(saved, () => Math.floor(random(rng) * 2 ** 32)) };
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins, voltorbFlip: asJson(keepGameCorner(user.voltorbFlip, state)) } });
      if (coins >= MAX_COINS || !state.board) return { full: true as const, coins };
      return { full: false as const, coins, board: boardView(state.board), levelsGained: levelsGained(state) };
    }),
  ),

  /**
   * A card of the board in play flipped (flipCard): the card, kept with the session's flips, whether it won the round,
   * and the whole board once the flip has ended the round (a Voltorb, or the last 2 or 3), for the reveal. BAD_REQUEST
   * if there's no board, the card is flipped already or the round is over.
   */
  voltorbFlip: protectedProcedure.input(voltorbFlipInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { voltorbFlip: true } });
      const flipped = flipCard(voltorbFlipStateOf(user.voltorbFlip), input.card);
      if ('error' in flipped) throw new TRPCError({ code: 'BAD_REQUEST', message: flipped.error });
      await tx.user.update({ where: { id: ctx.user.id }, data: { voltorbFlip: asJson(keepGameCorner(user.voltorbFlip, flipped.state)) } });
      return { card: flipped.card, won: flipped.over === 'won', cards: flipped.cards };
    }),
  ),

  /**
   * A Voltorb Flip round over: the flips the API kept checked against the board (settleRound; BAD_REQUEST if there's no
   * board or they didn't end that way), its coins added to the Coin Case (kept to 9999) and the round kept in the
   * session. The board's cards are given, now the round is over, for the reveal.
   */
  voltorbSettle: protectedProcedure.input(voltorbSettleInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { coins: true, voltorbFlip: true } });
      const state = voltorbFlipStateOf(user.voltorbFlip);
      if (!state.board) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No round is being played' });
      const settled = settleRound(state.board, state.flips, input.outcome);
      if ('error' in settled) throw new TRPCError({ code: 'BAD_REQUEST', message: settled.error });
      const coins = Math.min(MAX_COINS, user.coins + settled.payout);
      await tx.user.update({ where: { id: ctx.user.id }, data: { coins, voltorbFlip: asJson(keepGameCorner(user.voltorbFlip, afterRoundSummary(state, settled.summary))) } });
      return { coins, payout: settled.payout, cards: state.board.cards };
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
