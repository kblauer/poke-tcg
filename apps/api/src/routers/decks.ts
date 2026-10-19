import { TRPCError } from '@trpc/server';
import { prisma, type Card } from '@poke-tcg/db';
import { DECK_NAME_LENGTH, DECK_SIZE, MAX_COPIES, copiesOfName, deckIdInput, deckOrderInput, deckProblems, deckRenameInput, deckSaveInput, favoriteCardInput, type DeckRuleCard } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { isBasicEnergyCard } from '../cards.js';
import { protectedProcedure, router } from '../trpc.js';
import { holoTwins, lockedNames, lockedProblem, unlockedIds, type Unlocked } from '../unlocks.js';

/** What the deck rules need from a catalog row. */
export const ruleCard = (card: Pick<Card, 'name' | 'kind' | 'stage' | 'data'>): DeckRuleCard => ({
  name: card.name,
  kind: card.kind,
  stage: card.stage,
  basicEnergy: isBasicEnergyCard(card),
});

const cardFields = { select: { name: true, kind: true, stage: true, data: true } } as const;

/** The user's deck with its cards, or NOT_FOUND (also for someone else's deck, so ids can't be probed). */
export async function loadOwnDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findUnique({ where: { id: deckId }, include: { cards: { include: { card: cardFields } } } });
  if (!deck || deck.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });
  return deck;
}

/** One of the user's decks that they can change: not the automatic run deck, which copies the run's deck. */
async function loadEditableDeck(deckId: string, userId: string) {
  const deck = await loadOwnDeck(deckId, userId);
  if (deck.runId) throw new TRPCError({ code: 'BAD_REQUEST', message: "The run's deck follows your run: copy it to change it, or save it when the run is over" });
  return deck;
}

/** Why the deck's cards break the rules (see deckProblems). */
export const problemsOf = (cards: { quantity: number; card: Pick<Card, 'name' | 'kind' | 'stage' | 'data'> }[]) =>
  deckProblems(cards.map((c) => ({ card: ruleCard(c.card), quantity: c.quantity })));

/**
 * Why the deck can't be played: the rules, and cards the user hasn't unlocked (or more copies of a limited holo than
 * were gained; `limited` from holoTwins). Empty when it can.
 */
export const playProblems = (
  cards: { cardId: string; quantity: number; card: Pick<Card, 'name' | 'kind' | 'stage' | 'data'> }[],
  unlocked: Unlocked,
  limited: { has: (cardId: string) => boolean },
) => {
  const locked = lockedProblem(cards, unlocked, limited);
  return [...problemsOf(cards), ...(locked ? [locked] : [])];
};

/**
 * The user's deck, ready to battle with: its name, cards (one card id per card) and whether it's the automatic run deck,
 * or BAD_REQUEST with why it can't be played.
 */
export async function playableDeck(deckId: string, userId: string): Promise<{ name: string; cards: string[]; runDeck: boolean }> {
  const [deck, unlocked, limited] = await Promise.all([loadOwnDeck(deckId, userId), unlockedIds(userId), holoTwins()]);
  const [problem] = playProblems(deck.cards, unlocked, limited);
  if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  return { name: deck.name, cards: deck.cards.flatMap((c) => Array<string>(c.quantity).fill(c.cardId)), runDeck: deck.runId !== null };
}

/** The position after the user's last deck, for a new one. */
const nextPosition = async (tx: Pick<typeof prisma, 'deck'>, userId: string) =>
  ((await tx.deck.aggregate({ where: { ownerId: userId }, _max: { position: true } }))._max.position ?? -1) + 1;

