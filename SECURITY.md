# Security Policy

## Supported versions

MathWar is in early development. Security fixes are applied to the latest
release only.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1.0 | No        |

## Deployment hardening

- Use a high-entropy `SESSION_SECRET` of at least 32 characters in production.
- Set `METRICS_TOKEN` and restrict `/metrics` to trusted operators or monitoring systems.
- Serve production traffic over HTTPS so multiplayer bearer tokens are not exposed in transit.
- Keep guest multiplayer access behind the server-issued token flow; do not expose direct database
  credentials or server environment values to the browser.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Instead,
report vulnerabilities privately using GitHub's "Report a vulnerability" feature:

<https://github.com/Swellshinider/MathWar/security/advisories/new>

If you prefer email, contact the maintainer at
**<eduardoleal.contact@gmail.com>**.

Include as much of the following as you can:

- A description of the issue and its impact
- Steps to reproduce, including the mini-game and mode
- Affected versions or commits
- Suggested fix, if any

You should receive an initial response within 72 hours. Please avoid public
disclosure until a fix has been released.
