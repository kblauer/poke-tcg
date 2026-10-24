-- The Extras page's Game Corner: the account's Coin Case.
ALTER TABLE "User" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;
