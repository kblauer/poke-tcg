// Writes src/effects/bw-reprints.ts: every Black & White series card (Gen 5) that reprints an earlier one of the series, word
// for word (same name, attacks, Abilities and text), to the first print, whose effects it plays (index.ts). Run after
// changing the snapshot:
//   npx tsx scripts/generate-bw-reprints.ts
// What it writes is worked out in generated.ts (bwReprintsFile), which the campaign's generated.test.ts runs too.
import { readFileSync, writeFileSync } from 'node:fs';
import { bwReprintsFile, type Row } from './generated.js';

const rows: Row[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;
const { text, count } = bwReprintsFile(rows);
writeFileSync(new URL('../src/effects/bw-reprints.ts', import.meta.url), text);
console.log(`${count} reprints`);
