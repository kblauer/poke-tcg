-- Mats (the user's, 2026-11-06): the table under the cards, a cosmetic of its own beside the playmats (the click overlays).
ALTER TABLE "User" ADD COLUMN "mat" TEXT;
ALTER TABLE "Deck" ADD COLUMN "mat" TEXT;
