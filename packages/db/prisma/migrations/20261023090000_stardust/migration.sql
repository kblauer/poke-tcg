-- Stardust: the account's crafting currency (earned from pack pulls, spent crafting cards).
ALTER TABLE "User" ADD COLUMN "stardust" INTEGER NOT NULL DEFAULT 0;
