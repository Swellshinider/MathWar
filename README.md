<div align="center">

# MathWar

[![UI Build](https://github.com/Swellshinider/MathWar/actions/workflows/ci-ui-build.yml/badge.svg)](https://github.com/Swellshinider/MathWar/actions/workflows/ci-ui-build.yml)
[![UI Tests](https://github.com/Swellshinider/MathWar/actions/workflows/ci-ui-test.yml/badge.svg)](https://github.com/Swellshinider/MathWar/actions/workflows/ci-ui-test.yml)
[![Server Build](https://github.com/Swellshinider/MathWar/actions/workflows/ci-server-build.yml/badge.svg)](https://github.com/Swellshinider/MathWar/actions/workflows/ci-server-build.yml)
[![Server Tests](https://github.com/Swellshinider/MathWar/actions/workflows/ci-server-test.yml/badge.svg)](https://github.com/Swellshinider/MathWar/actions/workflows/ci-server-test.yml)

MathWar is an open-source project for browser-based math mini-games. Have fun playing!

</div>

## Available Mini-Games

### Equation Artillery

Equation Artillery is a graph-based artillery game inspired by
[Graphwar](https://github.com/catabriga/graphwar). Players type equations, fire shots
that follow the resulting curve, and use function shape to hit targets.

### Formula Frenzy

Formula Frenzy is a progression-based arithmetic sprint. Solve each formula before its timer expires,
keep your streak alive, and watch the problems get harder as your score climbs.

## Requirements

- Node.js `22.22.3` or newer
- npm `11` or newer

## Install and Run

```bash
npm ci
npm start
```

Open the local URL printed by the Angular development server. The game catalog is served
at `/`.

## Development Commands

```bash
npm run build
npm run build:production
npm run test:server
npm test -- --watch=false
```

`npm run test:server` builds the shared engine first, then runs the Fastify and
game-engine test suite with Vitest.

## Multiplayer Development

The multiplayer implementation has three parts:

- `packages/game-engine`: deterministic simulation shared by browser and server
- `server`: Fastify and Socket.IO authoritative server with Redis-backed ephemeral match state
- `src/app/games/equation-artillery/multiplayer`: Angular lobby and match client

Copy `public/config.example.js` to `public/config.js`, then set `serverUrl` to the
origin of the Fastify server. For a no-database local match server, use:

```js
window.MATH_WAR_CONFIG = {
  serverUrl: 'http://127.0.0.1:3000',
};
```

Then run the in-memory server and Angular dev server together:

```bash
npm run dev:local
```

You can still run them in separate terminals when you need independent logs:

```bash
npm run server:dev:memory
npm start -- --host 127.0.0.1
```

Use `server/.env.example` as the template for local production-like server variables.

```bash
npm run server:dev
npm start
```

`REDIS_URL`, `SESSION_SECRET`, and `CLIENT_ORIGIN` are mandatory for the production-like server.
The browser receives only `serverUrl` through `/config.js`. Redis stores ephemeral multiplayer room
state and also coordinates Socket.IO room broadcasts and socket lookups across server instances.
`REDIS_KEY_PREFIX` can be set to isolate MathWar keys when sharing a Redis database.

## Project Layout

- `src/app`: Angular application, routes, shared shell, and game UI
- `packages/game-engine`: shared deterministic simulation code
- `server`: Fastify and Socket.IO multiplayer server
- `docs`: architecture notes and changelog
- `public`: static browser assets and runtime config example

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) to set up the project and submit
changes. To report a security issue, see [SECURITY.md](SECURITY.md).

## License

MathWar is licensed under GPL-3.0-only. See [LICENSE](LICENSE).
