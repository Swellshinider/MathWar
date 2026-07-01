# Phase 1 Observability Engineering Report

## Expected Bottlenecks

The first bottlenecks should be measured with load tests before optimizing. Based on the current
single-instance architecture, the most likely pressure points are:

- PostgreSQL `update` operations, because match commands serialize through versioned row updates.
- Equation Artillery shot resolution for equations that create long or adaptive trails.
- Socket.IO event-loop pressure when many matches emit state updates at the same time.
- Cleanup sweeps if many abandoned rooms or expired Formula Frenzy matches accumulate.
- Memory growth from active sockets, room membership, and in-flight command work.

## Recommended Phase 2 Actions

- Capture at least one smoke, small, and stress baseline from the same machine and commit.
- Use the baseline to identify whether PostgreSQL latency, simulation cost, event-loop delay, or
  socket count is the limiting factor.
- Add targeted indexes or query changes only if repository metrics show database pressure.
- Consider worker isolation for expensive deterministic simulation only if game operation metrics
  dominate command latency.
- Consider Redis, clustering, or multi-instance Socket.IO adapters only after the single-instance
  active socket and active match ceiling is known.

## Current Limits

- `mathwar_matches_active` counts match rooms observed by this server process, not a durable
  database-wide census.
- `/metrics` is intended for local and trusted-network scraping. Disable it with
  `METRICS_ENABLED=false` if exposing the server publicly without a scrape boundary.
- Formula Frenzy load tests do not automate correct answers because public state intentionally
  hides answer values.
