-- AlterEnum
BEGIN;
CREATE TYPE "GameStatus_new" AS ENUM ('ACTIVE', 'FINISHED');
ALTER TABLE "public"."Game" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Game" ALTER COLUMN "status" TYPE "GameStatus_new" USING ("status"::text::"GameStatus_new");
ALTER TYPE "GameStatus" RENAME TO "GameStatus_old";
ALTER TYPE "GameStatus_new" RENAME TO "GameStatus";
DROP TYPE "public"."GameStatus_old";
ALTER TABLE "Game" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "GameAction" DROP CONSTRAINT "GameAction_userId_fkey";

-- DropForeignKey
ALTER TABLE "GamePlayer" DROP CONSTRAINT "GamePlayer_deckId_fkey";

-- DropForeignKey
ALTER TABLE "GamePlayer" DROP CONSTRAINT "GamePlayer_gameId_fkey";

-- DropForeignKey
ALTER TABLE "GamePlayer" DROP CONSTRAINT "GamePlayer_userId_fkey";

-- DropIndex
DROP INDEX "Game_status_idx";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "winnerId",
ADD COLUMN     "ownerId" UUID NOT NULL,
ADD COLUMN     "winner" TEXT,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
ALTER COLUMN "state" SET NOT NULL,
ALTER COLUMN "version" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GameAction" DROP COLUMN "userId",
ADD COLUMN     "playerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "GamePlayer";

-- CreateIndex
CREATE INDEX "Game_ownerId_updatedAt_idx" ON "Game"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