export const decksRouter = router({
  /**
   * The user's decks in their order (oldest first until they're reordered), with their cards and whether
   * each can be played (no problems, including locked cards).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [decks, unlocked, limited] = await Promise.all([
      prisma.deck.findMany({
        where: { ownerId: ctx.user.id },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { cards: { include: { card: cardFields } } },
      }),
      unlockedIds(ctx.user.id),
      holoTwins(),
    ]);
    return decks.map((d) => ({
      id: d.id,
      name: d.name,
      updatedAt: d.updatedAt,
      cardCount: d.cards.reduce((n, c) => n + c.quantity, 0),
      cards: d.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity })),
      problems: playProblems(d.cards, unlocked, limited),
      // The automatic run deck: read-only, kept up to date with the run's deck.
      runDeck: d.runId !== null,
    }));
  }),

  /**
   * The cards the user has unlocked, for the deck builder, with how many copies (only holo Energy has more than 1: a
   * deck holds no more than were pulled). Basic Energy always is, so it isn't listed.
   */
  unlocked: protectedProcedure.query(async ({ ctx }) => Object.fromEntries(await unlockedIds(ctx.user.id)) as Record<string, number>),

  /** The ids of the cards the user has marked as favorites, the latest first. */
  favorites: protectedProcedure.query(async ({ ctx }) =>
    (await prisma.favoriteCard.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, select: { cardId: true } })).map((f) => f.cardId),
  ),

  /** Adds a card to the user's favorites, or takes it out (doing nothing if it's already in or out). */
  setFavorite: protectedProcedure.input(favoriteCardInput).mutation(async ({ ctx, input }) => {
    await ensureUser(ctx.user);
    const key = { userId: ctx.user.id, cardId: input.cardId };
    if (!input.favorite) {
      await prisma.favoriteCard.deleteMany({ where: key });
      return { ok: true };
    }
    if (!(await prisma.card.findUnique({ where: { id: input.cardId }, select: { id: true } }))) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such card' });
    await prisma.favoriteCard.upsert({ where: { userId_cardId: key }, create: key, update: {} });
    return { ok: true };
  }),

  /** One of the user's decks: its name and card list. */
  get: protectedProcedure.input(deckIdInput).query(async ({ ctx, input }) => {
    const deck = await loadOwnDeck(input.deckId, ctx.user.id);
    return { id: deck.id, name: deck.name, cards: deck.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity })) };
  }),

  /**
   * Creates or replaces a deck. An unfinished deck can be saved (fewer than 60 cards, no Basic
   * Pokémon yet), but never one over 60 cards or with more than 4 cards of a name.
   */
  save: protectedProcedure.input(deckSaveInput).mutation(async ({ ctx, input }) => {
    if (new Set(input.cards.map((c) => c.cardId)).size !== input.cards.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Each card should be listed once' });
    }
    const rows = await prisma.card.findMany({ where: { id: { in: input.cards.map((c) => c.cardId) } }, select: { id: true, ...cardFields.select } });
    if (rows.length !== input.cards.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown card in the deck' });
    const entries = input.cards.map((c) => ({ card: ruleCard(rows.find((r) => r.id === c.cardId)!), quantity: c.quantity }));
    const total = entries.reduce((n, e) => n + e.quantity, 0);
    if (total > DECK_SIZE) throw new TRPCError({ code: 'BAD_REQUEST', message: `A deck can't have more than ${DECK_SIZE} cards` });
    const over = entries.find((e) => !e.card.basicEnergy && copiesOfName(entries, e.card.name) > MAX_COPIES);
    if (over) throw new TRPCError({ code: 'BAD_REQUEST', message: `At most ${MAX_COPIES} cards named ${over.card.name}` });
    const withRows = input.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity, card: rows.find((r) => r.id === c.cardId)! }));
    const owned = await unlockedIds(ctx.user.id);
    const [locked] = lockedNames(withRows, owned);
    if (locked) throw new TRPCError({ code: 'BAD_REQUEST', message: `${locked} isn't unlocked yet` });
    // More holo Energy than was pulled.
    const tooMany = lockedProblem(withRows, owned, await holoTwins());
    if (tooMany) throw new TRPCError({ code: 'BAD_REQUEST', message: tooMany });

    if (input.deckId) await loadEditableDeck(input.deckId, ctx.user.id);
    else await ensureUser(ctx.user);
    const cards = input.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity }));
    // Replace the card list in one transaction, so a deck is never half saved.
    return prisma.$transaction(async (tx) => {
      const deck = input.deckId
        ? await tx.deck.update({ where: { id: input.deckId }, data: { name: input.name } })
        : await tx.deck.create({ data: { ownerId: ctx.user.id, name: input.name, position: await nextPosition(tx, ctx.user.id) } });
      await tx.deckCard.deleteMany({ where: { deckId: deck.id } });
      await tx.deckCard.createMany({ data: cards.map((c) => ({ ...c, deckId: deck.id })) });
      return { id: deck.id };
    });
  }),

  /** Renames one of the user's decks, leaving its cards as they are. */
  rename: protectedProcedure.input(deckRenameInput).mutation(async ({ ctx, input }) => {
    await loadEditableDeck(input.deckId, ctx.user.id);
    await prisma.deck.update({ where: { id: input.deckId }, data: { name: input.name } });
    return { ok: true };
  }),

  /** Copies one of the user's decks, as "<name> (copy)" at the end of the list. */
  duplicate: protectedProcedure.input(deckIdInput).mutation(async ({ ctx, input }) => {
    const deck = await loadOwnDeck(input.deckId, ctx.user.id);
    const suffix = ' (copy)';
    const name = deck.name.slice(0, DECK_NAME_LENGTH - suffix.length).trimEnd() + suffix;
    return prisma.$transaction(async (tx) => {
      const copy = await tx.deck.create({ data: { ownerId: ctx.user.id, name, position: await nextPosition(tx, ctx.user.id) } });
      await tx.deckCard.createMany({ data: deck.cards.map((c) => ({ deckId: copy.id, cardId: c.cardId, quantity: c.quantity })) });
      return { id: copy.id };
    });
  }),

  /** Puts the user's decks in a new order. It must list every one of their decks, once. */
  reorder: protectedProcedure.input(deckOrderInput).mutation(async ({ ctx, input }) => {
    const owned = await prisma.deck.findMany({ where: { ownerId: ctx.user.id }, select: { id: true } });
    const ids = new Set(input.deckIds);
    if (ids.size !== input.deckIds.length || ids.size !== owned.length || owned.some((d) => !ids.has(d.id))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'The order should list each of your decks once' });
    }
    await prisma.$transaction(input.deckIds.map((id, position) => prisma.deck.update({ where: { id }, data: { position } })));
    return { ok: true };
  }),

  delete: protectedProcedure.input(deckIdInput).mutation(async ({ ctx, input }) => {
    await loadEditableDeck(input.deckId, ctx.user.id);
    await prisma.deck.delete({ where: { id: input.deckId } });
    return { ok: true };
  }),
});
