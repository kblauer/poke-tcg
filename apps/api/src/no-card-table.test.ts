// CLAUDE.md: never read the Card table in the API; card lookups go through catalog.ts (the Vercel build bundles it, and a
// join or a findMany on the table is the hosted database's egress pattern). This fails on a Prisma read of it anywhere else.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const sources = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? sources(join(dir, f)) : f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('.tmp.') ? [join(dir, f)] : []));

// File → why it may read the Card table. catalog.ts is the one reader (catalogFromDb, catalogFingerprint).
const ALLOWED: Record<string, string> = { 'catalog.ts': 'the catalog loader itself' };

describe('Card table reads', () => {
  it('only catalog.ts reads the Card table or joins it', () => {
    const offenders = sources(here)
      .map((f) => f.slice(here.length + 1).replaceAll('\\', '/'))
      .filter((f) => !(f in ALLOWED))
      .filter((f) => {
        const text = readFileSync(join(here, f), 'utf8');
        return /\b(prisma|db|tx)\.card\./.test(text) || /\bcard:\s*\{/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
