# MathWar Architecture

## Overview

MathWar ships as a Fastify service that serves the built Angular application, exposes runtime
browser configuration at `/config.js`, handles Socket.IO multiplayer traffic, and stores
authoritative ephemeral match state in Redis. Redis also backs the Socket.IO adapter so room
broadcasts and socket lookups work across server processes.

```text
Browser <-> Fastify/Socket.IO <-> Redis
```

The local Equation Artillery mode stays browser-only. The multiplayer mode is private-room based
and uses guest sessions signed by the Fastify server.

## Repository layout

- `src/app/`: Angular application shell, local game, and multiplayer UI
- `packages/game-engine/`: shared simulation, expression parsing, and multiplayer types
- `server/src/`: Fastify bootstrap, guest session auth, Socket.IO protocol, and repository code
- `public/`: static browser assets and `config.example.js`

## Runtime configuration

Server environment variables:

- `REDIS_URL`: Redis connection string for multiplayer state and Socket.IO coordination
- `REDIS_KEY_PREFIX`: optional Redis key namespace, defaults to `mathwar`
- `SESSION_SECRET`: symmetric signing secret for guest multiplayer tokens
- `METRICS_TOKEN`: bearer token required to read `/metrics` in production
- `CLIENT_ORIGIN`: public origin used for CORS and generated browser config
- `HOST`, `PORT`, `NODE_ENV`: listener and runtime settings

Browser runtime configuration:

- `serverUrl`: Fastify public origin

## Multiplayer flow

1. The browser posts a display name to `POST /api/auth/guest`.
2. Fastify returns a signed guest token, expiry timestamp, and stable user id.
3. The browser stores the session in `localStorage`, clears it once expired, and uses the token in
   the Socket.IO handshake.
4. The server verifies the token, maps the subject to the player id, joins a user-specific Socket.IO
   room, and applies authoritative commands against Redis-backed match state.
5. Socket.IO uses Redis pub/sub for cross-instance room broadcasts, user socket lookups, and match
   room emptiness checks.

Guest tokens are scoped to the MathWar multiplayer issuer and audience. Production startup rejects
short or placeholder `SESSION_SECRET` values so guest identities cannot be forged with predictable
signing keys.

## Multiplayer state

Redis stores the current multiplayer room state and short-lived indexes:

- match JSON by match id
- room-code lookup keys
- active-user lookup keys for reconnect
- command id sets for idempotency
- sorted sets for reconnect, empty-room, and finished-room cleanup

This data is intentionally ephemeral. A Redis flush or outage can drop active private rooms.
PostgreSQL is reserved for future durable product data such as leaderboards or match history.
Current per-process rate limit buckets and Formula Frenzy deadline timers are still local process
concerns.
