# MathWar Observability

MathWar exposes local Prometheus-style metrics from the Fastify server at `/metrics`.
Metrics are enabled by default and can be disabled with:

```bash
METRICS_ENABLED=false rtk npm run server:dev
```

In production, configure `METRICS_TOKEN` and call `/metrics` with:

```bash
rtk curl -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:3000/metrics
```

When `METRICS_TOKEN` is set outside production, the same bearer token is required. Local development
and tests may read metrics without a token only when `METRICS_TOKEN` is unset.

Use `LOG_LEVEL=debug`, `info`, `warn`, or `error` to control structured server log verbosity.

Redis stores ephemeral multiplayer state and powers Socket.IO room broadcasts and adapter-wide socket
lookups. Deploy Redis as private infrastructure. Monitor Redis connection errors in server logs and
compare per-process `mathwar_socket_active` and `mathwar_matches_active` values against load test
expectations; these gauges are still reported by each scraped Node process.

## Running Locally

For the in-memory development server:

```bash
rtk npm run server:dev:memory
rtk curl http://127.0.0.1:3000/metrics
```

For Redis-backed development, configure `server/.env.example` values in your environment, then run:

```bash
rtk npm run server:dev
```

## Metric Groups

- Process: Node default process metrics, `mathwar_process_uptime_seconds`,
  `mathwar_process_active_handles`, and `mathwar_event_loop_delay_p95_seconds`.
- HTTP: `mathwar_http_requests_total`, `mathwar_http_request_duration_seconds`,
  `mathwar_health_requests_total`, and `mathwar_guest_auth_requests_total`.
- Socket.IO: active sockets, connection and disconnect totals, auth failures, resume-check hits and
  misses, actual reconnect outcomes, command outcomes, and command duration.
- Repository: operation counts and durations for the match repository plus update result reasons.
- Game engine: Equation Artillery shot resolution and expression compilation duration, shot impact,
  shot trail point count, and Formula Frenzy answer outcomes.
- Cleanup: sweep duration and deleted match counts for empty and finished matches.

Metric labels intentionally avoid user IDs, socket IDs, match IDs, room codes, command IDs, tokens,
and full equations.

## Baseline Values To Record

For every load test baseline, record:

- peak active sockets
- peak observed active match rooms
- HTTP p95 latency
- Socket.IO command p95 latency
- repository update p95 latency
- Equation Artillery `resolve_shot` p95 latency
- event-loop delay p95
- memory peak
- command rejection rate by code

Use `docs/load-test-baseline-template.md` for the report format.
