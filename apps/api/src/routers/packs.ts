import { openPack, PACK_PRICE, PACK_SETS, rngFrom, type PackSet } from '@poke-tcg/campaign';
import { prisma, type Card } from '@poke-tcg/db';
import { openPackInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { ensureUser } from '../auth.js';
import { isBasicEnergyCard, isGalaxyFoil, isHolo } from '../cards.js';
import { cardRarity } from '../pool.js';
import { protectedProcedure, router } from '../trpc.js';
import { unlockCards, unlockedIds } from '../unlocks.js';

/**
 * What the pack screen shows of a card: its image, and what the card viewer's tilt and holo effect select on
 * (kind, stage, type, printed rarity, holo or galaxy foil).
 */
type ShownCard = { name: string; imageUrl: string | null; kind: string; stage: string | null; type: string | null; rarity: string | null; holo: boolean; galaxy: boolean };

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
});

const loaded = new Map<string, Promise<{ set: PackSet; cards: Map<string, ShownCard> }>>();

/** A set's cards grouped for packs (basic Energy left out; packs add one from any type), and what each looks like. Loaded once per set. */
function packSet(setId: string) {
  let entry = loaded.get(setId);
  if (!entry) {
    entry = (async () => {
      const rows = await prisma.card.findMany({ where: { setId } });
      const energy = await prisma.card.findMany({ where: { setId: 'base1', kind: 'ENERGY' } });
      const set: PackSet = { common: [], uncommon: [], rare: [], holo: [] };
      const cards = new Map<string, ShownCard>();
      for (const row of [...rows, ...energy]) cards.set(row.id, shown(row));
      for (const row of rows) if (!isBasicEnergyCard(row)) set[cardRarity(row)].push(row.id);
      return { set, cards };
    })();
    entry.catch(() => loaded.delete(setId));
    loaded.set(setId, entry);
  }
  return entry;
}

export const packsRouter = router({
  /** The sets with packs (name, logo, release date, size), the price, and the ₱ in the user's bank. */
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.user);
    const [user, sets] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true } }),
      prisma.cardSet.findMany({ where: { id: { in: PACK_SETS } }, orderBy: { releaseDate: 'asc' } }),
    ]);
    return {
      bank: user.bank,
      price: PACK_PRICE,
      sets: sets.map((s) => ({ id: s.id, name: s.name, logoUrl: s.logoUrl && `${s.logoUrl}.png`, releaseDate: s.releaseDate, cardCount: s.cardCount })),
    };
  }),

  /**
   * Buys and opens a pack of the set with ₱ from the bank: its 11 cards in the order they're revealed,
   * each unlocked (`isNew` if it wasn't before), and the bank left.
   */
  open: protectedProcedure.input(openPackInput).mutation(async ({ ctx, input }) => {
    const { set, cards } = await packSet(input.setId);
    const pack = openPack(set, rngFrom(Math.floor(Math.random() * 2 ** 31)));
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id: ctx.user.id, bank: { gte: PACK_PRICE } }, data: { bank: { decrement: PACK_PRICE } } });
      if (!count) throw new TRPCError({ code: 'BAD_REQUEST', message: `A pack costs ₱${PACK_PRICE}: not enough in the bank` });
      const before = await unlockedIds(ctx.user.id, tx);
      await unlockCards(ctx.user.id, pack.map((c) => c.cardId), tx);
      const { bank } = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true } });
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
  }),
});
