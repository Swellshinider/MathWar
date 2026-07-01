# MathWar Load Testing

The load runner lives at `scripts/load/multiplayer-load.ts`. It uses the real guest auth endpoint
and Socket.IO protocol, so it is closer to browser multiplayer traffic than a raw WebSocket test.

Start a server first:

```bash
rtk npm run server:dev:memory
```

Then run one of the scenarios:

```bash
rtk npm run load:dry-run
rtk npm run load:smoke
rtk npm run load:small
rtk npm run load:stress
```

All scenario values can be overridden:

```bash
rtk npm run load:custom -- \
  --url http://127.0.0.1:3000 \
  --players 40 \
  --matches 20 \
  --ramp-up-ms 30000 \
  --duration-ms 180000 \
  --game equation-artillery \
  --metrics-out artifacts/mathwar.prom \
  --json-out artifacts/mathwar-load.json
```

Use `--game formula-frenzy` to exercise Formula Frenzy start, typing, answer, reconnect, and leave
traffic. Formula Frenzy correct-answer traffic is intentionally limited because public match state
does not expose answers.

## Scenarios

- Smoke: 2 players, 1 match, 30 seconds.
- Small: 20 players, 10 matches, 2 minutes.
- Stress: 100 players, 50 matches, 5 minutes by default. Increase toward 500 players and
  250 matches only on a machine intended for stress testing.

The runner prints a JSON summary with command and reconnect counts. With `--metrics-out`, it also
captures the final `/metrics` scrape for baseline comparison.

## Interpreting Results

Focus first on p95 latency and saturation signals:

- `mathwar_socket_command_duration_seconds` shows command cost by command.
- `mathwar_repository_operation_duration_seconds{operation="update"}` shows PostgreSQL update cost.
- `mathwar_game_operation_duration_seconds{operation="resolve_shot"}` shows Equation Artillery
  simulation cost.
- `mathwar_event_loop_delay_p95_seconds` shows Node event-loop pressure.
- `mathwar_socket_commands_total{outcome="rejected"}` shows protocol and concurrency rejections.
- `mathwar_socket_active` and `mathwar_matches_active` show the server load reached during the run.

Compare future changes against the same scenario, machine, Node version, database location, commit,
and server mode.
