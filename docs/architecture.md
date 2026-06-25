# MathWar Architecture

## Overview

MathWar ships as a single Fastify service that serves the built Angular application, exposes
runtime browser configuration at `/config.js`, handles Socket.IO multiplayer traffic, and persists
authoritative match state in PostgreSQL.

```text
Browser <-> Fastify/Socket.IO <-> PostgreSQL
```

The local Equation Artillery mode stays browser-only. The multiplayer mode is private-room based
and uses guest sessions signed by the Fastify server.

## Repository layout

- `src/app/`: Angular application shell, local game, and multiplayer UI
- `packages/game-engine/`: shared simulation, expression parsing, and multiplayer types
- `server/src/`: Fastify bootstrap, guest session auth, Socket.IO protocol, and repository code
- `db/migrations/`: SQL files applied automatically on server startup
- `public/`: static browser assets and `config.example.js`

## Runtime configuration

Server environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: `true` or `false`
- `DATABASE_SSL_REJECT_UNAUTHORIZED`: TLS verification toggle when SSL is enabled
- `SESSION_SECRET`: symmetric signing secret for guest multiplayer tokens
- `CLIENT_ORIGIN`: public origin used for CORS and generated browser config
- `HOST`, `PORT`, `NODE_ENV`: listener and runtime settings

Browser runtime configuration:

- `serverUrl`: Fastify public origin

## Multiplayer flow

1. The browser posts a display name to `POST /api/auth/guest`.
2. Fastify returns a signed guest token and stable user id.
3. The browser stores the session in `localStorage` and uses the token in the Socket.IO handshake.
4. The server verifies the token, maps the subject to the player id, and applies authoritative
   commands against PostgreSQL-backed match state.

## Persistence

The server applies all `.sql` files in `db/migrations` before accepting traffic. The current schema
uses:

- `private.multiplayer_matches`: full authoritative match JSON plus versioning metadata
- `private.multiplayer_commands`: idempotency tracking for versioned commands
- `public.schema_migrations`: applied migration bookkeeping

The Docker deployment runs PostgreSQL in the same compose stack as the app, so no Supabase or
Railway services are required.
