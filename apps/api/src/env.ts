function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL').replace(/\/$/, '');
  },
  /** Only set for projects still using the legacy HS256 secret (e.g. local Supabase). */
  get jwtSecret() {
    return process.env.SUPABASE_JWT_SECRET || undefined;
  },
  /** Running as the production deployment: Vercel's production environment, or NODE_ENV=production. */
  get isProduction() {
    return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  },
  /**
   * Debug tools (testing cheats, see routers/debug.ts). Always off in production, whatever else is set;
   * elsewhere on unless ENABLE_DEBUG=false.
   */
  get debugEnabled() {
    return !this.isProduction && process.env.ENABLE_DEBUG !== 'false';
  },
};
