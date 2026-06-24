import { createGuestTokenIssuer, createGuestTokenVerifier } from './auth.js';
import { InMemoryMatchRepository } from './repository.js';
import { createMultiplayerServer } from './server.js';

const allowedOrigin = process.env['CLIENT_ORIGIN'] ?? 'http://127.0.0.1:4200';
const sessionSecret = process.env['SESSION_SECRET'] ?? 'local-development-secret';
const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '127.0.0.1';

const server = await createMultiplayerServer({
  repository: new InMemoryMatchRepository(),
  verifyToken: createGuestTokenVerifier(sessionSecret),
  issueGuestSession: createGuestTokenIssuer(sessionSecret),
  allowedOrigin,
});

await server.listen(port, host);
console.log(`Multiplayer dev server listening on http://${host}:${port}`);
