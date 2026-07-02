import { jwtVerify, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { hashPassword, validateUsername, verifyPasswordHash } from './account-auth.js';
import {
  assertProductionSessionSecret,
  createGuestTokenIssuer,
  createGuestTokenVerifier,
  GUEST_TOKEN_AUDIENCE,
  GUEST_TOKEN_ISSUER,
} from './auth.js';

const SECRET = 'test-secret-with-enough-characters';

function signingKey(secret = SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

describe('guest auth tokens', () => {
  it('issues verifiable guest tokens with issuer, audience, and expiry metadata', async () => {
    const issuer = createGuestTokenIssuer(SECRET);
    const verifier = createGuestTokenVerifier(SECRET);

    const session = await issuer('  Guest   Player  ');
    const verified = await verifier(session.token);
    const { payload } = await jwtVerify(session.token, signingKey(), {
      algorithms: ['HS256'],
      issuer: GUEST_TOKEN_ISSUER,
      audience: GUEST_TOKEN_AUDIENCE,
    });

    expect(session).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(String),
      user: {
        id: expect.any(String),
        displayName: 'Guest Player',
      },
    });
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(verified).toEqual(session.user);
    expect(payload.sub).toBe(session.user.id);
  });

  it('rejects expired, wrong-issuer, wrong-audience, and subjectless tokens', async () => {
    const verifier = createGuestTokenVerifier(SECRET);
    const base = new SignJWT({ name: 'Player' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();

    const expired = await base
      .setIssuer(GUEST_TOKEN_ISSUER)
      .setAudience(GUEST_TOKEN_AUDIENCE)
      .setSubject('user-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signingKey());
    await expect(verifier(expired)).rejects.toThrow();

    const wrongIssuer = await new SignJWT({ name: 'Player' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('other')
      .setAudience(GUEST_TOKEN_AUDIENCE)
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(signingKey());
    await expect(verifier(wrongIssuer)).rejects.toThrow();

    const wrongAudience = await new SignJWT({ name: 'Player' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(GUEST_TOKEN_ISSUER)
      .setAudience('other')
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(signingKey());
    await expect(verifier(wrongAudience)).rejects.toThrow();

    const subjectless = await new SignJWT({ name: 'Player' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(GUEST_TOKEN_ISSUER)
      .setAudience(GUEST_TOKEN_AUDIENCE)
      .setExpirationTime('1h')
      .sign(signingKey());
    await expect(verifier(subjectless)).rejects.toThrow('subject');
  });

  it('rejects weak production session secrets', () => {
    expect(() => assertProductionSessionSecret('short', 'production')).toThrow(
      'at least 32 characters',
    );
    expect(() =>
      assertProductionSessionSecret('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'production'),
    ).toThrow('high-entropy');
    expect(() =>
      assertProductionSessionSecret('replace-with-a-long-random-secret', 'production'),
    ).toThrow('high-entropy');
    expect(() => assertProductionSessionSecret('short', 'development')).not.toThrow();
  });
});

describe('account auth crypto', () => {
  it('hashes passwords and verifies only the original password', async () => {
    const passwordHash = await hashPassword('correct-password');

    expect(passwordHash).not.toContain('correct-password');
    await expect(verifyPasswordHash(passwordHash, 'correct-password')).resolves.toBe(true);
    await expect(verifyPasswordHash(passwordHash, 'wrong-password')).resolves.toBe(false);
  });

  it('normalizes usernames to lowercase simple handles', () => {
    expect(validateUsername('  Player_One-7  ')).toBe('player_one-7');
    expect(() => validateUsername('ab')).toThrow('Username must be 3 to 20');
    expect(() => validateUsername('player one')).toThrow('Username must be 3 to 20');
    expect(() => validateUsername('player@example.com')).toThrow('Username must be 3 to 20');
    expect(() => validateUsername('a'.repeat(21))).toThrow('Username must be 3 to 20');
  });
});
