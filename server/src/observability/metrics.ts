import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
  type LabelValues,
} from 'prom-client';

export type SocketCommand =
  | 'room:create'
  | 'room:join'
  | 'match:fire'
  | 'formula:start'
  | 'formula:answer'
  | 'formula:hint'
  | 'formula:typing'
  | 'match:leave'
  | 'disconnect';

export type RepositoryOperation =
  | 'initialize'
  | 'create'
  | 'findByCode'
  | 'findById'
  | 'findActiveByUser'
  | 'update'
  | 'listExpiredReconnects'
  | 'markRoomEmpty'
  | 'clearRoomEmpty'
  | 'deleteEmptyBefore'
  | 'deleteFinishedBefore'
  | 'delete'
  | 'close';

export type GameOperation =
  | 'expression_compile'
  | 'resolve_shot'
  | 'formula_start'
  | 'formula_answer'
  | 'formula_hint';

export interface MathWarMetrics {
  readonly registry: Registry;
  readonly contentType: string;
  metrics(): Promise<string>;
  shutdown(): void;
  observeHttp(method: string, route: string, statusCode: number, durationSeconds: number): void;
  recordHealthCall(): void;
  recordGuestAuth(outcome: 'accepted' | 'rejected'): void;
  setActiveSockets(count: number): void;
  setActiveMatches(count: number): void;
  recordSocketConnection(): void;
  recordSocketDisconnect(reason: string): void;
  recordSocketAuthFailure(reason: 'missing_token' | 'invalid_token'): void;
  recordResumeCheck(outcome: 'hit' | 'miss'): void;
  recordReconnect(outcome: 'success' | 'failure'): void;
  recordSocketCommand(
    command: SocketCommand,
    outcome: 'accepted' | 'rejected',
    code: string,
    durationSeconds: number,
  ): void;
  observeRepository(
    operation: RepositoryOperation,
    outcome: 'ok' | 'error',
    durationSeconds: number,
  ): void;
  recordRepositoryUpdateResult(reason: 'ok' | 'duplicate' | 'stale' | 'missing'): void;
  observeGameOperation(
    game: 'equation-artillery' | 'formula-frenzy',
    operation: GameOperation,
    outcome: 'ok' | 'invalid' | 'error',
    durationSeconds: number,
  ): void;
  recordShot(impact: 'opponent' | 'wall' | 'bounds' | 'invalid', trailPoints: number): void;
  recordFormulaAnswer(outcome: 'correct' | 'wrong' | 'rejected'): void;
  observeCleanup(durationSeconds: number): void;
  recordCleanupDeleted(kind: 'empty' | 'finished', count: number): void;
}

const SECOND_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export function nowSeconds(): number {
  return performance.now() / 1000;
}

function activeHandleCount(): number {
  const processWithHandles = process as NodeJS.Process & {
    _getActiveHandles?: () => readonly unknown[];
  };
  return processWithHandles._getActiveHandles?.().length ?? 0;
}

export function routeMetricLabel(method: string, url: string): string {
  const path = url.split('?')[0] || '/';
  if (path === '/health') return '/health';
  if (path === '/healthz') return '/healthz';
  if (path === '/metrics') return '/metrics';
  if (path === '/api/auth/guest') return '/api/auth/guest';
  if (path === '/config.js') return '/config.js';
  if (path.startsWith('/api/')) return 'api_not_found';
  if (method === 'GET') return 'static';
  return 'not_found';
}

