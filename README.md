# Math War

Math War is an Angular 22 collection of browser-based math minigames. Equation Artillery includes
both local play and a private 1v1 multiplayer mode backed by Fastify, Socket.IO, and PostgreSQL.

## Requirements

- Node.js `22.22.3` or newer
- npm `11` or newer

## Install and run

```bash
npm ci
npm start
```

Open the local URL printed by the Angular development server. The game catalog is served at `/`.
Equation Artillery is available at `/games/equation-artillery`, and multiplayer is available at
`/games/equation-artillery/multiplayer`.

## Development commands

```bash
npm run build
npm run build:production
npm run test:server
npm test -- --watch=false
```

`npm run test:server` builds the shared engine first, then runs the Fastify and game-engine test
suite with Vitest.

## Multiplayer development

The multiplayer implementation has three parts:

- `packages/game-engine`: deterministic simulation shared by browser and server
- `server`: Fastify and Socket.IO authoritative server with PostgreSQL persistence
- `src/app/games/equation-artillery/multiplayer`: Angular lobby and match client

Copy `public/config.example.js` to `public/config.js`, then set `serverUrl` to the origin of the
Fastify server. For a no-database local match server, use:

```js
window.MATH_WAR_CONFIG = {
  serverUrl: 'http://127.0.0.1:3000',
};
```

Then run the in-memory server and Angular dev server in separate terminals:

```bash
npm run server:dev:memory
npm start -- --host 127.0.0.1
```

Use `server/.env.example` as the template for local production-like server variables.

```bash
npm run server:dev
npm start
```

The server applies SQL files from `db/migrations` into PostgreSQL on startup and then checks that
the multiplayer tables exist. `DATABASE_URL`, `SESSION_SECRET`, and `CLIENT_ORIGIN` are mandatory.
The browser receives only `serverUrl` through `/config.js`.

## Docker deployment

The VM-level deployment wrapper lives one directory up from this repo in `/opt/docker/projects/math-war`.
It mirrors the `leal-planning-poker` pattern:

- `dev/` builds from the GitHub `main` branch
- `prod/` resolves the latest GitHub release tag, with a pinned fallback ref until tags exist
- both stacks run Fastify plus a local PostgreSQL container behind Traefik

From the VM wrapper directory:

```bash
cd /opt/docker/projects/math-war/dev
./deploy.sh
```

## Controls and equations

Enter a function in the `f(x)` field and select **Fire**. The Fire control remains disabled until
the shot ends. Destroy all three red targets to expose **New Round**. Each round also contains four
filled geometric walls. A wall stops the shot, but the impact destroys nearby wall pieces and opens
a path for later shots.
