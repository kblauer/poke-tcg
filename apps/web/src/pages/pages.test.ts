import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A scan of the pages' and components' source for the two ways a query's error has unmounted or blanked a screen
// (#99, #204): a page shows an error only when there's nothing else to show (`if (error && !data)`).
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ name: relative(SRC, path).replace(/\\/g, '/'), lines: readFileSync(path, 'utf8').split(/\r?\n/) }));

/** `if (x.error) return <…` or `if (error) return <…`: a screen replaced by a query's error whatever it holds. */
export const ERROR_ONLY = /\bif \(\s*(?:[\w.]+\.)?error\s*\) return\s*[<(]/;
/** `if (!x.data) return null`: nothing drawn until `x` loads. */
export const BLANK = /\bif \(\s*!([\w.]+)\.data\s*\) return null\b/;

describe('query errors in the pages and components', () => {
  it('finds the source', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.name === 'pages/Packs.tsx')).toBe(true);
  });

  it('knows the patterns it looks for', () => {
    expect(ERROR_ONLY.test('  if (packs.error) return <p>{packs.error.message}</p>;')).toBe(true);
    expect(ERROR_ONLY.test('  if (error) return <p>{error}</p>;')).toBe(true);
    expect(ERROR_ONLY.test('  if (packs.error && !packs.data) return <p>{packs.error.message}</p>;')).toBe(false);
    expect(BLANK.exec('  if (!shop.data) return null;')?.[1]).toBe('shop');
    expect(BLANK.test('  if (!shop.data) return <p>Loading…</p>;')).toBe(false);
  });

  it('never replace a screen with a refetch error while it has data to show (`error && !data`)', () => {
    const hits = files.flatMap((f) => f.lines.flatMap((line, i) => (ERROR_ONLY.test(line) ? [`${f.name}:${i + 1}: ${line.trim()}`] : [])));
    expect(hits).toEqual([]);
  });

  it('never stay blank for good when a query fails (`if (!x.data) return null` needs an `x.error && !x.data` branch)', () => {
    const hits = files.flatMap((f) =>
      f.lines.flatMap((line, i) => {
        const query = BLANK.exec(line)?.[1];
        return query && !f.lines.some((l) => l.includes(`${query}.error && !${query}.data`)) ? [`${f.name}:${i + 1}: ${line.trim()}`] : [];
      }),
    );
    expect(hits).toEqual([]);
  });
});
