import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { AuthenticatedUser } from '@math-war/game-engine';

export const GUEST_TOKEN_ISSUER = 'math-war';
export const GUEST_TOKEN_AUDIENCE = 'math-war-multiplayer';

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;
export type TokenIssuer = (displayName: string) => Promise<GuestSession>;

export interface GuestSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: AuthenticatedUser;
}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function assertProductionSessionSecret(secret: string, nodeEnv: string | undefined): void {
  if (nodeEnv !== 'production') return;
  if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
  if (/^(.)\1+$/.test(secret) || secret === 'replace-with-a-long-random-secret') {
    throw new Error('SESSION_SECRET must be a high-entropy value in production.');
  }
}

export function createGuestTokenIssuer(secret: string): TokenIssuer {
  const signingKey = secretKey(secret);
  return async (displayName) => {
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedName) throw new Error('Display name is required.');
    const user = { id: randomUUID(), displayName: normalizedName };
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const token = await new SignJWT({ name: user.displayName })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(GUEST_TOKEN_ISSUER)
      .setAudience(GUEST_TOKEN_AUDIENCE)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(signingKey);
    return { token, expiresAt: expiresAt.toISOString(), user };
  };
}

export function createGuestTokenVerifier(secret: string): TokenVerifier {
  const signingKey = secretKey(secret);
  return async (token) => {
    const { payload } = await jwtVerify(token, signingKey, {
      algorithms: ['HS256'],
      issuer: GUEST_TOKEN_ISSUER,
      audience: GUEST_TOKEN_AUDIENCE,
    });
    if (!payload.sub) throw new Error('The access token has no subject.');
    const displayName = normalizeDisplayName(String(payload['name'] ?? 'Player'));
    return { id: payload.sub, displayName: displayName || 'Player' };
  };
}
