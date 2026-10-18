-- Holo cards now count their copies (CardUnlock.quantity; apps/api/src/unlocks.ts: countsCopies). Packs never recorded
-- how many of a card were pulled, so this backfill (agreed with the user) keeps 1 copy for every holo already unlocked,
-- or the number gained in runs when that's more (each run's state lists every card gained, duplicates included).
-- Holo means flagged holo in the card's data, or galaxy foil (isGalaxyFoil: the reverse-only printings). Holo Energy
-- already counted its copies, so it's left out.
UPDATE "CardUnlock" u
SET "quantity" = GREATEST(u."quantity", g."copies")
FROM (
  SELECT r."ownerId" AS "userId", gained."cardId", count(*)::int AS "copies"
  FROM "Run" r
  CROSS JOIN LATERAL jsonb_array_elements_text(r."state"->'gained') AS gained("cardId")
  GROUP BY r."ownerId", gained."cardId"
) g
JOIN "Card" c ON c."id" = g."cardId"
WHERE u."userId" = g."userId"
  AND u."cardId" = g."cardId"
  AND c."data"->'holoEnergy' IS NULL
  AND ((c."data"->'variants'->>'holo') = 'true' OR c."id" IN ('basep-34', 'basep-35', 'si1-1', 'si1-4', 'si1-7', 'si1-11', 'si1-14', 'si1-17'));
