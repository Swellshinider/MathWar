import { createSupabaseTokenVerifier } from './auth.js';
import { PostgresMatchRepository } from './postgres-repository.js';
import { createMultiplayerServer } from './server.js';

const databaseUrl = process.env['DATABASE_URL'];
const supabaseUrl = process.env['SUPABASE_URL'];
const allowedOrigin = process.env['CLIENT_ORIGIN'];
if (!databaseUrl || !supabaseUrl || !allowedOrigin) {
  throw new Error('DATABASE_URL, SUPABASE_URL, and CLIENT_ORIGIN are required.');
}

const server = await createMultiplayerServer({
  repository: new PostgresMatchRepository(databaseUrl),
  verifyToken: createSupabaseTokenVerifier(supabaseUrl),
  allowedOrigin,
});
await server.listen(Number(process.env['PORT'] ?? 3000));
