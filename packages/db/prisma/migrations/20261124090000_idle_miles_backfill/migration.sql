-- The Idle Adventure's upgrade tree (issue #270): accounts that caught Pokémon before Poké Miles existed get what those
-- catches would have paid, UPGRADE_TUNING.firstCatch (5) for each species caught (recordDex pays it on a species' first
-- catch, and each caught IdleDex row is one).
UPDATE "User" AS u
SET "idleMiles" = u."idleMiles" + 5 * d.n
FROM (SELECT "userId", COUNT(*)::int AS n FROM "IdleDex" WHERE caught GROUP BY "userId") AS d
WHERE u.id = d."userId";
