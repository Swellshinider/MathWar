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
rtk npm run load:formula
rtk npm run load:artillery
rtk npm run load:reconnect
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

Use `--game formula-frenzy` or `rtk npm run load:formula` to exercise Formula Frenzy start,
typing, answer, reconnect, and leave traffic. Formula Frenzy correct-answer traffic is not
available from public state because answers are intentionally hidden from clients, so this runner
uses controlled wrong answers by default. That stresses validation, state updates, wrong-answer
rejections, restart flow, and repository writes, but it is not a successful-answer scoring test.

## Scenarios

- Smoke: 2 players, 1 match, 30 seconds.
- Small: 20 players, 10 matches, 2 minutes.
- Stress: 100 players, 50 matches, 5 minutes by default. Increase toward 500 players and
  250 matches only on a machine intended for stress testing.
- Formula: Formula Frenzy gameplay traffic with typing and answer commands.
- Artillery: Equation Artillery `match:fire` traffic using safe equation inputs.
- Reconnect: Equation Artillery gameplay plus same-token reconnect attempts.

The runner prints a JSON summary with command counts, acknowledgement breakdowns, latency
percentiles, reconnect results, and post-run socket metrics. With `--metrics-out`, it also captures
the final `/metrics` scrape for baseline comparison.

## Gameplay Commands

Formula Frenzy options:

```bash
rtk npm run load:formula -- \
  --players 100 \
  --matches 50 \
  --duration 60s \
  --formula-answer-rate-per-player-per-second 1 \
  --formula-typing-rate-per-player-per-second 0.5 \
  --wrong-answer-ratio 1
```

Equation Artillery options:

```bash
rtk npm run load:artillery -- \
  --players 100 \
  --matches 50 \
  --duration 60s \
  --artillery-fire-rate-per-match-per-second 1
```

Reconnect options:

```bash
rtk npm run load:reconnect -- \
  --players 100 \
  --matches 50 \
  --duration 60s \
  --reconnect-ratio 0.1 \
  --reconnect-delay-ms 2000 \
  --reconnects-per-selected-player 1
```

Warm-up, duration, cooldown, and metrics scrape options:

```bash
rtk npm run load:formula -- \
  --warmup 5s \
  --duration 60s \
  --cooldown 5s \
  --metrics-url http://127.0.0.1:3000/metrics \
  --metrics-out artifacts/mathwar.prom \
  --json-out artifacts/mathwar-load.json
```

Reliable scaling runs should start from a fresh server process or clearly identify the run in logs.
Do not add run IDs to Prometheus labels.

## Scaling Ladder

Run the same scenario and machine profile at increasing size:

```bash
rtk npm run load:formula -- --players 100 --matches 50 --duration 60s
rtk npm run load:formula -- --players 250 --matches 125 --duration 120s
rtk npm run load:formula -- --players 500 --matches 250 --duration 300s
rtk npm run load:formula -- --players 1000 --matches 500 --duration 600s
```

Repeat the ladder with `load:artillery` when measuring Equation Artillery shot resolution.

## Interpreting Results

Focus first on p95 latency and saturation signals:

- `mathwar_socket_command_duration_seconds` shows command cost by command.
- `mathwar_repository_operation_duration_seconds{operation="update"}` shows PostgreSQL update cost.
- `mathwar_game_operation_duration_seconds{operation="resolve_shot"}` shows Equation Artillery
  simulation cost.
- `mathwar_event_loop_delay_p95_seconds` shows Node event-loop pressure.
- `mathwar_socket_commands_total{outcome="rejected"}` shows protocol and concurrency rejections.
- `mathwar_socket_active` and `mathwar_matches_active` show the server load reached during the run.
- `postRunMetrics.socketActive` should return to `0` after cooldown. If it does not, inspect
  whether clients failed to disconnect, the metric update is stale, Socket.IO lifecycle handling is
  wrong, or the metrics scrape happened too early.

Compare future changes against the same scenario, machine, Node version, database location, commit,
and server mode.
