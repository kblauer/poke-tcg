import { actingTurn, canEnter, conditionOf, contestMove, createContest, feedPoffin, feedPokeblock, finishDance, finishVisual, PLAYER, poffinLevel, pokeblockLevel, ribbonId, type ContestState, type PokeblockColor } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { species as speciesData } from '@poke-tcg/idle';
import { contestActInput, contestDanceInput, contestFeedInput, contestMovesInput, contestProfileInput, contestStartInput, contestVisualInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { lockUser } from '../runs.js';
import { protectedProcedure, router } from '../trpc.js';

/** How many of the account's Pokéblocks and Poffins the contest page lists to feed, newest first. */
const TREATS_SHOWN = 100;

const failed = (message: string) => new TRPCError({ code: 'BAD_REQUEST', message });

/** The contest under way kept on the account (User.contest), or null ({} when none). */
const contestOf = (saved: unknown): ContestState | null => (saved && typeof saved === 'object' && 'phase' in saved ? (saved as ContestState) : null);

/** A species' moves it can perform: its level-up learnset (a dex entry has no level, so any of it), each with its contest data. */
function learnable(species: number) {
  const seen = new Set<string>();
  return speciesData(species).learnset.flatMap(([, key]) => {
    const m = contestMove(key);
    if (!m || seen.has(key)) return [];
    seen.add(key);
    return [{ key, ...m }];
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The account's caught dex entry of a species (NOT_FOUND if it hasn't caught one). */
async function caughtEntry(tx: Tx, userId: string, species: number) {
  const row = await tx.idleDex.findUnique({ where: { userId_species: { userId, species } } });
  if (!row?.caught) throw new TRPCError({ code: 'NOT_FOUND', message: "That Pokémon isn't in your Pokédex" });
  return row;
}

/** The contest's state and version checked, in a locked transaction. */
async function loadContest(tx: Tx, userId: string, expectedVersion: number) {
  await lockUser(tx, userId);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { contest: true } });
  const state = contestOf(user.contest);
  if (!state) throw failed('No contest is under way');
  if (state.version !== expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'The contest changed, refresh and retry' });
  return state;
}

const saveContest = (tx: Tx, userId: string, state: ContestState) => tx.user.update({ where: { id: userId }, data: { contest: asJson(state) } }).then(() => state);

/**
 * The Extras page's Super Contests (README: Super Contests): Platinum's contests (campaign's contest.ts) entered with an
 * Idle Adventure Pokédex entry, which is the Pokémon (the user's): the Pokéblocks and Poffins fed to it raise its
 * condition for good, and its ribbons stay with it. The server plays every round: the browser sends the outfit, the
 * dance's presses and each acting turn's move and judge, and gets the contest back (User.contest) as it goes.
 */
