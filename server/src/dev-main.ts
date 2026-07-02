import { createAccountTokenVerifier } from './account-auth.js';
import { InMemoryAccountRepository } from './account-repository.js';
import { createGuestTokenIssuer, createGuestTokenVerifier } from './auth.js';
import { InMemoryMatchRepository } from './repository.js';
import { configureRedisSocketAdapter, redisAdapterOptionsFromEnv } from './redis-adapter.js';
import { createMultiplayerServer } from './server.js';

const allowedOrigin = process.env['CLIENT_ORIGIN'] ?? 'http://127.0.0.1:4200';
const sessionSecret = process.env['SESSION_SECRET'] ?? 'local-development-secret';
const accountAccessTokenSecret =
  process.env['ACCOUNT_ACCESS_TOKEN_SECRET'] ?? 'local-account-access-secret';
const accountRefreshTokenSecret =
  process.env['ACCOUNT_REFRESH_TOKEN_SECRET'] ?? 'local-account-refresh-secret';
const accountEmailLookupSecret =
  process.env['ACCOUNT_EMAIL_LOOKUP_SECRET'] ?? 'local-account-email-lookup-secret';
const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '127.0.0.1';
const redisAdapterOptions = redisAdapterOptionsFromEnv();
const verifyGuestToken = createGuestTokenVerifier(sessionSecret);
const verifyAccountToken = createAccountTokenVerifier(accountAccessTokenSecret);

const server = await createMultiplayerServer({
  repository: new InMemoryMatchRepository(),
  verifyToken: async (token) => {
    try {
      return await verifyGuestToken(token);
    } catch {
      return verifyAccountToken(token);
    }
  },
  accounts: {
    repository: new InMemoryAccountRepository(),
    accessTokenSecret: accountAccessTokenSecret,
    refreshTokenSecret: accountRefreshTokenSecret,
    emailLookupSecret: accountEmailLookupSecret,
    refreshCookieSecure: false,
  },
  issueGuestSession: createGuestTokenIssuer(sessionSecret),
  allowedOrigin,
  configureSocketAdapter: redisAdapterOptions
    ? (io) => configureRedisSocketAdapter(io, redisAdapterOptions)
    : undefined,
});

await server.listen(port, host);
console.log(`Multiplayer dev server listening on http://${host}:${port}`);
