-- The Battle Tower: its challenges (each one's state and deck, kept only here), the battles that belong to one, and the
-- highest floor an account has beaten (for its checkpoints).
CREATE TYPE "TowerStatus" AS ENUM ('ACTIVE', 'LOST');

ALTER TABLE "User" ADD COLUMN "towerBest" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TowerChallenge" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "TowerStatus" NOT NULL DEFAULT 'ACTIVE',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "deckId" UUID,
    "cosmetics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TowerChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TowerChallenge_ownerId_status_idx" ON "TowerChallenge"("ownerId", "status");

ALTER TABLE "TowerChallenge" ADD CONSTRAINT "TowerChallenge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Game" ADD COLUMN "towerId" UUID;

ALTER TABLE "Game" ADD CONSTRAINT "Game_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "TowerChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
