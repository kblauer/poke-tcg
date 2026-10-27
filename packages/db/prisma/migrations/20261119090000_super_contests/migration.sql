-- The Extras page's Super Contests: the contest under way on the account, and each Idle Adventure Pokédex entry's condition
-- (fed Pokéblocks and Poffins), contest moves and ribbons.
ALTER TABLE "User" ADD COLUMN "contest" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "IdleDex" ADD COLUMN "condition" INTEGER[] DEFAULT ARRAY[0, 0, 0, 0, 0, 0]::INTEGER[],
ADD COLUMN "contestMoves" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "ribbons" TEXT[] DEFAULT ARRAY[]::TEXT[];
