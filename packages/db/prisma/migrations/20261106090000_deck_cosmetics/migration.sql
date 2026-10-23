-- A deck's own cosmetics (null: the account's), and the ones a game was begun with.
ALTER TABLE "Deck" ADD COLUMN "cardBack" TEXT;
ALTER TABLE "Deck" ADD COLUMN "playmat" TEXT;
ALTER TABLE "Deck" ADD COLUMN "coin" TEXT;
ALTER TABLE "Game" ADD COLUMN "cosmetics" JSONB;
