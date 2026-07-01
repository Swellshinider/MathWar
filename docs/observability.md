# MathWar Observability

MathWar exposes local Prometheus-style metrics from the Fastify server at `/metrics`.
Metrics are enabled by default and can be disabled with:

```bash
METRICS_ENABLED=false rtk npm run server:dev
```

Use `LOG_LEVEL=debug`, `info`, `warn`, or `error` to control structured server log verbosity.

## Running Locally

For the in-memory development server:

```bash
rtk npm run server:dev:memory
rtk curl http://127.0.0.1:3000/metrics
```

For PostgreSQL-backed development, configure `server/.env.example` values in your environment,
then run:

```bash
rtk npm run server:dev
```

## Metric Groups

- Process: Node default process metrics, `mathwar_process_uptime_seconds`,
  `mathwar_process_active_handles`, and `mathwar_event_loop_delay_p95_seconds`.
- HTTP: `mathwar_http_requests_total`, `mathwar_http_request_duration_seconds`,
  `mathwar_health_requests_total`, and `mathwar_guest_auth_requests_total`.
- Socket.IO: active sockets, connection and disconnect totals, auth failures, reconnect outcomes,
  command outcomes, and command duration.
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
