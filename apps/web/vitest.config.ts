import { defineConfig } from 'vitest/config';

// The web app's unit tests: the pure utils (src/utils/*.test.ts), in Node, with the debug build constant vite.config.ts
// would define (utils/debug.ts reads it as a module loads).
export default defineConfig({
  define: { __DEBUG_BUILD__: 'false' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
