import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionAccountSecrets, createAccountTokenVerifier } from './account-auth.js';
import { PostgresAccountRepository } from './account-repository.js';
import {
  RedisUsernameAvailabilityCache,
  redisUsernameAvailabilityCacheOptionsFromEnv,
} from './account-username-cache.js';
import {
  assertProductionSessionSecret,
  createGuestTokenIssuer,
  createGuestTokenVerifier,
} from './auth.js';
import { PostgresLeaderboardRepository } from './leaderboard-repository.js';
import { configureRedisSocketAdapter, redisAdapterOptionsFromEnv } from './redis-adapter.js';
import { RedisMatchRepository, redisMatchRepositoryOptionsFromEnv } from './redis-repository.js';
import { createMultiplayerServer } from './server.js';

const redisUrl = process.env['REDIS_URL'];
const databaseUrl = process.env['DATABASE_URL'];
const allowedOrigin = process.env['CLIENT_ORIGIN'];
const sessionSecret = process.env['SESSION_SECRET'];
const accountAccessTokenSecret = process.env['ACCOUNT_ACCESS_TOKEN_SECRET'];
const accountRefreshTokenSecret = process.env['ACCOUNT_REFRESH_TOKEN_SECRET'];
if (
  !redisUrl ||
  !databaseUrl ||
  !allowedOrigin ||
  !sessionSecret ||
  !accountAccessTokenSecret ||
  !accountRefreshTokenSecret
) {
  throw new Error(
    'REDIS_URL, DATABASE_URL, CLIENT_ORIGIN, SESSION_SECRET, ACCOUNT_ACCESS_TOKEN_SECRET, and ACCOUNT_REFRESH_TOKEN_SECRET are required.',
  );
}
assertProductionSessionSecret(sessionSecret, process.env['NODE_ENV']);
assertProductionAccountSecrets(
  accountAccessTokenSecret,
  accountRefreshTokenSecret,
  process.env['NODE_ENV'],
);

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/math-war/browser');
const redisAdapterOptions = redisAdapterOptionsFromEnv();
const verifyGuestToken = createGuestTokenVerifier(sessionSecret);
const verifyAccountToken = createAccountTokenVerifier(accountAccessTokenSecret);

const server = await createMultiplayerServer({
  repository: new RedisMatchRepository(redisUrl, redisMatchRepositoryOptionsFromEnv()),
  verifyToken: async (token) => {
    try {
      return await verifyGuestToken(token);
    } catch {
      return verifyAccountToken(token);
    }
  },
  accounts: {
    repository: new PostgresAccountRepository(databaseUrl),
    accessTokenSecret: accountAccessTokenSecret,
    refreshTokenSecret: accountRefreshTokenSecret,
    usernameAvailabilityCache: new RedisUsernameAvailabilityCache(
      redisUrl,
      redisUsernameAvailabilityCacheOptionsFromEnv(),
    ),
  },
  leaderboardRepository: new PostgresLeaderboardRepository(databaseUrl),
  issueGuestSession: createGuestTokenIssuer(sessionSecret),
  allowedOrigin,
  configureSocketAdapter: redisAdapterOptions
    ? (io) => configureRedisSocketAdapter(io, redisAdapterOptions)
    : undefined,
  staticRoot,
  browserConfig: {
    serverUrl: allowedOrigin,
  },
});
await server.listen(Number(process.env['PORT'] ?? 3000), process.env['HOST'] ?? '0.0.0.0');
