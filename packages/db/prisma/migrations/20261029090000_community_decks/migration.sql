-- Decks published to the Community Decks tab: snapshots of a deck's cards when it was published.
CREATE TABLE "CommunityDeck" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityDeck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityDeckCard" (
    "communityDeckId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CommunityDeckCard_pkey" PRIMARY KEY ("communityDeckId","cardId")
);

CREATE INDEX "CommunityDeck_createdAt_idx" ON "CommunityDeck"("createdAt");

ALTER TABLE "CommunityDeck" ADD CONSTRAINT "CommunityDeck_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityDeckCard" ADD CONSTRAINT "CommunityDeckCard_communityDeckId_fkey" FOREIGN KEY ("communityDeckId") REFERENCES "CommunityDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityDeckCard" ADD CONSTRAINT "CommunityDeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
