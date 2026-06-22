# Math War

Math War is an Angular 22 collection of browser-based math minigames. The first game,
Equation Artillery, asks the player to fire a bullet along a mathematical curve to destroy
targets on a coordinate plane.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Install and run

```bash
rtk npm install
rtk npm start
```

Open the local URL printed by the Angular development server. The home page lists the available
games. Equation Artillery is also available directly at `/games/equation-artillery`.

The authenticated private 1v1 mode is available at
`/games/equation-artillery/multiplayer`. The existing local game remains independent.

## Development commands

```bash
rtk npm test -- --watch=false
rtk npm run build
```

`npm test` runs the Vitest unit suite. `npm run build` creates an optimized production build in `dist/`.

## Multiplayer development

The multiplayer implementation has three parts:

- `packages/game-engine`: deterministic simulation shared by browser and server.
- `server`: Fastify and Socket.IO authoritative server with PostgreSQL persistence.
- `src/app/games/equation-artillery/multiplayer`: Angular lobby and match client.

Copy the values from `public/config.example.js` into `public/config.js`, then configure Google OAuth
in Supabase. Start PostgreSQL, apply the migration under `supabase/migrations`, and use
`server/.env.example` as the server environment template.

```bash
rtk npm run server:dev
rtk npm start
```

The server checks that `private.multiplayer_matches` and `private.multiplayer_commands` exist at
startup and fails fast when the migration has not been applied. It validates Supabase JWTs against
the project's JWKS endpoint. `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`CLIENT_ORIGIN` are mandatory server variables. The browser receives only the server URL,
Supabase URL, and publishable key. Never place a secret or service-role key in browser config.

## Production deployment

The root `railway.json` builds Angular and Fastify as one Railway service. Fastify serves the
production browser bundle, generates `/config.js` from runtime variables, and handles Angular route
fallbacks. The initial deployment is limited to one replica because Socket.IO connection state is
process-local.

Apply the committed migration to Supabase project `gsctbzyfslrofvmhpuoi`, then run both advisor
categories from the Supabase Database Advisors page:

```bash
rtk npx supabase link --project-ref gsctbzyfslrofvmhpuoi
rtk npx supabase db push
```

Configure one Railway service in US East with `NODE_ENV=production`, `DATABASE_URL` (the Supabase
session-pooler connection string), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `CLIENT_ORIGIN`.
Set `CLIENT_ORIGIN` to the generated Railway HTTPS origin. Enter `DATABASE_URL` through stdin so it
does not enter shell history.

In Supabase Auth, set the Site URL to the Railway origin and allow
`<railway-origin>/games/equation-artillery/multiplayer`. The Google Web OAuth client needs the
Railway origin as an authorized JavaScript origin and this callback URL:

```text
https://gsctbzyfslrofvmhpuoi.supabase.co/auth/v1/callback
```

Additional validation commands:

```bash
rtk npm run test:server
rtk npm run server:build
```

## Controls and equations

Enter a function in the `f(x)` field and select **Fire**. The Fire control remains disabled until
the shot ends. Destroy all three red targets to expose **New Round**. Each round also contains four
filled geometric walls. A wall stops the shot, but the impact destroys nearby wall pieces and opens
a path for later shots.

Equations may contain numbers, `x`, `pi`, `e`, parentheses, `+`, `-`, `*`, `/`, `^`, and these one-argument functions:

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `sqrt`, `abs`, `log`,
`ln`, `log2`, `log10`, `exp`, `floor`, `ceil`, `round`, and `sign`.

Angles use radians. `log` and `ln` are natural logarithms. Common Unicode multiplication,
division, minus, and pi characters are normalized. Implicit multiplication is supported,
including `2x`, `xx`, `x2`, `x(x+1)`, `(x+1)(x-1)`, and `sin(x)cos(x)`.

The shot is anchored to the player's position. For horizontal distance `dx` from the player, its height is:

```text
playerY + f(dx) - f(0)
```

This means every valid curve begins at the player even when `f(0)` is not zero.

## Prototype limitations

- Equation Artillery is currently the only available minigame.
- Rounds are local and are not persisted.
- The player and targets are randomly placed on integer coordinates.
- Equations are limited to 180 normalized characters and the documented syntax.
- The game has no scoring, sound, or touch-specific controls.
- Multiplayer has no public matchmaking, chat, ranking, history, profiles, or spectators.
