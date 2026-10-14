import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from '@poke-tcg/db';
import { env } from './env.js';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

interface SupabaseClaims extends JWTPayload {
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** Verifies a Supabase access token (Bearer header). Returns null if missing/invalid. */
export async function verifyToken(authorization: string | undefined): Promise<AuthUser | null> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  try {
    const options = { issuer: `${env.supabaseUrl}/auth/v1`, audience: 'authenticated' };
    const secret = env.jwtSecret;
    const { payload } = secret
      ? await jwtVerify<SupabaseClaims>(token, new TextEncoder().encode(secret), options)
      : await jwtVerify<SupabaseClaims>(
          token,
          (jwks ??= createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))),
          options,
        );
    if (!payload.sub || !payload.email) return null;
    const meta = payload.user_metadata ?? {};
    return { id: payload.sub, email: payload.email, name: meta.full_name ?? meta.name, avatarUrl: meta.avatar_url };
  } catch {
    return null;
  }
}

/** Creates/refreshes the app profile row for an authenticated user. */
export function ensureUser(user: AuthUser) {
  const profile = { email: user.email, displayName: user.name ?? null, avatarUrl: user.avatarUrl ?? null };
  return prisma.user.upsert({ where: { id: user.id }, create: { id: user.id, ...profile }, update: profile });
}