export const contestRouter = router({
  /** The account's caught dex entries (condition, contest moves, the moves they could learn, ribbons), its treats, and the contest under way. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [dex, pokeblocks, poffins, user] = await Promise.all([
      prisma.idleDex.findMany({ where: { userId: ctx.user.id, caught: true }, orderBy: { species: 'asc' } }),
      prisma.pokeblock.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: TREATS_SHOWN, select: { id: true, color: true, flavors: true, feel: true } }),
      prisma.poffin.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: TREATS_SHOWN, select: { id: true, type: true, flavors: true, smoothness: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { contest: true } }),
    ]);
    return {
      entries: dex.map((d) => ({ species: d.species, shiny: d.shiny, condition: conditionOf(d.condition), moves: d.contestMoves, ribbons: d.ribbons, nature: d.contestNature, item: d.contestItem, learnable: learnable(d.species) })),
      pokeblocks: pokeblocks.map((p) => ({ ...p, color: p.color as PokeblockColor, level: pokeblockLevel({ ...p, color: p.color as PokeblockColor }) })),
      poffins: poffins.map((p) => ({ ...p, level: poffinLevel(p) })),
      contest: contestOf(user.contest),
    };
  }),

  /**
   * Feeds a Pokéblock or a Poffin to a dex entry (feedPokeblock, feedPoffin, by the entry's nature): its flavours raise the
   * entry's condition and its feel or smoothness its sheen, for good; the treat is used up. BAD_REQUEST when its sheen is
   * full (it won't eat any more).
   */
  feed: protectedProcedure.input(contestFeedInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const entry = await caughtEntry(tx, ctx.user.id, input.species);
      const treat =
        input.kind === 'pokeblock'
          ? await tx.pokeblock.findFirst({ where: { id: input.id, userId: ctx.user.id }, select: { flavors: true, feel: true } }).then((p) => p && { flavors: p.flavors, sheen: p.feel })
          : await tx.poffin.findFirst({ where: { id: input.id, userId: ctx.user.id }, select: { flavors: true, smoothness: true } }).then((p) => p && { flavors: p.flavors, sheen: p.smoothness });
      if (!treat) throw new TRPCError({ code: 'NOT_FOUND', message: 'That treat is gone' });
      const condition = (input.kind === 'pokeblock' ? feedPokeblock : feedPoffin)(conditionOf(entry.condition), treat.flavors, treat.sheen, entry.contestNature);
      if (!condition) throw failed("It won't eat any more");
      await tx.idleDex.update({ where: { userId_species: { userId: ctx.user.id, species: input.species } }, data: { condition } });
      if (input.kind === 'pokeblock') await tx.pokeblock.delete({ where: { id: input.id } });
      else await tx.poffin.delete({ where: { id: input.id } });
      return { species: input.species, before: conditionOf(entry.condition), condition };
    }),
  ),

  /** Sets a dex entry's contest moves (1-4 different moves of its level-up learnset). */
  setMoves: protectedProcedure.input(contestMovesInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      await caughtEntry(tx, ctx.user.id, input.species);
      const allowed = new Set(learnable(input.species).map((m) => m.key));
      if (new Set(input.moves).size !== input.moves.length || input.moves.some((m) => !allowed.has(m))) throw failed("It can't learn those moves");
      await tx.idleDex.update({ where: { userId_species: { userId: ctx.user.id, species: input.species } }, data: { contestMoves: input.moves } });
      return { species: input.species, moves: input.moves };
    }),
  ),

  /** Sets a dex entry's nature (the flavours it likes when fed, from now on) and held item (a scarf for the Visual Competition). */
  setProfile: protectedProcedure.input(contestProfileInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      await caughtEntry(tx, ctx.user.id, input.species);
      await tx.idleDex.update({ where: { userId_species: { userId: ctx.user.id, species: input.species } }, data: { contestNature: input.nature, contestItem: input.item } });
      return input;
    }),
  ),

  /**
   * Enters a contest with a dex entry (canEnter: 2 moves, and the category's ribbons of the ranks below). One contest at
   * a time. The post-game entrants come once any of the account's Pokémon has won a Master Rank contest (Platinum's gate
   * is the game beaten with the National Pokédex: a choice, flagged in the README).
   */
  start: protectedProcedure.input(contestStartInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { contest: true, accountName: true } });
      const under = contestOf(user.contest);
      if (under && under.phase !== 'results') throw failed('A contest is already under way');
      const entry = await caughtEntry(tx, ctx.user.id, input.species);
      const moves = entry.contestMoves.filter((m) => contestMove(m));
      const error = canEnter(entry.ribbons, input.category, input.rank, moves.length);
      if (error) throw failed(error);
      const masters = await tx.idleDex.count({ where: { userId: ctx.user.id, ribbons: { hasSome: ['cool-master', 'beauty-master', 'cute-master', 'smart-master', 'tough-master'] } } });
      const state = createContest({ rank: input.rank, category: input.category, player: { species: input.species, name: speciesData(input.species).name, trainer: user.accountName ?? 'You', moves, condition: conditionOf(entry.condition), item: entry.contestItem }, postgame: masters > 0 }, newSeed());
      return saveContest(tx, ctx.user.id, state);
    }),
  ),

  /** The dressing is over: the outfit worn (outfitError), every contestant's Visual Competition score, and on to the dance. */
  visual: protectedProcedure.input(contestVisualInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      const state = await loadContest(tx, ctx.user.id, input.expectedVersion);
      const next = finishVisual(state, input.outfit);
      if ('error' in next) throw failed(next.error);
      return saveContest(tx, ctx.user.id, next);
    }),
  ),

  /** The dance is over: the player's presses danced with the CPUs' (danceAll), the scores, and on to the acting. */
  dance: protectedProcedure.input(contestDanceInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      const state = await loadContest(tx, ctx.user.id, input.expectedVersion);
      const next = finishDance(state, input.presses);
      if ('error' in next) throw failed(next.error);
      return saveContest(tx, ctx.user.id, next);
    }),
  ),

  /** An Acting Competition turn (actingTurn). After the fourth the placing is in, and a win gives the entry the rank's ribbon. */
  act: protectedProcedure.input(contestActInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      const state = await loadContest(tx, ctx.user.id, input.expectedVersion);
      const next = actingTurn(state, input.move, input.judge);
      if ('error' in next) throw failed(next.error);
      let ribbon: string | null = null;
      if (next.result?.placing[PLAYER] === 0) {
        const species = next.entrants[PLAYER]!.species;
        const entry = await caughtEntry(tx, ctx.user.id, species);
        const id = ribbonId(next.category, next.rank);
        if (!entry.ribbons.includes(id)) {
          await tx.idleDex.update({ where: { userId_species: { userId: ctx.user.id, species } }, data: { ribbons: [...entry.ribbons, id] } });
          ribbon = id;
        }
      }
      return { contest: await saveContest(tx, ctx.user.id, next), ribbon };
    }),
  ),

  /** Leaves the contest: a finished one's results are put away, one under way is given up (no ribbon). */
  leave: protectedProcedure.mutation(({ ctx }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      await tx.user.update({ where: { id: ctx.user.id }, data: { contest: {} } });
      return { ok: true };
    }),
  ),
});
