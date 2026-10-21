-- Several consumables can wait for the next run (up to its 3), instead of one: the waiting one, if any, is kept.
ALTER TABLE "User" ADD COLUMN "pendingConsumables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "User" SET "pendingConsumables" = ARRAY["pendingConsumable"] WHERE "pendingConsumable" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "pendingConsumable";
