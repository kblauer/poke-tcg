import { TRPCError } from '@trpc/server';
import { prisma } from '@poke-tcg/db';
import { accountNameInput, communityDeckIdInput, deckPublishInput } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { encodeDeck, plainCards } from '../deck-codes.js';
import { protectedProcedure, router } from '../trpc.js';
import { holoTwins } from '../unlocks.js';
import { importDeck, loadOwnDeck, problemsOf } from './decks.js';

/** The most community decks listed, the latest first. */
const LISTED = 200;

/**
 * The Community Decks tab: decks players have published for everyone to see and import. A published deck is a
 * snapshot (agreed with the user): its cards when it was published, holos as their non-holo versions (deck-codes.ts),
 * shown with its author's account name (`User.accountName`, chosen for this; never their Google name or email). Only decks
 * that follow the rules can be published, once the account has a name.
 */
export const communityRouter = router({
  /** The latest community decks, with their cards, author, whether they're the user's own and their share code. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const decks = await prisma.communityDeck.findMany({
      orderBy: { createdAt: 'desc' },
      take: LISTED,
      include: { author: { select: { accountName: true } }, cards: { select: { cardId: true, quantity: true } } },
    });
    return decks.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      author: d.author.accountName ?? 'A trainer',
      mine: d.authorId === ctx.user.id,
      createdAt: d.createdAt,
      cards: d.cards,
      cardCount: d.cards.reduce((n, c) => n + c.quantity, 0),
      code: encodeDeck({ name: d.name, cards: d.cards }),
    }));
  }),

  /** The account's name on Community Decks, or null if it hasn't chosen one. */
  accountName: protectedProcedure.query(async ({ ctx }) => (await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { accountName: true } }))?.accountName ?? null),

  /** Sets the account's name on Community Decks (any name: others may have it too). Its published decks show it at once. */
  setAccountName: protectedProcedure.input(accountNameInput).mutation(async ({ ctx, input }) => {
    await ensureUser(ctx.user);
    await prisma.user.update({ where: { id: ctx.user.id }, data: { accountName: input.name } });
    return { name: input.name };
  }),

  /** Publishes a snapshot of one of the user's decks, which must follow the rules (its locked cards don't matter). */
  publish: protectedProcedure.input(deckPublishInput).mutation(async ({ ctx, input }) => {
    const [deck, twins] = await Promise.all([loadOwnDeck(input.deckId, ctx.user.id), holoTwins()]);
    const [problem] = problemsOf(deck.cards);
    if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: `Only a finished deck can be published: ${problem}` });
    const user = await ensureUser(ctx.user);
    if (!user.accountName) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an account name to publish decks under' });
    const published = await prisma.communityDeck.create({
      data: { authorId: ctx.user.id, name: deck.name, description: input.description, cards: { create: plainCards(deck.cards, twins) } },
    });
    return { id: published.id };
  }),

  /** Takes one of the user's published decks off the tab (NOT_FOUND for anyone else's). */
  unpublish: protectedProcedure.input(communityDeckIdInput).mutation(async ({ ctx, input }) => {
    const { count } = await prisma.communityDeck.deleteMany({ where: { id: input.communityDeckId, authorId: ctx.user.id } });
    if (!count) throw new TRPCError({ code: 'NOT_FOUND', message: 'Community deck not found' });
    return { ok: true };
  }),

  /** Saves a community deck as a new deck of the user's (importDeck), even if they haven't unlocked all its cards. */
  import: protectedProcedure.input(communityDeckIdInput).mutation(async ({ ctx, input }) => {
    const deck = await prisma.communityDeck.findUnique({ where: { id: input.communityDeckId }, include: { cards: { select: { cardId: true, quantity: true } } } });
    if (!deck) throw new TRPCError({ code: 'NOT_FOUND', message: 'Community deck not found' });
    return importDeck(ctx.user, { name: deck.name, cards: deck.cards });
  }),
});
