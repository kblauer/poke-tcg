import { defineConfig } from 'vitest/config';

// The campaign's tests. Some sweep hundreds of seeded runs, trades or perfect games (run.test.ts, reducers.test.ts,
// poffin-cooking.test.ts, berries.test.ts), a few seconds each on their own but past vitest's 5 s default when
// `pnpm test` runs every package's suite at once, so a test gets 30 s here (CI passes --testTimeout=60000 itself).
export default defineConfig({
  test: { environment: 'node', testTimeout: 30_000 },
});
