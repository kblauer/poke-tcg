-- A deck now holds no more copies of a special holo (one with a non-holo version of the same card in its set) than
-- were gained (apps/api/src/unlocks.ts: lockedProblem). So saved decks stay playable, the copies of a special holo
-- beyond the number gained become its non-holo version (agreed with the user), e.g. 3 holo Pinsir with 1 gained:
-- 1 holo and 2 non-holo. Pairs: (special holo, non-holo version), from holoTwins.
WITH pairs("holo", "plain") AS (VALUES
('base2-1', 'base2-17'),
('base2-2', 'base2-18'),
('base2-3', 'base2-19'),
('base2-4', 'base2-20'),
('base2-5', 'base2-21'),
('base2-6', 'base2-22'),
('base2-7', 'base2-23'),
('base2-8', 'base2-24'),
('base2-9', 'base2-25'),
('base2-10', 'base2-26'),
('base2-11', 'base2-27'),
('base2-12', 'base2-28'),
('base2-13', 'base2-29'),
('base2-14', 'base2-30'),
('base2-15', 'base2-31'),
('base2-16', 'base2-32'),
('base3-1', 'base3-16'),
('base3-2', 'base3-17'),
('base3-3', 'base3-18'),
('base3-4', 'base3-19'),
('base3-5', 'base3-20'),
('base3-6', 'base3-21'),
('base3-7', 'base3-22'),
('base3-8', 'base3-23'),
('base3-9', 'base3-24'),
('base3-10', 'base3-25'),
('base3-11', 'base3-26'),
('base3-12', 'base3-27'),
('base3-13', 'base3-28'),
('base3-14', 'base3-29'),
('base3-15', 'base3-30'),
('base5-1', 'base5-18'),
('base5-2', 'base5-19'),
('base5-3', 'base5-20'),
('base5-4', 'base5-21'),
('base5-5', 'base5-22'),
('base5-6', 'base5-23'),
('base5-7', 'base5-24'),
('base5-8', 'base5-25'),
('base5-9', 'base5-26'),
('base5-10', 'base5-27'),
('base5-11', 'base5-28'),
('base5-12', 'base5-29'),
('base5-13', 'base5-30'),
('base5-14', 'base5-31'),
('base5-15', 'base5-71'),
('base5-16', 'base5-72'),
('base5-17', 'base5-80'),
('basep-9', 'basep-8'),
('ecard1-1', 'ecard1-33'),
('ecard1-2', 'ecard1-34'),
('ecard1-3', 'ecard1-35'),
('ecard1-4', 'ecard1-37'),
('ecard1-5', 'ecard1-38'),
('ecard1-6', 'ecard1-40'),
('ecard1-7', 'ecard1-41'),
('ecard1-8', 'ecard1-42'),
('ecard1-9', 'ecard1-43'),
('ecard1-10', 'ecard1-44'),
('ecard1-11', 'ecard1-45'),
('ecard1-12', 'ecard1-47'),
('ecard1-13', 'ecard1-48'),
('ecard1-14', 'ecard1-49'),
('ecard1-15', 'ecard1-50'),
('ecard1-16', 'ecard1-51'),
('ecard1-17', 'ecard1-52'),
('ecard1-18', 'ecard1-54'),
('ecard1-19', 'ecard1-55'),
('ecard1-20', 'ecard1-56'),
('ecard1-21', 'ecard1-57'),
('ecard1-22', 'ecard1-58'),
('ecard1-23', 'ecard1-59'),
('ecard1-24', 'ecard1-60'),
('ecard1-25', 'ecard1-61'),
('ecard1-26', 'ecard1-62'),
('ecard1-27', 'ecard1-63'),
('ecard1-28', 'ecard1-65'),
('ecard1-29', 'ecard1-66'),
('ecard1-30', 'ecard1-68'),
('ecard1-31', 'ecard1-69'),
('ecard1-32', 'ecard1-70'),
('gym1-15', 'gym1-98'),
('gym1-16', 'gym1-100'),
('gym1-17', 'gym1-101'),
('gym1-18', 'gym1-102'),
('gym2-17', 'gym2-100'),
('gym2-18', 'gym2-104'),
('gym2-19', 'gym2-106'),
('gym2-20', 'gym2-110'),
('neo2-2', 'neo2-21'),
('neo2-3', 'neo2-22'),
('neo2-4', 'neo2-23'),
('neo2-5', 'neo2-24'),
('neo2-6', 'neo2-25'),
('neo2-7', 'neo2-26'),
('neo2-8', 'neo2-27'),
('neo2-9', 'neo2-28'),
('neo2-10', 'neo2-29'),
('neo2-11', 'neo2-30'),
('neo2-12', 'neo2-31'),
('neo2-14', 'neo2-33'),
('neo2-15', 'neo2-34'),
('neo2-16', 'neo2-35'),
('neo2-17', 'neo2-36')
),
over AS (
  SELECT dc."deckId", dc."cardId" AS "holo", p."plain", COALESCE(u."quantity", 0) AS "keep", dc."quantity" - COALESCE(u."quantity", 0) AS "extra"
  FROM "DeckCard" dc
  JOIN "Deck" d ON d."id" = dc."deckId"
  JOIN pairs p ON p."holo" = dc."cardId"
  LEFT JOIN "CardUnlock" u ON u."userId" = d."ownerId" AND u."cardId" = dc."cardId"
  WHERE dc."quantity" > COALESCE(u."quantity", 0)
),
added AS (
  INSERT INTO "DeckCard" ("deckId", "cardId", "quantity")
  SELECT "deckId", "plain", "extra" FROM over
  ON CONFLICT ("deckId", "cardId") DO UPDATE SET "quantity" = "DeckCard"."quantity" + EXCLUDED."quantity"
  RETURNING 1
),
kept AS (
  UPDATE "DeckCard" dc SET "quantity" = o."keep"
  FROM over o
  WHERE dc."deckId" = o."deckId" AND dc."cardId" = o."holo" AND o."keep" > 0
  RETURNING 1
)
DELETE FROM "DeckCard" dc
USING over o
WHERE dc."deckId" = o."deckId" AND dc."cardId" = o."holo" AND o."keep" = 0;
