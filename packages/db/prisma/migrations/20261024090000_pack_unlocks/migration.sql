-- Booster packs an account can buy: a run's first battle finished without conceding unlocks its generation's next
-- pack, beating a run all of them. New accounts start with none.
CREATE TABLE "PackUnlock" (
    "userId" UUID NOT NULL,
    "setId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackUnlock_pkey" PRIMARY KEY ("userId","setId")
);

ALTER TABLE "PackUnlock" ADD CONSTRAINT "PackUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing accounts get the packs their runs so far would have unlocked (all of them are Kanto runs): every Kanto pack
-- once a run was beaten, otherwise the next one in release order for each run with a battle finished.
WITH packs("setId", n) AS (
    VALUES ('base1', 1), ('base2', 2), ('basep', 3), ('base3', 4), ('base4', 5), ('base5', 6), ('gym1', 7), ('gym2', 8)
), earned AS (
    SELECT "ownerId" AS "userId",
           CASE WHEN bool_or("status" = 'WON') THEN 8
                ELSE count(*) FILTER (WHERE COALESCE(("state"->>'battlesFought')::int, 0) > 0) END AS n
    FROM "Run"
    GROUP BY "ownerId"
)
INSERT INTO "PackUnlock" ("userId", "setId")
SELECT earned."userId", packs."setId" FROM earned JOIN packs ON packs.n <= earned.n;
