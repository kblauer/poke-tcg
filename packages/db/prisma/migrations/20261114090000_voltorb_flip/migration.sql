-- The Extras page's Voltorb Flip: the account's session (its last rounds and the board in play).
ALTER TABLE "User" ADD COLUMN "voltorbFlip" JSONB NOT NULL DEFAULT '{}';
