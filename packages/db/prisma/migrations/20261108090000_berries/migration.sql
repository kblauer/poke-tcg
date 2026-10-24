-- The Extras page: the Berry Farm's trees and the account's berries, the Berry Blender's record and its Pokéblocks.
ALTER TABLE "User" ADD COLUMN "berryFarm" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "berries" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "blenderRecord" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Pokeblock" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "color" TEXT NOT NULL,
    "flavors" INTEGER[],
    "feel" INTEGER NOT NULL,
    "berries" TEXT[],
    "maxRpm" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pokeblock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pokeblock_userId_idx" ON "Pokeblock"("userId");

ALTER TABLE "Pokeblock" ADD CONSTRAINT "Pokeblock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
