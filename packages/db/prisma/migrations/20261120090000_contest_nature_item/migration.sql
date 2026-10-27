-- The Super Contests: each Idle Adventure Pokédex entry's nature (the flavours it likes when fed) and held item (a scarf).
ALTER TABLE "IdleDex" ADD COLUMN "contestNature" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contestItem" TEXT;
