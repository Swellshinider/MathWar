# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2026-06-27

- Added Formula Frenzy as a new progression-based arithmetic mini-game with timed
  calculations, escalating difficulty, score stats, and restart flow.
- Added an About dialog with project, mini-game, Graphwar inspiration, and issue tracker details.
- Added a footer link to the GitHub repository.
- Added a GitHub Actions CI workflow for UI tests, server tests, and production builds.
- Added an Equation Artillery README screenshot.

### Changed - 2026-06-27

- Rewrote the README around MathWar as an open-source mini-game collection with Equation Artillery
  as the first playable game.
- Licensed the project under GPL-3.0-only and added package license metadata.
- Renamed visible Equation Artillery "Single Player" copy to "CPU vs.".
- Tightened local environment ignore rules while keeping example env files trackable.
- Moved PostgreSQL migrations under the server tree.
- Matched project package versions to the latest release tag.
- Standardized scrollbars across Equation Artillery scrollable panels.

### Fixed - 2026-06-27

- Kept Equation Artillery shot timelines progressing when the browser tab is hidden or the window
  loses focus.

### Added - 2026-06-26

- Upgraded Equation Artillery Free Practice into a sandbox with canvas trajectory previews, enemy
  placement, wall stamps, delete tooling, and collisions against manually placed objects.

### Changed - 2026-06-26

- Changed Equation Artillery attack animations to resolve over a fixed 3000ms duration.

### Fixed - 2026-06-26

- Prevented in-flight attack audio and line animation from freezing across hidden browser tabs.
- Matched Equation Artillery shot animation speed across Free Practice, target practice,
  single-player, and multiplayer by shortening close-hit animations.
- Delayed multiplayer win and lose sounds until the final shot animation finishes.
- Returned players to the main Equation Artillery page after leaving a multiplayer match.
- Allowed pasted multiplayer invite links in the join-room field to extract the room code.
- Fired Free Practice attacks leftward when the player is moved to the right side of the board.
- Replaced raw multiplayer websocket errors with friendlier reconnect copy and cleared the message
  after reconnection.

### Added - 2026-06-25

- Added a Free Practice Equation Artillery mode with no targets, walls, or enemies, and click or
  tap movement for the player character.
- Added an offline Single Player Equation Artillery mode with CPU soldier squads, local turn
  resolution, and a pre-match CPU difficulty selector from 0 to 10.

### Changed - 2026-06-25

- Reworked Single Player CPU aiming with Graphwar-inspired per-soldier evolutionary search,
  difficulty-scaled calculations, and penalties for repeating missed equations.
- Stretched the site header and footer to the full viewport width.
- Redesigned the landing catalog into clickable game cards with preview imagery and animated hover.
- Renamed the "Math War" brand to "MathWar" across the app, README, and architecture docs.
- Trimmed redundant Equation Artillery page copy and removed the multiplayer "Reset session" button.
- Kept multiplayer Share link and Leave match actions on a single row at every viewport width.
- Added a transient toast confirmation when copying the multiplayer share link.
- Prompted for confirmation before leaving a multiplayer match when an opponent is connected.
- Zoomed out the Equation Artillery coordinate plane from `-12..12` by `-7.5..7.5` to
  `-16..16` by `-10..10` while keeping the board's physical canvas size unchanged.
- Expanded local and multiplayer spawn bands so players, enemies, and generated walls use more of
  the zoomed-out coordinate plane.
- Remade Equation Artillery shot solving around Graphwar-inspired board-coordinate graph
  sampling, vertical launch anchoring, tangent launch offsets, and adaptive curve stepping for
  local and multiplayer shots.
- Added Graphwar-style expression aliases for `sen(x)`, `tg(x)`, and comma decimal input.
- Reworked the Equation Artillery help modal into searchable collapsible sections with expanded
  play guidance and complete references for supported constants, operators, and functions.
- Changed multiplayer soldiers to use numbered player-relative names, changed equation history
  into chat-style messages with player and soldier metadata, and made turns alternate fairly
  between players after soldiers are defeated.
- Constrained Equation Artillery history to the board height so long histories scroll instead of
  resizing the play layout.
- Moved Equation Artillery Sound and Help into compact icon controls on the board and reorganized
  multiplayer utility actions into cleaner toolbars.
