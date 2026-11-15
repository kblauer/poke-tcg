// The engine's generated effect data is what its generators would write today (#204): ex-template-data.ts (the attacks
// played by a shared wording) and bw-reprints.ts (the Black & White series' word-for-word reprints) are rebuilt in memory
// from the snapshot, as scripts/generate-ex-templates.ts and generate-bw-reprints.ts do (game-engine/scripts/generated.ts),
// and compared with the committed files line by line. A changed template, a changed snapshot or an edit by hand that
// wasn't followed by the generator fails here. Beside effects.test.ts, as the engine's own tests can't read the snapshot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bwReprintsFile, exTemplateFile, type Row } from '../../game-engine/scripts/generated.js';

const rows: Row[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;
/** A committed file's lines (a Windows checkout has them ending CRLF). */
const committed = (file: string) => readFileSync(new URL(`../../game-engine/src/effects/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\n');

/** The first lines that differ, as "line n: committed | generated" (a whole-file diff of 3,000 lines says less). */
function stale(file: string, generated: string): string[] {
  const [have, want] = [committed(file), generated.split('\n')];
  const differing: string[] = [];
  for (let i = 0; i < Math.max(have.length, want.length) && differing.length < 5; i++) {
    if (have[i] !== want[i]) differing.push(`line ${i + 1}: ${have[i] ?? '(none)'} | ${want[i] ?? '(none)'}`);
  }
  return differing;
}

describe('generated effect data', () => {
  it('ex-template-data.ts is what generate-ex-templates.ts writes (re-run it after changing a template or the snapshot)', () => {
    const { text, matched } = exTemplateFile(rows);
    expect(matched).toBeGreaterThan(2000);
    expect(stale('ex-template-data.ts', text)).toEqual([]);
  });

  it('bw-reprints.ts is what generate-bw-reprints.ts writes (re-run it after changing the snapshot)', () => {
    const { text, count } = bwReprintsFile(rows);
    expect(count).toBeGreaterThan(100);
    expect(stale('bw-reprints.ts', text)).toEqual([]);
  });
});
