-- Safari Draft (README: Safari Draft): its runs, each one's state (the shop, the cards, the opponents and encounters),
-- and whether its ₱ have been banked. Its battles are played by the server from the run's seed: no Game rows.
CREATE TYPE "SafariStatus" AS ENUM ('ACTIVE', 'WON', 'LOST');

CREATE TABLE "SafariRun" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "SafariStatus" NOT NULL DEFAULT 'ACTIVE',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "banked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafariRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafariRun_ownerId_status_idx" ON "SafariRun"("ownerId", "status");

ALTER TABLE "SafariRun" ADD CONSTRAINT "SafariRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
