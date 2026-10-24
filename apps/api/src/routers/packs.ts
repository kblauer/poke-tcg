import { CRAFT_COST, GENERATIONS, openPack, PACK_GENERATIONS, PACK_PRICE, PACK_SETS, rngFrom, STARDUST_PER_CARD, type PackSet } from '@poke-tcg/campaign';
import { prisma, type Card } from '@poke-tcg/db';
import { craftCardInput, debugOpenPackInput, openPackInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { ensureUser } from '../auth.js';
import { holoEnergyStyle, isBasicEnergyCard, isGalaxyFoil, isHolo, isReverseHolo, type HoloEnergyStyle } from '../cards.js';
import { cardRarity } from '../pool.js';
import { unlockedPacks } from '../progress.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';
import { lockUser } from '../runs.js';
import { holoTwins, unlockCards, unlockedIds } from '../unlocks.js';

/**
 * What the pack screen shows of a card: its image, and what the card viewer's tilt and holo effect select on
 * (kind, stage, type, printed rarity, holo or galaxy foil, a holo Energy's style).
 */
type ShownCard = {
  name: string;
  imageUrl: string | null;
  kind: string;
  stage: string | null;
  type: string | null;
  rarity: string | null;
  holo: boolean;
  galaxy: boolean;
  holoEnergy: HoloEnergyStyle | null;
  reverseHolo: boolean;
};

const shown = (row: Card): ShownCard => ({
  name: row.name,
  imageUrl: row.imageUrl,
  kind: row.kind,
  stage: row.stage,
  // Basic Energy cards have no type listed; "Fire Energy" is Fire.
  type: row.types[0] ?? (row.kind === 'ENERGY' ? row.name.replace(/ Energy$/, '') : null),
  rarity: row.rarity,
  holo: isHolo(row),
  galaxy: isGalaxyFoil(row),
  holoEnergy: holoEnergyStyle(row),
  reverseHolo: isReverseHolo(row),
});

/**
 * The basic Energy a set's packs give, and its holo versions: the set's own basic Energy, or the closest earlier
 * set's by release date (Jungle, Fossil and the promos get Base Set's; Team Rocket gets Base Set 2's), from the same
 * generation's sets (Legendary Collection, a Gen 1 set released after Neo Genesis, gets Gym Challenge's).
 */
async function packEnergy(setId: string): Promise<{ energy: Card[]; holoEnergy: Card[] }> {
  const [target, rows] = await Promise.all([
    prisma.cardSet.findUniqueOrThrow({ where: { id: setId }, select: { releaseDate: true } }),
    prisma.card.findMany({ where: { kind: 'ENERGY' }, include: { set: { select: { releaseDate: true } } } }),
  ]);
  const generation = Object.values(PACK_GENERATIONS).find((g) => g.packs.includes(setId));
  const basic = rows.filter((r) => isBasicEnergyCard(r) && !holoEnergyStyle(r) && (!generation || generation.packs.includes(r.setId)));
  const time = (r: (typeof rows)[number]) => r.set.releaseDate?.getTime() ?? 0;
  const own = basic.filter((r) => r.setId === setId);
  const earlier = basic.filter((r) => time(r) <= (target.releaseDate?.getTime() ?? 0));
  const latest = Math.max(...earlier.map(time));
  const energy = own.length ? own : earlier.filter((r) => time(r) === latest && r.setId === earlier.find((e) => time(e) === latest)!.setId);
  const ids = new Set(energy.map((r) => r.id));
  const holoEnergy = rows.filter((r) => holoEnergyStyle(r) && ids.has(r.id.replace(/-holo-[a-z-]+$/, '')));
  return { energy, holoEnergy };
}

const loaded = new Map<string, Promise<{ set: PackSet; cards: Map<string, ShownCard> }>>();

/**
 * A set's cards grouped for packs (basic Energy left out: packs add one, see packEnergy, now and then a holo
 * Energy), and what each looks like. Loaded once per set.
 */
function packSet(setId: string) {
  let entry = loaded.get(setId);
  if (!entry) {
    entry = (async () => {
      const [rows, { energy, holoEnergy }] = await Promise.all([prisma.card.findMany({ where: { setId } }), packEnergy(setId)]);
      const set: PackSet = { common: [], uncommon: [], rare: [], holo: [], energy: energy.map((r) => r.id), holoEnergy: holoEnergy.map((r) => r.id) };
      const cards = new Map<string, ShownCard>();
      for (const row of [...rows, ...energy, ...holoEnergy]) cards.set(row.id, shown(row));
      // Reverse holos (EX sets) have a slot of their own (one in place of a common).
      for (const row of rows) if (!isBasicEnergyCard(row)) (isReverseHolo(row) ? (set.reverse ??= []) : set[cardRarity(row)]).push(row.id);
      return { set, cards };
    })();
    entry.catch(() => loaded.delete(setId));
    loaded.set(setId, entry);
  }
  return entry;
}

/**
 * Buys and opens `count` packs of the set with ₱ from the bank: their cards in the order they're revealed (pack
 * after pack, each with its `pack` number),
 * each unlocked (`isNew` if it wasn't before; a holo Energy adds a copy), the bank left, and the Stardust earned
 * (STARDUST_PER_CARD, for the cards that weren't new) and now held.
 * The set's packs must be unlocked (PackUnlock), except with the debug cheats.
 * `force`: every pack's Energy is a holo Energy, or every pack is all rares (the debug cheats, `debugOpen`).
 */
async function openPacks(userId: string, input: { setId: string; count: number }, force?: { forceHoloEnergy?: boolean; forceAllRares?: boolean }) {
  if (!force && !(await unlockedPacks(userId)).has(input.setId)) throw new TRPCError({ code: 'BAD_REQUEST', message: "You haven't unlocked these packs yet" });
  const { set, cards } = await packSet(input.setId);
  const rng = rngFrom(Math.floor(Math.random() * 2 ** 31));
  // Every pack's cards in reveal order, pack after pack, each tagged with its pack (from 0).
  const opened = Array.from({ length: input.count }, (_, pack) => openPack(set, rng, force).map((c) => ({ ...c, pack })));
  const pack = opened.flat();
  const price = PACK_PRICE * input.count;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, bank: { gte: price } }, data: { bank: { decrement: price } } });
    if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `${input.count === 1 ? 'A pack costs' : `${input.count} packs cost`} ₱${price}: not enough in the bank` });
    const before = await unlockedIds(userId, tx);
    // Each holo pulled (holo Energy too) adds a copy; other cards are unlocked once.
    await unlockCards(userId, pack.map((c) => c.cardId), tx);
    const seen = new Set<string>();
    const shown = pack.map((c) => {
      // Basic Energy is always unlocked; a card is only new the first time it comes up.
      const isNew = c.slot !== 'energy' && !before.has(c.cardId) && !seen.has(c.cardId);
      seen.add(c.cardId);
      return { ...c, ...cards.get(c.cardId)!, isNew };
    });
    // Stardust only for cards already obtained (agreed with the user): a new unlock gives none, a repeat gives some by rarity.
    const stardustEarned = shown.reduce((n, c) => n + (c.isNew ? 0 : STARDUST_PER_CARD[c.slot]), 0);
    const { bank, stardust } = await tx.user.update({ where: { id: userId }, data: { stardust: { increment: stardustEarned } }, select: { bank: true, stardust: true } });
    return { bank, stardust, stardustEarned, cards: shown };
  });
}

