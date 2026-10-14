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
};
