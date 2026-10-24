import { berriesOf, farmOf, farmView, GROW_MS, harvest, makePoffin, makePokeblock, opponentBerries, poffinLevel, pokeblockLevel, random, rngFrom, type BerryFarm } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { blendBerryInput, cookPoffinInput, harvestBerryInput } from '@poke-tcg/shared';
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
 * same, the Poffin made from the berry and how the cooking went, campaign's poffin-cooking.ts). The account's farm,
 * berries and blender record are on `User`, its Pokéblocks in `Pokeblock` and its Poffins in `Poffin`.
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
