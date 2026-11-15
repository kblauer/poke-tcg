// The hosted-database guard (scripts/local-guard.mjs), as pure functions: nothing here reads .env or connects.
import { describe, expect, it } from 'vitest';
import { assertLocalDatabase, hostOf, isLocalUrl } from '../../../scripts/local-guard.mjs';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const HOSTED = 'postgresql://postgres.abc:secret-pw@aws-0-eu.pooler.supabase.com:6543/postgres';

describe('isLocalUrl', () => {
  it('accepts the local Supabase and rejects anything else', () => {
    expect(isLocalUrl(LOCAL)).toBe(true);
    expect(isLocalUrl('postgresql://u:p@localhost:5432/db')).toBe(true);
    expect(isLocalUrl(HOSTED)).toBe(false);
    expect(isLocalUrl('postgresql://u:p@localhost.example.com:5432/db')).toBe(false);
    expect(isLocalUrl('postgresql://u:p@db.example.com:5432/127.0.0.1')).toBe(false);
    expect(isLocalUrl('')).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});

describe('assertLocalDatabase', () => {
  it('passes for local URLs and for none', () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }, [])).not.toThrow();
    expect(() => assertLocalDatabase({}, [])).not.toThrow();
  });
  it('refuses a hosted URL (either one) without an opt-in, never naming its password', () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: HOSTED, DIRECT_URL: LOCAL }, [])).toThrow(/DATABASE_URL/);
    expect(() => assertLocalDatabase({ DATABASE_URL: LOCAL, DIRECT_URL: HOSTED }, [])).toThrow(/DIRECT_URL/);
    expect(() => assertLocalDatabase({ DATABASE_URL: HOSTED }, [])).toThrow(/pnpm db:local/);
    try {
      assertLocalDatabase({ DATABASE_URL: HOSTED }, []);
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-pw');
      expect((error as Error).message).toContain(hostOf(HOSTED));
    }
  });
  it('lets --remote or ALLOW_HOSTED_DB=1 through', () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: HOSTED }, ['node', 'seed.ts', '--remote'])).not.toThrow();
    expect(() => assertLocalDatabase({ DATABASE_URL: HOSTED, ALLOW_HOSTED_DB: '1' }, [])).not.toThrow();
    expect(() => assertLocalDatabase({ DATABASE_URL: HOSTED, ALLOW_HOSTED_DB: 'yes' }, [])).toThrow();
  });
});
