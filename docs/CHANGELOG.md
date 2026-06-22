# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
All notable changes to this project will be documented in this file.

## [Unreleased]

### Added - 2026-06-22

- Added a private, Google-authenticated Equation Artillery 1v1 mode with short room codes.
- Added an authoritative Fastify and Socket.IO server with PostgreSQL persistence, command
  idempotency, optimistic version checks, and Supabase JWT validation.
- Added a deterministic shared game engine for bilateral shots, opponent collisions, and seeded
  multiplayer boards.
- Added 60-second reconnection recovery, abandonment wins, and automatic removal of finished
  matches after 24 hours.

### Added - 2026-06-22

- Added an equation help modal and a reusable, chat-style history of fired equations.
- Added a compact square function silhouette preview beside the equation controls that hides the
  game board's position and scale.

### Changed - 2026-06-22

- Added the Math War logo to the site header and replaced the browser favicon.
- Increased each round from two to four randomly generated walls.
- Reduced wall impact blast radius so shots remove a smaller local area.

### Changed - 2026-06-21

- Streamlined the site header, reduced the Equation Artillery title, and added a dynamic footer
  copyright notice.
- Preserved the coordinate plane size by moving function references below it when side space is
  insufficient.

### Removed - 2026-06-21

- Removed the in-page game focus mode and its controls.

### Fixed - 2026-06-21

- Prevented Fire button and Enter-key form submissions from reloading the page.

### Added - 2026-06-21

- Responsive function reference panels with the complete supported equation syntax.
- Additional rounding, hyperbolic, and base-specific logarithm functions.
- Two randomized, filled geometric walls per round with persistent local blast damage.
- Routed minigame catalog and reusable application shell for future games.
- Responsive site header and footer components.
- Angular 22 Math War prototype with a responsive coordinate-plane canvas.
- Safe number-only equation parsing with documented implicit multiplication.
- Fixed-step curve-based shots, target collisions, trails, and randomized rounds.
- Vitest coverage for domain logic and Angular components.