export function createMathWarMetrics(): MathWarMetrics {
  if (process.env['METRICS_ENABLED'] === 'false') return createNoopMathWarMetrics();

  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();

  const processUptime = new Gauge({
    name: 'mathwar_process_uptime_seconds',
    help: 'Node process uptime in seconds.',
    registers: [registry],
    collect() {
      this.set(process.uptime());
    },
  });
  void processUptime;

  const activeHandles = new Gauge({
    name: 'mathwar_process_active_handles',
    help: 'Number of active Node handles when available.',
    registers: [registry],
    collect() {
      this.set(activeHandleCount());
    },
  });
  void activeHandles;

  const eventLoopDelayP95 = new Gauge({
    name: 'mathwar_event_loop_delay_p95_seconds',
    help: 'Observed event-loop delay p95 in seconds since the last scrape.',
    registers: [registry],
    collect() {
      this.set(eventLoopDelay.percentile(95) / 1e9);
      eventLoopDelay.reset();
    },
  });
  void eventLoopDelayP95;

  const httpRequests = new Counter({
    name: 'mathwar_http_requests_total',
    help: 'Total HTTP requests by method, route, and status code.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const httpDuration = new Histogram({
    name: 'mathwar_http_request_duration_seconds',
    help: 'HTTP request duration by method and route.',
    labelNames: ['method', 'route'],
    buckets: SECOND_BUCKETS,
    registers: [registry],
  });
  const healthCalls = new Counter({
    name: 'mathwar_health_requests_total',
    help: 'Total health endpoint calls.',
    registers: [registry],
  });
  const guestAuthRequests = new Counter({
    name: 'mathwar_guest_auth_requests_total',
    help: 'Guest auth requests by outcome.',
    labelNames: ['outcome'],
    registers: [registry],
  });

  const activeSockets = new Gauge({
    name: 'mathwar_socket_active',
    help: 'Currently connected Socket.IO sockets.',
    registers: [registry],
  });
  const socketConnections = new Counter({
    name: 'mathwar_socket_connections_total',
    help: 'Total accepted Socket.IO connections.',
    registers: [registry],
  });
  const socketDisconnects = new Counter({
    name: 'mathwar_socket_disconnects_total',
    help: 'Total Socket.IO disconnects by reason.',
    labelNames: ['reason'],
    registers: [registry],
  });
  const socketAuthFailures = new Counter({
    name: 'mathwar_socket_auth_failures_total',
    help: 'Socket.IO authentication failures by reason.',
    labelNames: ['reason'],
    registers: [registry],
  });
  const resumeChecks = new Counter({
    name: 'mathwar_socket_resume_checks_total',
    help: 'Socket resume checks for active matches on connection.',
    labelNames: ['outcome'],
    registers: [registry],
  });
  const reconnects = new Counter({
    name: 'mathwar_socket_reconnects_total',
    help: 'Actual paused-match reconnect outcomes.',
    labelNames: ['outcome'],
    registers: [registry],
  });
  const socketCommands = new Counter({
    name: 'mathwar_socket_commands_total',
    help: 'Socket.IO command outcomes.',
    labelNames: ['command', 'outcome', 'code'],
    registers: [registry],
  });
  const socketCommandDuration = new Histogram({
    name: 'mathwar_socket_command_duration_seconds',
    help: 'Socket.IO command handler duration.',
    labelNames: ['command', 'outcome'],
    buckets: SECOND_BUCKETS,
    registers: [registry],
  });

  const activeMatches = new Gauge({
    name: 'mathwar_matches_active',
    help: 'Active match rooms observed by this server process.',
    registers: [registry],
  });
  const repositoryOperations = new Counter({
    name: 'mathwar_repository_operations_total',
    help: 'Repository operation count by operation and outcome.',
    labelNames: ['operation', 'outcome'],
    registers: [registry],
  });
  const repositoryDuration = new Histogram({
    name: 'mathwar_repository_operation_duration_seconds',
    help: 'Repository operation duration by operation and outcome.',
    labelNames: ['operation', 'outcome'],
    buckets: SECOND_BUCKETS,
    registers: [registry],
  });
  const repositoryUpdateResults = new Counter({
    name: 'mathwar_repository_update_results_total',
    help: 'Repository update results.',
    labelNames: ['reason'],
    registers: [registry],
  });

  const gameOperations = new Histogram({
    name: 'mathwar_game_operation_duration_seconds',
    help: 'Game operation duration.',
    labelNames: ['game', 'operation', 'outcome'],
    buckets: SECOND_BUCKETS,
    registers: [registry],
  });
  const shots = new Counter({
    name: 'mathwar_equation_artillery_shots_total',
    help: 'Equation Artillery shots by impact.',
    labelNames: ['impact'],
    registers: [registry],
  });
  const shotTrailPoints = new Histogram({
    name: 'mathwar_equation_artillery_shot_trail_points',
    help: 'Equation Artillery shot trail point count.',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 1500],
    registers: [registry],
  });
  const formulaAnswers = new Counter({
    name: 'mathwar_formula_frenzy_answers_total',
    help: 'Formula Frenzy answers by outcome.',
    labelNames: ['outcome'],
    registers: [registry],
  });

  const cleanupDuration = new Histogram({
    name: 'mathwar_cleanup_sweep_duration_seconds',
    help: 'Cleanup sweep duration.',
    buckets: SECOND_BUCKETS,
    registers: [registry],
  });
  const cleanupDeleted = new Counter({
    name: 'mathwar_cleanup_deleted_matches_total',
    help: 'Cleanup deleted match count by kind.',
    labelNames: ['kind'],
    registers: [registry],
  });

  function labels(values: LabelValues<string>): LabelValues<string> {
    return values;
  }

  return {
    registry,
    contentType: registry.contentType,
    metrics: () => registry.metrics(),
    shutdown() {
      eventLoopDelay.disable();
    },
    observeHttp(method, route, statusCode, durationSeconds) {
      httpRequests.inc(labels({ method, route, status_code: String(statusCode) }));
      httpDuration.observe(labels({ method, route }), durationSeconds);
    },
    recordHealthCall() {
      healthCalls.inc();
    },
    recordGuestAuth(outcome) {
      guestAuthRequests.inc(labels({ outcome }));
    },
    setActiveSockets(count) {
      activeSockets.set(count);
    },
    setActiveMatches(count) {
      activeMatches.set(count);
    },
    recordSocketConnection() {
      socketConnections.inc();
    },
    recordSocketDisconnect(reason) {
      socketDisconnects.inc(labels({ reason }));
    },
    recordSocketAuthFailure(reason) {
      socketAuthFailures.inc(labels({ reason }));
    },
    recordResumeCheck(outcome) {
      resumeChecks.inc(labels({ outcome }));
    },
    recordReconnect(outcome) {
      reconnects.inc(labels({ outcome }));
    },
    recordSocketCommand(command, outcome, code, durationSeconds) {
      socketCommands.inc(labels({ command, outcome, code }));
      socketCommandDuration.observe(labels({ command, outcome }), durationSeconds);
    },
    observeRepository(operation, outcome, durationSeconds) {
      repositoryOperations.inc(labels({ operation, outcome }));
      repositoryDuration.observe(labels({ operation, outcome }), durationSeconds);
    },
    recordRepositoryUpdateResult(reason) {
      repositoryUpdateResults.inc(labels({ reason }));
    },
    observeGameOperation(game, operation, outcome, durationSeconds) {
      gameOperations.observe(labels({ game, operation, outcome }), durationSeconds);
    },
    recordShot(impact, trailPoints) {
      shots.inc(labels({ impact }));
      shotTrailPoints.observe(trailPoints);
    },
    recordFormulaAnswer(outcome) {
      formulaAnswers.inc(labels({ outcome }));
    },
    observeCleanup(durationSeconds) {
      cleanupDuration.observe(durationSeconds);
    },
    recordCleanupDeleted(kind, count) {
      cleanupDeleted.inc(labels({ kind }), count);
    },
  };
}

function createNoopMathWarMetrics(): MathWarMetrics {
  const registry = new Registry();
  return {
    registry,
    contentType: registry.contentType,
    metrics: () => registry.metrics(),
    shutdown() {},
    observeHttp() {},
    recordHealthCall() {},
    recordGuestAuth() {},
    setActiveSockets() {},
    setActiveMatches() {},
    recordSocketConnection() {},
    recordSocketDisconnect() {},
    recordSocketAuthFailure() {},
    recordResumeCheck() {},
    recordReconnect() {},
    recordSocketCommand() {},
    observeRepository() {},
    recordRepositoryUpdateResult() {},
    observeGameOperation() {},
    recordShot() {},
    recordFormulaAnswer() {},
    observeCleanup() {},
    recordCleanupDeleted() {},
  };
}
