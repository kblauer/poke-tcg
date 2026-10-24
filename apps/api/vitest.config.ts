import { defineConfig } from 'vitest/config';

// The API's unit tests: its pure parts (deck codes, locked cards, a battle's result, the card definitions). The modules
// they import also import the database client, which needs a connection string to exist (not to connect: the pg adapter
// opens nothing until a query), so a placeholder stands in. Checks against the real database stay throwaway scripts
// (CLAUDE.md: `_*.tmp.ts`).
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'], env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test' } },
});
