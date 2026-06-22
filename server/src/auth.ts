import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthenticatedUser } from '@math-war/game-engine';

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

export function createSupabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!payload.sub) throw new Error('The access token has no subject.');
    const metadata = payload['user_metadata'] as Record<string, unknown> | undefined;
    const displayName =
      metadata?.['full_name'] ?? metadata?.['name'] ?? payload['email'] ?? 'Player';
    return { id: payload.sub, displayName: String(displayName).slice(0, 80) };
  };
}
