-- The automatic run deck: a deck that copies a run's deck (kept up to date by the API), saved or taken over by the next run.
ALTER TABLE "Deck" ADD COLUMN "runId" UUID;

CREATE UNIQUE INDEX "Deck_runId_key" ON "Deck"("runId");

ALTER TABLE "Deck" ADD CONSTRAINT "Deck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
