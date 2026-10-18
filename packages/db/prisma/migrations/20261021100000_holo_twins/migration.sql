-- A holo with a non-holo version of the same card in its set (Jungle's holo Clefable and its plain one) is a special
-- addition: gaining it unlocks the non-holo one too (apps/api/src/unlocks.ts: holoTwins). This gives existing accounts
-- the non-holo version of every such holo they've already unlocked. "The same card": same set, name, kind, HP,
-- attacks, powers and text. Holo-only cards (Base Set's Alakazam) have no twin and are left alone.
INSERT INTO "CardUnlock" ("userId", "cardId", "quantity")
SELECT DISTINCT u."userId", p."id", 1
FROM "CardUnlock" u
JOIN "Card" h ON h."id" = u."cardId"
JOIN "Card" p ON p."setId" = h."setId" AND p."name" = h."name" AND p."id" <> h."id" AND p."kind" = h."kind"
  AND p."hp" IS NOT DISTINCT FROM h."hp"
  AND COALESCE((SELECT jsonb_agg(a->'name') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p."data"->'attacks') = 'array' THEN p."data"->'attacks' ELSE '[]' END) a), '[]')
    = COALESCE((SELECT jsonb_agg(a->'name') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h."data"->'attacks') = 'array' THEN h."data"->'attacks' ELSE '[]' END) a), '[]')
  AND COALESCE((SELECT jsonb_agg(a->'name') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p."data"->'abilities') = 'array' THEN p."data"->'abilities' ELSE '[]' END) a), '[]')
    = COALESCE((SELECT jsonb_agg(a->'name') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h."data"->'abilities') = 'array' THEN h."data"->'abilities' ELSE '[]' END) a), '[]')
  AND (p."data"->>'effect') IS NOT DISTINCT FROM (h."data"->>'effect')
WHERE h."data"->'holoEnergy' IS NULL
  AND ((h."data"->'variants'->>'holo') = 'true' OR h."id" IN ('basep-13', 'basep-15', 'basep-34', 'basep-35'))
  AND COALESCE(p."data"->'variants'->>'holo', 'false') <> 'true'
  AND p."id" NOT IN ('basep-13', 'basep-15', 'basep-34', 'basep-35')
  AND NOT (p."kind" = 'ENERGY' AND (p."data"->>'energyType') = 'Normal')
ON CONFLICT ("userId", "cardId") DO NOTHING;
