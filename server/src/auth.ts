import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { AuthenticatedUser } from '@math-war/game-engine';

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;
export type TokenIssuer = (displayName: string) => Promise<GuestSession>;

export interface GuestSession {
  readonly token: string;
  readonly user: AuthenticatedUser;
}

const SESSION_DURATION = '30d';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function createGuestTokenIssuer(secret: string): TokenIssuer {
  const signingKey = secretKey(secret);
  return async (displayName) => {
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedName) throw new Error('Display name is required.');
    const user = { id: randomUUID(), displayName: normalizedName };
    const token = await new SignJWT({ name: user.displayName })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(SESSION_DURATION)
      .sign(signingKey);
    return { token, user };
  };
}

export function createGuestTokenVerifier(secret: string): TokenVerifier {
  const signingKey = secretKey(secret);
  return async (token) => {
    const { payload } = await jwtVerify(token, signingKey, { algorithms: ['HS256'] });
    if (!payload.sub) throw new Error('The access token has no subject.');
    const displayName = normalizeDisplayName(String(payload['name'] ?? 'Player'));
    return { id: payload.sub, displayName: displayName || 'Player' };
  };
}