/** What crafting the card costs in Stardust (CRAFT_COST), or null if it can't be crafted: only cards packs hold, not Energy that's basic (holo Energy only comes from pulls). */
export const craftCost = (card: Pick<Card, 'id' | 'setId' | 'rarity' | 'kind' | 'data'>): number | null =>
  PACK_SETS.includes(card.setId) && !isBasicEnergyCard(card) ? CRAFT_COST[cardRarity(card)] : null;

export const packsRouter = router({
  /**
   * The sets with packs (name, logo, release date, size, how many of the cards a pack can hold the user has unlocked:
   * `unlockedCount` of `packCards`, and whether the user can buy them: `locked`, with `next` on the one a run unlocks
   * next), the price, and the ₱ in the user's bank.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.user);
    const [user, sets, unlocked, contents, packs] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true, stardust: true } }),
      prisma.cardSet.findMany({ where: { id: { in: PACK_SETS } }, orderBy: { releaseDate: 'asc' } }),
      unlockedIds(ctx.user.id),
      Promise.all(PACK_SETS.map(async (id) => [id, (await packSet(id)).set] as const)),
      unlockedPacks(ctx.user.id),
    ]);
    // The pack each generation's runs unlock next (with its region, for the hint).
    const next = new Map(Object.values(GENERATIONS).flatMap((g) => g.packs.filter((id) => !packs.has(id)).slice(0, 1).map((id) => [id, g.region] as const)));
    // The cards a pack of each set can hold, Energy left out: basic Energy is always unlocked (and may be another
    // set's), and holo Energy and reverse holos (versions of other cards) are never counted in the number of cards collected.
    const packCards = new Map(contents.map(([id, set]) => [id, [...set.common, ...set.uncommon, ...set.rare, ...set.holo]]));
    return {
      bank: user.bank,
      stardust: user.stardust,
      price: PACK_PRICE,
      sets: sets.map((s) => {
        const cards = packCards.get(s.id) ?? [];
        return {
          id: s.id,
          name: s.name,
          logoUrl: s.logoUrl && `${s.logoUrl}.png`,
          releaseDate: s.releaseDate,
          cardCount: s.cardCount,
          unlockedCount: cards.filter((id) => unlocked.has(id)).length,
          packCards: cards.length,
          locked: !packs.has(s.id),
          next: next.get(s.id) ?? null,
          /** A generation whose runs are still to come (Gen 3's EX sets): locked until they exist. */
          upcoming: !Object.values(GENERATIONS).some((g) => g.packs.includes(s.id)),
        };
      }),
    };
  }),

  /** The sets whose packs the user has unlocked (PackUnlock): only their cards can be crafted. */
  unlockedSets: protectedProcedure.query(async ({ ctx }) => [...(await unlockedPacks(ctx.user.id))]),

  /** The Stardust the user has, for crafting. */
  stardust: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.user);
    return (await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { stardust: true } })).stardust;
  }),

  /**
   * Crafts a card with Stardust (CRAFT_COST by its rarity), unlocking it as pulling it would (unlockCards): once, or for
   * a special holo another copy and its non-holo version. Only cards packs hold (PACK_SETS; not basic or holo Energy)
   * from a set whose packs the user has unlocked, and not one already unlocked unless it counts copies.
   */
  craft: protectedProcedure.input(craftCardInput).mutation(async ({ ctx, input }) => {
    const card = await prisma.card.findUnique({ where: { id: input.cardId } });
    const cost = card && craftCost(card);
    if (!card || cost === null) throw new TRPCError({ code: 'BAD_REQUEST', message: "That card can't be crafted" });
    const [twins, packs] = await Promise.all([holoTwins(), unlockedPacks(ctx.user.id)]);
    if (!packs.has(card.setId)) throw new TRPCError({ code: 'BAD_REQUEST', message: "Unlock this set's booster packs first" });
    return prisma.$transaction(async (tx) => {
      // Checked with the user row locked, so crafting the same card twice at once can't take the Stardust twice.
      await lockUser(tx, ctx.user.id);
      const unlocked = await tx.cardUnlock.findUnique({ where: { userId_cardId: { userId: ctx.user.id, cardId: card.id } }, select: { cardId: true } });
      if (unlocked && !twins.has(card.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${card.name} is already unlocked` });
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, stardust: { gte: cost } }, data: { stardust: { decrement: cost } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `Crafting ${card.name} takes ${cost} Stardust` });
      await unlockCards(ctx.user.id, [card.id], tx);
      const { stardust } = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { stardust: true } });
      return { stardust };
    });
  }),

  /** Buys and opens packs (openPacks). */
  open: protectedProcedure.input(openPackInput).mutation(({ ctx, input }) => openPacks(ctx.user.id, input)),

  /** Testing cheats (a debugProcedure, refused in production): opens packs like `open` (locked ones too), each with a holo Energy, or all rares. */
  debugOpen: debugProcedure
    .input(debugOpenPackInput)
    .mutation(({ ctx, input }) => openPacks(ctx.user.id, input, { forceHoloEnergy: input.holoEnergy, forceAllRares: input.allRares })),
});
