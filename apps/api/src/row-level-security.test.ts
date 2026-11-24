// The tables are closed to Supabase's Data API roles (migration 20261125090000_row_level_security: the anon key is in
// the browser's bundle). That migration covers every table there was; this fails on a later migration that makes a
// table without enabling row level security on it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrations = join(import.meta.dirname, '../../../packages/db/prisma/migrations');
const ALL_TABLES = '20261125090000_row_level_security';

describe('row level security', () => {
  const names = readdirSync(migrations).filter((d) => statSync(join(migrations, d)).isDirectory()).sort();
  const sql = (name: string) => readFileSync(join(migrations, name, 'migration.sql'), 'utf8');

  it('is enabled on every table by one migration', () => {
    expect(names).toContain(ALL_TABLES);
    expect(sql(ALL_TABLES)).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('is enabled by every later migration on the tables it makes', () => {
    const missing = names
      .filter((name) => name > ALL_TABLES)
      .flatMap((name) => {
        const text = sql(name);
        return [...text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/g)].map((m) => m[1]!).filter((table) => !new RegExp(`ALTER TABLE\\s+"${table}"\\s+ENABLE ROW LEVEL SECURITY`).test(text)).map((table) => `${name}: ${table}`);
      });
    expect(missing).toEqual([]);
  });
});
