-- Battle Points: the Battle Tower's currency, won with its wins and spent in its BP Shop.
ALTER TABLE "User" ADD COLUMN "bp" INTEGER NOT NULL DEFAULT 0;
