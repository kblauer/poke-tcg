-- The account's deck played most recently, the next run's deck to start with (not a foreign key: a deleted deck's id is ignored).
ALTER TABLE "User" ADD COLUMN "lastDeckId" UUID;
