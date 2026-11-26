-- The Idle Adventure's Champion Ribbons (the user's, 2026-11-26): the regions whose Champion a run beat with the species
-- in its party, from the runs already beaten (a beaten run's state keeps its party as it was).
ALTER TABLE "IdleDex" ADD COLUMN "champion" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "IdleDex" AS d
SET "champion" = c.gens
FROM (
  SELECT r."ownerId" AS uid, (p->>'species')::int AS species, array_agg(DISTINCT COALESCE((r.state->>'gen')::int, 1) ORDER BY COALESCE((r.state->>'gen')::int, 1)) AS gens
  FROM "IdleRun" AS r, jsonb_array_elements(r.state->'party') AS p
  WHERE r.status = 'BEATEN'
  GROUP BY 1, 2
) AS c
WHERE d."userId" = c.uid AND d.species = c.species;
