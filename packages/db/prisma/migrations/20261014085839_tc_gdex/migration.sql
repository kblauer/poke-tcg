/*
  Warnings:

  - Added the required column `localId` to the `Card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `setId` to the `Card` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "evolveFrom" TEXT,
ADD COLUMN     "hp" INTEGER,
ADD COLUMN     "localId" TEXT NOT NULL,
ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "setId" TEXT NOT NULL,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "types" TEXT[];

-- CreateTable
CREATE TABLE "CardSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "releaseDate" DATE,
    "cardCount" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "symbolUrl" TEXT,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_setId_idx" ON "Card"("setId");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card"("name");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
