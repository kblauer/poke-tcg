-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('ACTIVE', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "runId" UUID;

-- CreateTable
CREATE TABLE "Run" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'ACTIVE',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "banked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardUnlock" (
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardUnlock_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "userId" UUID NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "userId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("userId","slot")
);

-- CreateIndex
CREATE INDEX "Run_ownerId_createdAt_idx" ON "Run"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardUnlock" ADD CONSTRAINT "CardUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardUnlock" ADD CONSTRAINT "CardUnlock_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

