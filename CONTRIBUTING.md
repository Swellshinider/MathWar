# Contributing to MathWar

Thanks for your interest in MathWar! This guide covers setting up the project
locally and submitting changes.

## Prerequisites

- Node.js `22.22.3` or newer
- npm `11` or newer

## Getting started

```bash
git clone https://github.com/Swellshinider/MathWar.git
cd MathWar
npm ci
npm start
```

Open the local URL printed by the Angular development server. The game catalog
is served at `/`.

## Common scripts

| Script | What it does |
| --- | --- |
| `npm start` | Run the Angular development server. |
| `npm run dev:local` | Run the Angular UI and the in-memory multiplayer server together. |
| `npm test -- --watch=false` | Run the UI test suite once. |
| `npm run test:server` | Run the Fastify and game-engine test suite once. |
| `npm run build` | Build the UI bundle. |
| `npm run server:build` | Compile the server. |
| `npm run build:production` | Build the UI bundle and compile the server. |

Run the narrowest relevant suite while developing, then both suites and the
production build before opening a pull request.

## Project layout

- `src/app`: Angular application, routes, shared shell, and game UI
- `packages/game-engine`: shared deterministic simulation code used by browser and server
- `server`: Fastify multiplayer server
- `server/db/migrations`: PostgreSQL schema migrations
- Tests are colocated with the code under test as `*.spec.ts`

## Code style

- Strict TypeScript, Angular signals, and standalone components.
- Two-space indentation, single quotes, and a 100-character line width.
- `kebab-case` filenames with Angular suffixes (`board.component.ts`).
- `PascalCase` for classes and interfaces; `camelCase` for functions, properties, and signals.
- Keep rendering and game rules in services or pure utilities, not components.
- Format with Prettier using the repo's `.prettierrc`.

## Multiplayer development

See the README's [Multiplayer Development](README.md#multiplayer-development)
section for the local server setup, including the in-memory no-database mode
(`npm run dev:local`) and the PostgreSQL-backed mode using `server/.env.example`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with focused commits.
3. Add or update tests next to the code you changed.
4. Make sure `npm test -- --watch=false`, `npm run test:server`, and
   `npm run build:production` all pass.
5. Update `docs/CHANGELOG.md` for user-visible changes.
6. Open a pull request and fill in the template.

By contributing, you agree that your contributions are licensed under
GPL-3.0-only, the same license as the project.
