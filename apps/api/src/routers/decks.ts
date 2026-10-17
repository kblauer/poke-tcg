import { TRPCError } from '@trpc/server';
import { prisma, type Card } from '@poke-tcg/db';
import { DECK_SIZE, MAX_COPIES, copiesOfName, deckIdInput, deckProblems, deckSaveInput, type DeckRuleCard } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { isBasicEnergyCard } from '../cards.js';
import { protectedProcedure, router } from '../trpc.js';
import { lockedNames, lockedProblem, unlockedIds } from '../unlocks.js';

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

/** Why the deck's cards break the rules (see deckProblems). */
export const problemsOf = (cards: { quantity: number; card: Pick<Card, 'name' | 'kind' | 'stage' | 'data'> }[]) =>
  deckProblems(cards.map((c) => ({ card: ruleCard(c.card), quantity: c.quantity })));

/** Why the deck can't be played: the rules, and cards the user hasn't unlocked. Empty when it can. */
export const playProblems = (cards: { cardId: string; quantity: number; card: Pick<Card, 'name' | 'kind' | 'stage' | 'data'> }[], unlocked: Set<string>) => {
  const locked = lockedProblem(cards, unlocked);
  return [...problemsOf(cards), ...(locked ? [locked] : [])];
};

/** The user's deck, ready to battle with (one card id per card), or BAD_REQUEST with why it can't be played. */
export async function playableDeck(deckId: string, userId: string): Promise<string[]> {
  const [deck, unlocked] = await Promise.all([loadOwnDeck(deckId, userId), unlockedIds(userId)]);
  const [problem] = playProblems(deck.cards, unlocked);
  if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  return deck.cards.flatMap((c) => Array<string>(c.quantity).fill(c.cardId));
}

export const decksRouter = router({
  /** The user's decks, newest first, with whether each can be played (no problems, including locked cards). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [decks, unlocked] = await Promise.all([
      prisma.deck.findMany({
        where: { ownerId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        include: { cards: { include: { card: cardFields } } },
      }),
      unlockedIds(ctx.user.id),
    ]);
    return decks.map((d) => ({
      id: d.id,
      name: d.name,
      updatedAt: d.updatedAt,
      cardCount: d.cards.reduce((n, c) => n + c.quantity, 0),
      problems: playProblems(d.cards, unlocked),
    }));
  }),

  /** The cards the user has unlocked, for the deck builder and card list (basic Energy always is, so it isn't listed). */
  unlocked: protectedProcedure.query(async ({ ctx }) => [...(await unlockedIds(ctx.user.id))]),

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
    const [locked] = lockedNames(input.cards.map((c) => ({ cardId: c.cardId, card: rows.find((r) => r.id === c.cardId)! })), await unlockedIds(ctx.user.id));
    if (locked) throw new TRPCError({ code: 'BAD_REQUEST', message: `${locked} isn't unlocked yet` });

    if (input.deckId) await loadOwnDeck(input.deckId, ctx.user.id);
    else await ensureUser(ctx.user);
    const cards = input.cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity }));
    // Replace the card list in one transaction, so a deck is never half saved.
    return prisma.$transaction(async (tx) => {
      const deck = input.deckId
        ? await tx.deck.update({ where: { id: input.deckId }, data: { name: input.name } })
        : await tx.deck.create({ data: { ownerId: ctx.user.id, name: input.name } });
      await tx.deckCard.deleteMany({ where: { deckId: deck.id } });
      await tx.deckCard.createMany({ data: cards.map((c) => ({ ...c, deckId: deck.id })) });
      return { id: deck.id };
    });
  }),

  delete: protectedProcedure.input(deckIdInput).mutation(async ({ ctx, input }) => {
    await loadOwnDeck(input.deckId, ctx.user.id);
    await prisma.deck.delete({ where: { id: input.deckId } });
    return { ok: true };
  }),
});
