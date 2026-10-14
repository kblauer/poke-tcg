import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file-if-exists=../../.env prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; the pooled DATABASE_URL is used at runtime.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