- Replaced the Equation Artillery "Play 1v1" action with the private-room create and join lobby.
- Added 10-minute cleanup for multiplayer rooms after the last player disconnects.
- Added the Equation Artillery preview image to the game catalog.

### Fixed - 2026-06-25

- Restored persisted Equation Artillery sound volume on startup and changed the default volume to
  50%.
- Rendered shots to the board edge when trajectories exit the visible area and anchored
  launch-singular equations with finite forward paths, such as `log(x)`, at the player.
- Cleared Angular's prebundle cache and rebuilt the shared game engine before local UI startup and
  tests so equation changes are not served from stale package output.
- Allowed share-link joins for waiting multiplayer rooms after the host reconnects.

## [0.1.0] - 2026-06-24

### Added - 2026-06-24

- Added multiplayer squad lives with three characters per player, character-based turn rotation,
  randomized character positions, distinct character colors, active-character glow, persistent
  shooter function labels, and names under each character.
- Added Equation Artillery sound effects for firing, wall hits, enemy hits, win and lose results,
  generated in-flight equation audio, and persisted sound settings.
- Added per-character multiplayer equation recall so each character restores its last accepted
  function on the player's next turn.
- Added randomized multiplayer wall counts and shapes so matches now spawn 2 to 5 mixed walls
  instead of three fixed vertical walls.
- Added multiplayer invite links with one-click copying and automatic room joins from shared room
  URLs.

### Changed - 2026-06-24

- Redesigned the UI around a shared design-token system (colors, surfaces, spacing, radius,
  elevation, typography, and motion) with glass surfaces, consistent focus rings, and smooth
  transitions that respect prefers-reduced-motion.
- Refreshed the Equation Artillery board palette with a softer grid and a subtle glow on the shot
  trail and bullet, drawn from one shared palette.
- Introduced reusable button, field, and glass styles so every screen shares one look, and unified
  the scattered responsive breakpoints into a consistent scale.
- Kept the site header visible while scrolling.
- Changed multiplayer room codes to the `XXXX-XXXX` format and remembered the last display name
  separately from the guest session.
- Added a `dev:local` npm script that starts the Angular UI and in-memory multiplayer server
  together for local testing.

### Fixed - 2026-06-24

- Graphed function previews across a centered domain so sigmoid-style equations show their full
  shape instead of only the forward-shot segment.
- Clarified that the function preview is stretched for shape readability and may not match the
  fired shot's board-scaled path.
- Enlarged the equation help reference text to a readable size.
- Show a clear multiplayer sign-in error when the local server cannot be reached, and documented
  the in-memory multiplayer dev server for no-database local testing.
- Guarded multiplayer session storage so the guest auth service no longer crashes when
  `localStorage` is unavailable (tests, SSR), and corrected the multiplayer route test to assert
  the rendered entry state.
- Allowed Enter to submit the multiplayer join-room field and reduced the active-character glow
  while highlighting the active player's name in red.

### Fixed - 2026-06-22

- Prevented multiplayer wall damage, turn changes, match results, and equation history from
  appearing before the shot animation reaches its impact.
- Restored Equation history and Help to multiplayer, removed internal server and version messages,
  and made equation history persist across reconnects.
- Changed the favicon reference to a root-absolute cache-busted URL for Railway deployments.

### Added - 2026-06-22

- Added a system architecture guide covering browser, server, shared engine, Supabase, Railway,
  security, persistence, deployment, and scaling boundaries.
- Added a private, Google-authenticated Equation Artillery 1v1 mode with short room codes.
- Added an authoritative Fastify and Socket.IO server with PostgreSQL persistence, command
  idempotency, optimistic version checks, and Supabase JWT validation.
- Added a deterministic shared game engine for bilateral shots, opponent collisions, and seeded
  multiplayer boards.
- Added 60-second reconnection recovery, abandonment wins, and automatic removal of finished
  matches after 24 hours.
- Added an equation help modal and a reusable, chat-style history of fired equations.
- Added a compact square function silhouette preview beside the equation controls that hides the
  game board's position and scale.

### Changed - 2026-06-22

- Combined the Angular application and Fastify server into one Railway deployment in US East.
- Moved multiplayer persistence into a client-inaccessible `private` Supabase schema managed by a
  committed migration, with startup now failing fast when the schema is missing.
- Replaced build-time browser configuration with a runtime `/config.js` containing only public
  endpoints and the Supabase publishable key.
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
