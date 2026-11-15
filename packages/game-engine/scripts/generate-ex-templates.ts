// Writes src/effects/ex-template-data.ts: every attack of the EX sets after Ruby & Sapphire (ex2–ex16) whose TCGdex text
// matches one of the shared wordings (src/effects/ex-templates.ts). Run after changing the templates or the snapshot:
//   npx tsx scripts/generate-ex-templates.ts
// What it writes is worked out in generated.ts (exTemplateFile), which the campaign's generated.test.ts runs too.
import { readFileSync, writeFileSync } from 'node:fs';
import { exTemplateFile, type Row } from './generated.js';

const rows: Row[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;
const { text, matched, unmatched, misfits } = exTemplateFile(rows);
writeFileSync(new URL('../src/effects/ex-template-data.ts', import.meta.url), text);
console.log(`${matched} attacks matched, ${unmatched} not, ${misfits.length} matched a wording but not the printed damage:`);
console.log(misfits.join('\n'));
