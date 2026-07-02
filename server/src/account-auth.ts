import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { hash, verify } from 'argon2';
import { AuthenticatedUser } from '@math-war/game-engine';
import { normalizeDisplayName } from './auth.js';

export const ACCOUNT_ACCESS_TOKEN_ISSUER = 'math-war';
export const ACCOUNT_ACCESS_TOKEN_AUDIENCE = 'math-war-account';
export const ACCOUNT_REFRESH_COOKIE = 'math-war-refresh-token';

const ACCESS_TOKEN_DURATION_SECONDS = 15 * 60;
const REFRESH_TOKEN_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const MAX_AVATAR_BYTES = 256 * 1024;

export interface AccountPublicUser extends AuthenticatedUser {
  readonly username: string;
  readonly avatarUrl: string | null;
}

export interface AccountSession {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly user: AccountPublicUser;
}

export interface RefreshToken {
  readonly token: string;
  readonly hash: string;
  readonly expiresAt: Date;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string {
  const username = normalizeUsername(value);
  if (
    username.length < MIN_USERNAME_LENGTH ||
    username.length > MAX_USERNAME_LENGTH ||
    !/^[a-z0-9_-]+$/.test(username)
  ) {
    throw new Error(
      'Username must be 3 to 20 lowercase letters, numbers, underscores, or hyphens.',
    );
  }
  return username;
}

export function validatePassword(value: string): string {
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password is too long.');
  }
  return value;
}

export function validateAccountDisplayName(value: string): string {
  const displayName = normalizeDisplayName(value);
  if (!displayName) throw new Error('Display name is required.');
  return displayName;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(validatePassword(password));
}

export function verifyPasswordHash(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password);
}

export function createRefreshToken(secret: string): RefreshToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(token, secret),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DURATION_MS),
  };
}

export function hashRefreshToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

export async function issueAccountAccessToken(
  secret: string,
  user: AuthenticatedUser,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_DURATION_SECONDS * 1000);
  const token = await new SignJWT({ name: user.displayName, typ: 'account' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ACCOUNT_ACCESS_TOKEN_ISSUER)
    .setAudience(ACCOUNT_ACCESS_TOKEN_AUDIENCE)
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}

export function createAccountTokenVerifier(secret: string) {
  const key = new TextEncoder().encode(secret);
  return async (token: string): Promise<AuthenticatedUser> => {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: ACCOUNT_ACCESS_TOKEN_ISSUER,
      audience: ACCOUNT_ACCESS_TOKEN_AUDIENCE,
    });
    if (!payload.sub) throw new Error('The account access token has no subject.');
    const displayName = normalizeDisplayName(String(payload['name'] ?? 'Player'));
    return { id: payload.sub, displayName: displayName || 'Player' };
  };
}

export function parseAvatarDataUrl(value: string): { mimeType: string; bytes: Buffer } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('Avatar must be a PNG, JPEG, or WebP data URL.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) {
    throw new Error('Avatar must be between 1 byte and 256 KB.');
  }
  return { mimeType: match[1], bytes };
}

export function assertProductionAccountSecrets(
  accessSecret: string,
  refreshSecret: string,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'production') return;
  for (const [name, value] of [
    ['ACCOUNT_ACCESS_TOKEN_SECRET', accessSecret],
    ['ACCOUNT_REFRESH_TOKEN_SECRET', refreshSecret],
  ] as const) {
    if (value.length < 32 || /^(.)\1+$/.test(value) || value.startsWith('replace-with-')) {
      throw new Error(`${name} must be a high-entropy value of at least 32 characters.`);
    }
  }
}
