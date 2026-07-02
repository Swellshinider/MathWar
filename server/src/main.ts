import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductionSessionSecret,
  createGuestTokenIssuer,
  createGuestTokenVerifier,
} from './auth.js';
import { configureRedisSocketAdapter, redisAdapterOptionsFromEnv } from './redis-adapter.js';
import { RedisMatchRepository, redisMatchRepositoryOptionsFromEnv } from './redis-repository.js';
import { createMultiplayerServer } from './server.js';

const redisUrl = process.env['REDIS_URL'];
const allowedOrigin = process.env['CLIENT_ORIGIN'];
const sessionSecret = process.env['SESSION_SECRET'];
if (!redisUrl || !allowedOrigin || !sessionSecret) {
  throw new Error('REDIS_URL, CLIENT_ORIGIN, and SESSION_SECRET are required.');
}
assertProductionSessionSecret(sessionSecret, process.env['NODE_ENV']);

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/math-war/browser');
const redisAdapterOptions = redisAdapterOptionsFromEnv();

const server = await createMultiplayerServer({
  repository: new RedisMatchRepository(redisUrl, redisMatchRepositoryOptionsFromEnv()),
  verifyToken: createGuestTokenVerifier(sessionSecret),
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
