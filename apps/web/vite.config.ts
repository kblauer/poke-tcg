import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Single .env at the repo root, shared with the API.
  envDir: '../..',
  server: {
    port: 5173,
    // In dev the API runs separately (apps/api); on Vercel both share one domain.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
