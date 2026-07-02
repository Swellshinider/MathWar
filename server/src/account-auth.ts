import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
} from 'node:crypto';
import { promisify } from 'node:util';
import { jwtVerify, SignJWT } from 'jose';
import { hash, verify } from 'argon2';
import { AuthenticatedUser } from '@math-war/game-engine';
import { normalizeDisplayName } from './auth.js';

const scrypt = promisify(scryptCallback);

export const ACCOUNT_ACCESS_TOKEN_ISSUER = 'math-war';
export const ACCOUNT_ACCESS_TOKEN_AUDIENCE = 'math-war-account';
export const ACCOUNT_REFRESH_COOKIE = 'math-war-refresh-token';

const ACCESS_TOKEN_DURATION_SECONDS = 15 * 60;
const REFRESH_TOKEN_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_CIPHER = 'aes-256-gcm';
const EMAIL_KEY_LENGTH_BYTES = 32;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;
const MAX_EMAIL_LENGTH = 320;
const MAX_AVATAR_BYTES = 256 * 1024;

export interface EncryptedEmail {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly salt: string;
}

export interface AccountPublicUser extends AuthenticatedUser {
  readonly email: string | null;
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

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required.');
  }
  return email;
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

export function emailLookupHash(email: string, secret: string): string {
  return createHmac('sha256', secret).update(normalizeEmail(email)).digest('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return hash(validatePassword(password));
}

export function verifyPasswordHash(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password);
}

export async function encryptEmail(email: string, password: string): Promise<EncryptedEmail> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = (await scrypt(password, salt, EMAIL_KEY_LENGTH_BYTES)) as Buffer;
  const cipher = createCipheriv(EMAIL_CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(validateEmail(email), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    salt: salt.toString('base64url'),
  };
}

export async function decryptEmail(encrypted: EncryptedEmail, password: string): Promise<string> {
  const salt = Buffer.from(encrypted.salt, 'base64url');
  const iv = Buffer.from(encrypted.iv, 'base64url');
  const tag = Buffer.from(encrypted.tag, 'base64url');
  const key = (await scrypt(password, salt, EMAIL_KEY_LENGTH_BYTES)) as Buffer;
  const decipher = createDecipheriv(EMAIL_CIPHER, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
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
  emailLookupSecret: string,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'production') return;
  for (const [name, value] of [
    ['ACCOUNT_ACCESS_TOKEN_SECRET', accessSecret],
    ['ACCOUNT_REFRESH_TOKEN_SECRET', refreshSecret],
    ['ACCOUNT_EMAIL_LOOKUP_SECRET', emailLookupSecret],
  ] as const) {
    if (value.length < 32 || /^(.)\1+$/.test(value) || value.startsWith('replace-with-')) {
      throw new Error(`${name} must be a high-entropy value of at least 32 characters.`);
    }
  }
}
