import { openPack, PACK_PRICE, PACK_SETS, rngFrom, type PackSet } from '@poke-tcg/campaign';
import { prisma, type Card } from '@poke-tcg/db';
import { openPackInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { ensureUser } from '../auth.js';
import { holoEnergyStyle, isBasicEnergyCard, isGalaxyFoil, isHolo, type HoloEnergyStyle } from '../cards.js';
import { cardRarity } from '../pool.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';
import { unlockCards, unlockedIds } from '../unlocks.js';

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
});

/**
 * The basic Energy a set's packs give, and its holo versions: the set's own basic Energy, or the closest earlier
 * set's by release date (Jungle, Fossil and the promos get Base Set's; Team Rocket gets Base Set 2's).
 */
async function packEnergy(setId: string): Promise<{ energy: Card[]; holoEnergy: Card[] }> {
  const [target, rows] = await Promise.all([
    prisma.cardSet.findUniqueOrThrow({ where: { id: setId }, select: { releaseDate: true } }),
    prisma.card.findMany({ where: { kind: 'ENERGY' }, include: { set: { select: { releaseDate: true } } } }),
  ]);
  const basic = rows.filter((r) => isBasicEnergyCard(r) && !holoEnergyStyle(r));
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
      for (const row of rows) if (!isBasicEnergyCard(row)) set[cardRarity(row)].push(row.id);
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
 * each unlocked (`isNew` if it wasn't before; a holo Energy adds a copy), and the bank left.
 * `forceHoloEnergy`: every pack's Energy is a holo Energy (the debug cheat, `debugOpen`).
 */
async function openPacks(userId: string, input: { setId: string; count: number }, forceHoloEnergy = false) {
  const { set, cards } = await packSet(input.setId);
  const rng = rngFrom(Math.floor(Math.random() * 2 ** 31));
  // Every pack's cards in reveal order, pack after pack, each tagged with its pack (from 0).
  const opened = Array.from({ length: input.count }, (_, pack) => openPack(set, rng, { forceHoloEnergy }).map((c) => ({ ...c, pack })));
  const pack = opened.flat();
  const price = PACK_PRICE * input.count;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, bank: { gte: price } }, data: { bank: { decrement: price } } });
    if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `${input.count === 1 ? 'A pack costs' : `${input.count} packs cost`} ₱${price}: not enough in the bank` });
    const before = await unlockedIds(userId, tx);
    // Each holo pulled (holo Energy too) adds a copy; other cards are unlocked once.
    await unlockCards(userId, pack.map((c) => c.cardId), tx);
    const { bank } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bank: true } });
    const seen = new Set<string>();
    return {
      bank,
      cards: pack.map((c) => {
        // Basic Energy is always unlocked; a card is only new the first time it comes up.
        const isNew = c.slot !== 'energy' && !before.has(c.cardId) && !seen.has(c.cardId);
        seen.add(c.cardId);
        return { ...c, ...cards.get(c.cardId)!, isNew };
      }),
    };
  });
}

export const packsRouter = router({
  /**
   * The sets with packs (name, logo, release date, size, and how many of the cards a pack can hold the user has
   * unlocked: `unlockedCount` of `packCards`), the price, and the ₱ in the user's bank.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.user);
    const [user, sets, unlocked, contents] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true } }),
      prisma.cardSet.findMany({ where: { id: { in: PACK_SETS } }, orderBy: { releaseDate: 'asc' } }),
      unlockedIds(ctx.user.id),
      Promise.all(PACK_SETS.map(async (id) => [id, Object.values((await packSet(id)).set).flat()] as const)),
    ]);
    // The cards a pack of each set can hold (basic Energy left out: it's always unlocked).
    const packCards = new Map(contents);
    return {
      bank: user.bank,
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
        };
      }),
    };
  }),

  /** Buys and opens packs (openPacks). */
  open: protectedProcedure.input(openPackInput).mutation(({ ctx, input }) => openPacks(ctx.user.id, input)),

  /** Testing cheat (a debugProcedure, refused in production): opens packs like `open`, each with a holo Energy. */
  debugOpen: debugProcedure.input(openPackInput).mutation(({ ctx, input }) => openPacks(ctx.user.id, input, true)),
});
