-- Decks starred on the Collection tab, offered under the run's deck choice (Favorite decks).
ALTER TABLE "Deck" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;
