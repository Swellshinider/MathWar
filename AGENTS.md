# Repository Guidelines

## Project Structure & Module Organization

MathWar is an Angular 22 standalone application with a Fastify multiplayer server and a
shared game-engine workspace. Application code lives in `src/app/`:

- `games/equation-artillery/` contains the current playable mini-game.
- `games/equation-artillery/board/` renders the responsive canvas.
- `games/equation-artillery/equation-controls/` owns the reactive equation form.
- `games/equation-artillery/game/` contains rendering, parsing, animation, collision, spawning,
  CPU, sandbox, and coordinate logic.
- `games/equation-artillery/models/` contains focused domain types such as `Point`, `Player`, and
  `Target`.
- `games/equation-artillery/multiplayer/` contains the Angular lobby and match client.
- `layout/` contains the shared header and footer shell.
- `shared/` contains reusable UI such as the game frame and toast container.

Shared deterministic simulation code lives in `packages/game-engine/`. The multiplayer server lives
in `server/src/`, and PostgreSQL migrations live in `server/db/migrations/`. Tests are colocated
with implementation files as `*.spec.ts`. Global styles and bootstrap files are under `src/`; static
application assets belong in `public/`, game catalog images belong in `public/images/`, and README
images belong in `docs/images/`. User-facing changes should also update `docs/CHANGELOG.md`.

## Build, Test, and Development Commands

- `rtk npm install`: install dependencies from `package-lock.json`.
- `rtk npm start`: run the Angular development server.
- `rtk npm test -- --watch=false`: execute the complete Vitest suite once.
- `rtk npm run test:server`: run the shared engine and server Vitest suite.
- `rtk npm run build:production`: create the optimized Angular bundle and compile the server.
- `rtk npm run watch`: continuously build using the development configuration.

Run the narrowest relevant tests while developing, then run the complete UI suite, server suite, and
production build before submitting. GitHub Actions CI runs on pushes to `main` and pull requests with
Node.js `22.22.3`.

## Coding Style & Naming Conventions

Use strict TypeScript, Angular signals, standalone components, and reactive forms. Keep rendering and game rules in services or pure utilities instead of components. Use two-space indentation, single quotes, and a 100-character line width. Format with Prettier using `.prettierrc`.

Use `kebab-case` filenames with Angular suffixes, such as `board.component.ts` and `animation.service.ts`. Use `PascalCase` for classes and interfaces, and `camelCase` for functions, properties, and signals.

Use the global scrollbar styling in `src/styles.scss`; do not add one-off scrollbar styling to
individual Equation Artillery panels unless the shared treatment cannot work.

## Mini-Game Layout Consistency

Mini-game pages should use the same wide `GameFrameComponent` layout for visual consistency across
the catalog. Prefer `<app-game-frame [wide]="true">` for playable mini-game pages, and avoid adding
local `max-width` caps to the primary game surface or mode toolbar unless the game has a concrete
layout constraint that requires a narrower width.

## Testing Guidelines

Vitest runs through Angular's unit-test builder in a jsdom environment. Name tests `*.spec.ts` and keep them beside the code under test. Cover normal behavior, boundary conditions, invalid equations, animation termination, and user-visible form states. Avoid nondeterministic tests by injecting seeded random functions where spawning is involved.

## Release & Open Source Notes

The repository is GPL-3.0-only. Keep `package.json`, `package-lock.json`, and workspace package
versions aligned with the latest release tag when release metadata changes. The root README includes
the CI badge and the Equation Artillery example image from `docs/images/`; update those references
when moving workflow or asset files.
