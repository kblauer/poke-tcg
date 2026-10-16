import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // Debug tools (testing cheats): in the dev server unless VITE_ENABLE_DEBUG=false, in a build only
  // with VITE_ENABLE_DEBUG=true. A build-time constant, so a production build drops the code entirely.
  const flag = loadEnv(mode, '../..', 'VITE_').VITE_ENABLE_DEBUG;
  const debugBuild = flag === 'true' || (command === 'serve' && flag !== 'false');
  return {
    plugins: [react(), tailwindcss()],
    // Single .env at the repo root, shared with the API.
    envDir: '../..',
    define: { __DEBUG_BUILD__: JSON.stringify(debugBuild) },
    server: {
      port: 5173,
      // In dev the API runs separately (apps/api); on Vercel both share one domain.
      proxy: { '/api': 'http://localhost:8787' },
    },
  };
});
