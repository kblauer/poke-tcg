-- Base Set 2's commons are reprints of earlier commons with the same art, so an account that has unlocked
-- the original has the reprint unlocked too (apps/api/src/unlocks.ts keeps this up from now on). This gives
-- existing accounts the reprints of the commons they'd already unlocked. Basic Energy is always unlocked,
-- so it isn't listed. Pairs: (original, Base Set 2 reprint), from BASE4_REPRINTS.
INSERT INTO "CardUnlock" ("userId", "cardId", "quantity")
SELECT u."userId", r."reprint", 1
FROM "CardUnlock" u
JOIN (VALUES
('base1-43', 'base4-65'),
('base2-49', 'base4-66'),
('base1-44', 'base4-67'),
('base1-45', 'base4-68'),
('base1-46', 'base4-69'),
('base2-50', 'base4-70'),
('base1-47', 'base4-71'),
('base1-48', 'base4-72'),
('base1-49', 'base4-73'),
('base2-52', 'base4-74'),
('base1-50', 'base4-75'),
('base2-53', 'base4-76'),
('base2-54', 'base4-77'),
('base1-52', 'base4-78'),
('base1-53', 'base4-79'),
('base2-56', 'base4-80'),
('base1-54', 'base4-81'),
('base2-57', 'base4-82'),
('base1-55', 'base4-83'),
('base1-56', 'base4-84'),
('base2-59', 'base4-85'),
('base1-57', 'base4-86'),
('base1-58', 'base4-87'),
('base1-59', 'base4-88'),
('base1-61', 'base4-89'),
('base2-61', 'base4-90'),
('base1-62', 'base4-91'),
('base2-62', 'base4-92'),
('base1-63', 'base4-93'),
('base1-64', 'base4-94'),
('base1-65', 'base4-95'),
('base1-66', 'base4-96'),
('base2-63', 'base4-97'),
('base1-67', 'base4-98'),
('base1-68', 'base4-99'),
('base1-69', 'base4-100'),
('base1-91', 'base4-118'),
('base1-92', 'base4-119'),
('base1-93', 'base4-120'),
('base2-64', 'base4-121'),
('base1-94', 'base4-122'),
('base1-95', 'base4-123')
) AS r("original", "reprint") ON u."cardId" = r."original"
ON CONFLICT ("userId", "cardId") DO NOTHING;
