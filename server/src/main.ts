import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuestTokenIssuer, createGuestTokenVerifier } from './auth.js';
import { runMigrations } from './migrations.js';
import { PostgresMatchRepository } from './postgres-repository.js';
import { createMultiplayerServer } from './server.js';

const databaseUrl = process.env['DATABASE_URL'];
const allowedOrigin = process.env['CLIENT_ORIGIN'];
const sessionSecret = process.env['SESSION_SECRET'];
if (!databaseUrl || !allowedOrigin || !sessionSecret) {
  throw new Error('DATABASE_URL, CLIENT_ORIGIN, and SESSION_SECRET are required.');
}

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/math-war/browser');
const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations');

await runMigrations(databaseUrl, migrationsDirectory);

const server = await createMultiplayerServer({
  repository: new PostgresMatchRepository(databaseUrl),
  verifyToken: createGuestTokenVerifier(sessionSecret),
  issueGuestSession: createGuestTokenIssuer(sessionSecret),
  allowedOrigin,
  staticRoot,
  browserConfig: {
    serverUrl: allowedOrigin,
  },
});
await server.listen(Number(process.env['PORT'] ?? 3000), process.env['HOST'] ?? '0.0.0.0');
