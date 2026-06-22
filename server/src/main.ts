import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseTokenVerifier } from './auth.js';
import { PostgresMatchRepository } from './postgres-repository.js';
import { createMultiplayerServer } from './server.js';

const databaseUrl = process.env['DATABASE_URL'];
const supabaseUrl = process.env['SUPABASE_URL'];
const supabasePublishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
const allowedOrigin = process.env['CLIENT_ORIGIN'];
if (!databaseUrl || !supabaseUrl || !supabasePublishableKey || !allowedOrigin) {
  throw new Error(
    'DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and CLIENT_ORIGIN are required.',
  );
}

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/math-war/browser');

const server = await createMultiplayerServer({
  repository: new PostgresMatchRepository(databaseUrl),
  verifyToken: createSupabaseTokenVerifier(supabaseUrl),
  allowedOrigin,
  staticRoot,
  browserConfig: {
    serverUrl: allowedOrigin,
    supabaseUrl,
    supabasePublishableKey,
  },
});
await server.listen(Number(process.env['PORT'] ?? 3000));
