-- The Extras page's Who's That Pokémon?: each game of 10 played, its times, and the daily playlist's (one a player a day).
CREATE TABLE "WhosThatGame" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "day" TEXT,
    "cards" TEXT[],
    "index" INTEGER NOT NULL DEFAULT 0,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "times" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "passed" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "finishedAt" TIMESTAMP(3),
    "fastestMs" INTEGER,
    "averageMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhosThatGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhosThatGame_userId_day_key" ON "WhosThatGame"("userId", "day");

CREATE INDEX "WhosThatGame_day_averageMs_idx" ON "WhosThatGame"("day", "averageMs");

ALTER TABLE "WhosThatGame" ADD CONSTRAINT "WhosThatGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
