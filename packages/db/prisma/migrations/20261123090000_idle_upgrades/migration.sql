-- The Idle Adventure's upgrade tree (issue #270): the account's currency, its upgrades (each one's tiers bought) and
-- Send some to Mom's money waiting for the next run.
ALTER TABLE "User" ADD COLUMN "idleMiles" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "idleUpgrades" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "idleMom" INTEGER NOT NULL DEFAULT 0;
