import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { io, Socket } from 'socket.io-client';

export type GameMode = 'equation-artillery' | 'formula-frenzy';
export type ScenarioName =
  | 'smoke'
  | 'small'
  | 'stress'
  | 'custom'
  | 'formula'
  | 'artillery'
  | 'reconnect';
export type CommandEvent =
  | 'room:create'
  | 'room:join'
  | 'formula:start'
  | 'formula:answer'
  | 'formula:typing'
  | 'match:fire'
  | 'match:leave'
  | 'reconnect';

export interface Options {
  readonly url: string;
  readonly players: number;
  readonly matches: number;
  readonly rampUpMs: number;
  readonly warmupMs: number;
  readonly durationMs: number;
  readonly cooldownMs: number;
  readonly game: GameMode;
  readonly scenario: ScenarioName;
  readonly dryRun: boolean;
  readonly formulaAnswerRatePerPlayerPerSecond: number;
  readonly formulaTypingRatePerPlayerPerSecond: number;
  readonly wrongAnswerRatio: number;
  readonly artilleryFireRatePerMatchPerSecond: number;
  readonly reconnectRatio: number;
  readonly reconnectDelayMs: number;
  readonly reconnectsPerSelectedPlayer: number;
  readonly scrapeMetrics: boolean;
  readonly metricsUrl: string;
  readonly metricsOut?: string;
  readonly jsonOut?: string;
}

interface GuestSession {
  readonly token: string;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
  };
}

interface CommandAck<T = unknown> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly code?: string;
}

interface MatchStateLike {
  readonly id?: string;
  readonly roomCode?: string;
  readonly version?: number;
  readonly status?: string;
  readonly turnUserId?: string | null;
  readonly gameId?: GameMode;
}

interface Participant {
  socket: Socket;
  readonly token: string;
  readonly userId: string;
  readonly role: 'host' | 'guest';
}

interface MatchRunner {
  readonly index: number;
  readonly game: GameMode;
  readonly host: Participant;
  readonly guest: Participant;
  readonly tracker: VersionTracker;
  readonly reconnectTargets: Participant[];
  nextReconnectAt: number;
  reconnectsRun: number;
  nextFormulaAnswerAt: number;
  nextFormulaTypingAt: number;
  nextArtilleryFireAt: number;
}

export interface PostRunMetrics {
  readonly socketActive: number | null;
  readonly socketConnectionsTotal: number | null;
  readonly socketDisconnectsTotal: number | null;
}

export interface LoadSummary {
  readonly scenario: ScenarioName;
  readonly url: string;
  readonly players: number;
  readonly matches: number;
  readonly game: GameMode;
  readonly warmupMs: number;
  readonly durationMs: number;
  readonly cooldownMs: number;
  readonly elapsedMs: number;
  readonly commands: number;
  readonly commandsByEvent: Record<string, number>;
  readonly acksByEvent: Record<string, Record<string, number>>;
  readonly acksByResult: Record<string, number>;
  readonly formula: {
    readonly answersSent: number;
    readonly correctAnswersAccepted: number;
    readonly wrongAnswersRejected: number;
    readonly staleAnswers: number;
    readonly timeouts: number;
  };
  readonly artillery: {
    readonly shotsSent: number;
    readonly shotsAccepted: number;
    readonly invalidShots: number;
    readonly staleShots: number;
  };
  readonly reconnects: {
    readonly attempted: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly matchesPaused: number;
    readonly matchesResumed: number;
  };
  readonly latencyMs: {
    readonly auth: LatencySummary;
    readonly socketCommandAck: LatencySummary;
    readonly reconnect: LatencySummary;
    readonly byEvent: Record<string, LatencySummary>;
  };
  readonly postRunMetrics: PostRunMetrics;
  readonly warnings: string[];
  readonly errors: string[];
}

export interface LatencySummary {
  readonly count: number;
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

const SCENARIOS: Record<ScenarioName, Partial<Options>> = {
  smoke: {
    players: 2,
    matches: 1,
    rampUpMs: 1_000,
    durationMs: 30_000,
    game: 'equation-artillery',
  },
  small: {
    players: 20,
    matches: 10,
    rampUpMs: 10_000,
    durationMs: 120_000,
    game: 'equation-artillery',
  },
  stress: {
    players: 100,
    matches: 50,
    rampUpMs: 60_000,
    durationMs: 300_000,
    game: 'equation-artillery',
  },
  custom: {
    players: 2,
    matches: 1,
    rampUpMs: 1_000,
    durationMs: 30_000,
    game: 'equation-artillery',
  },
  formula: {
    players: 100,
    matches: 50,
    rampUpMs: 30_000,
    durationMs: 60_000,
    game: 'formula-frenzy',
  },
  artillery: {
    players: 100,
    matches: 50,
    rampUpMs: 30_000,
    durationMs: 60_000,
    game: 'equation-artillery',
  },
  reconnect: {
    players: 100,
    matches: 50,
    rampUpMs: 30_000,
    durationMs: 60_000,
    game: 'equation-artillery',
    reconnectRatio: 0.1,
  },
};

const DEFAULT_OPTIONS: Omit<Options, 'url' | 'scenario' | 'metricsUrl'> = {
  players: 2,
  matches: 1,
  rampUpMs: 1_000,
  warmupMs: 5_000,
  durationMs: 30_000,
  cooldownMs: 5_000,
  game: 'equation-artillery',
  dryRun: false,
  formulaAnswerRatePerPlayerPerSecond: 1,
  formulaTypingRatePerPlayerPerSecond: 0.5,
  wrongAnswerRatio: 1,
  artilleryFireRatePerMatchPerSecond: 1,
  reconnectRatio: 0.1,
  reconnectDelayMs: 2_000,
  reconnectsPerSelectedPlayer: 1,
  scrapeMetrics: true,
};

const EQUATIONS = [
  'x',
  'sin(x)',
  'cos(x)',
  '0.5*x',
  'x/2',
  'sqrt(abs(x))',
  'tan(x)',
  'log(abs(x)+1)',
];

export class VersionTracker {
  private latestVersion = 0;
  private status: string | null = null;
  private turnUserId: string | null = null;
  private matchId: string | null = null;
  private roomCode: string | null = null;

  update(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const state = value as MatchStateLike;
    const incomingVersion = Number.isInteger(state.version) ? state.version! : null;
    if (incomingVersion !== null && incomingVersion < this.latestVersion) return;
    if (incomingVersion !== null) this.latestVersion = incomingVersion;
    if (typeof state.status === 'string') this.status = state.status;
    if ('turnUserId' in state) this.turnUserId = state.turnUserId ?? null;
    if (typeof state.id === 'string') this.matchId = state.id;
    if (typeof state.roomCode === 'string') this.roomCode = state.roomCode;
  }

  get version(): number {
    return this.latestVersion;
  }

  get currentStatus(): string | null {
    return this.status;
  }

  get currentTurnUserId(): string | null {
    return this.turnUserId;
  }

  get currentMatchId(): string | null {
    return this.matchId;
  }

  get currentRoomCode(): string | null {
    return this.roomCode;
  }
}

export class LoadStats {
  readonly commandsByEvent: Record<string, number> = {};
  readonly acksByEvent: Record<string, Record<string, number>> = {};
  readonly acksByResult: Record<string, number> = {};
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  readonly authLatencies: number[] = [];
  readonly commandLatencies: number[] = [];
  readonly reconnectLatencies: number[] = [];
  readonly eventLatencies = new Map<string, number[]>();
  formulaAnswersSent = 0;
  formulaCorrectAccepted = 0;
  formulaWrongRejected = 0;
  formulaStaleAnswers = 0;
  formulaTimeouts = 0;
  artilleryShotsSent = 0;
  artilleryShotsAccepted = 0;
  artilleryInvalidShots = 0;
  artilleryStaleShots = 0;
  reconnectAttempted = 0;
  reconnectSucceeded = 0;
  reconnectFailed = 0;
  matchesPaused = 0;
  matchesResumed = 0;

  recordCommand(event: CommandEvent): void {
    this.commandsByEvent[event] = (this.commandsByEvent[event] ?? 0) + 1;
  }

  recordAck(event: CommandEvent, result: string, latencyMs: number): void {
    const byEvent = (this.acksByEvent[event] ??= {});
    byEvent[result] = (byEvent[result] ?? 0) + 1;
    this.acksByResult[result] = (this.acksByResult[result] ?? 0) + 1;
    this.commandLatencies.push(latencyMs);
    const eventLatencies = this.eventLatencies.get(event) ?? [];
    eventLatencies.push(latencyMs);
    this.eventLatencies.set(event, eventLatencies);
  }

  get commands(): number {
    return Object.values(this.commandsByEvent).reduce((sum, count) => sum + count, 0);
  }
}

export function latencySummary(values: readonly number[]): LatencySummary {
  if (!values.length) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((first, second) => first - second);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    avg: round(sum / sorted.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    max: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePrometheusMetric(metrics: string, name: string): number | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedName}(?:\\{[^}]*\\})?\\s+(-?\\d+(?:\\.\\d+)?)$`, 'm');
  const match = pattern.exec(metrics);
  return match ? Number(match[1]) : null;
}

export function parsePostRunMetrics(metrics: string): PostRunMetrics {
  return {
    socketActive: parsePrometheusMetric(metrics, 'mathwar_socket_active'),
    socketConnectionsTotal: parsePrometheusMetric(metrics, 'mathwar_socket_connections_total'),
    socketDisconnectsTotal: labeledCounterSum(metrics, 'mathwar_socket_disconnects_total'),
  };
}

export function versionedPayload(
  tracker: VersionTracker,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return versionedPayloadForVersion(tracker.version, payload);
}

export function versionedPayloadForVersion(
  expectedVersion: number,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    commandId: randomUUID(),
    expectedVersion,
    ...payload,
  };
}

export function reconnectTokenFor(participant: Pick<Participant, 'token'>): string {
  return participant.token;
}

function labeledCounterSum(metrics: string, name: string): number | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [
    ...metrics.matchAll(new RegExp(`^${escapedName}\\{[^}]*\\}\\s+(-?\\d+(?:\\.\\d+)?)$`, 'gm')),
  ];
  if (!matches.length) return parsePrometheusMetric(metrics, name);
  return matches.reduce((sum, match) => sum + Number(match[1]), 0);
}

export function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      values.set(rawKey, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      values.set(rawKey, true);
      continue;
    }
    values.set(rawKey, next);
    index += 1;
  }

  const scenario = stringValue(values, 'scenario', 'smoke') as ScenarioName;
  if (!SCENARIOS[scenario]) throw new Error(`Unknown scenario: ${scenario}`);
  const defaults = { ...DEFAULT_OPTIONS, ...SCENARIOS[scenario] };
  const url = stringValue(values, 'url', 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const matches = numberValue(values, 'matches', defaults.matches);
  const players = numberValue(values, 'players', Math.max(defaults.players, matches * 2));
  const game = stringValue(values, 'game', defaults.game) as GameMode;

  return {
    url,
    players,
    matches,
    rampUpMs: durationValue(values, 'ramp-up', 'ramp-up-ms', defaults.rampUpMs),
    warmupMs: durationValue(values, 'warmup', 'warmup-ms', defaults.warmupMs),
    durationMs: durationValue(values, 'duration', 'duration-ms', defaults.durationMs),
    cooldownMs: durationValue(values, 'cooldown', 'cooldown-ms', defaults.cooldownMs),
    game,
    scenario,
    dryRun: values.has('dry-run'),
    formulaAnswerRatePerPlayerPerSecond: floatValue(
      values,
      'formula-answer-rate-per-player-per-second',
      defaults.formulaAnswerRatePerPlayerPerSecond,
    ),
    formulaTypingRatePerPlayerPerSecond: floatValue(
      values,
      'formula-typing-rate-per-player-per-second',
      defaults.formulaTypingRatePerPlayerPerSecond,
    ),
    wrongAnswerRatio: floatValue(values, 'wrong-answer-ratio', defaults.wrongAnswerRatio),
    artilleryFireRatePerMatchPerSecond: floatValue(
      values,
      'artillery-fire-rate-per-match-per-second',
      defaults.artilleryFireRatePerMatchPerSecond,
    ),
    reconnectRatio: floatValue(values, 'reconnect-ratio', defaults.reconnectRatio),
    reconnectDelayMs: durationValue(
      values,
      'reconnect-delay',
      'reconnect-delay-ms',
      defaults.reconnectDelayMs,
    ),
    reconnectsPerSelectedPlayer: numberValue(
      values,
      'reconnects-per-selected-player',
      defaults.reconnectsPerSelectedPlayer,
    ),
    scrapeMetrics: !values.has('no-metrics'),
    metricsUrl: stringValue(values, 'metrics-url', `${url}/metrics`).replace(/\/+$/, ''),
    metricsOut: optionalString(values, 'metrics-out'),
    jsonOut: optionalString(values, 'json-out'),
  };
}

function stringValue(values: Map<string, string | boolean>, key: string, fallback: string): string {
  const value = values.get(key);
  return typeof value === 'string' ? value : fallback;
}

function optionalString(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === 'string' ? value : undefined;
}

function numberValue(values: Map<string, string | boolean>, key: string, fallback: number): number {
  return Math.floor(floatValue(values, key, fallback));
}

function floatValue(values: Map<string, string | boolean>, key: string, fallback: number): number {
  const value = values.get(key);
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${key}: ${value}`);
  return parsed;
}

function durationValue(
  values: Map<string, string | boolean>,
  secondsKey: string,
  millisecondsKey: string,
  fallback: number,
): number {
  const explicitMs = values.get(millisecondsKey);
  if (typeof explicitMs === 'string') return parseDuration(explicitMs);
  const duration = values.get(secondsKey);
  return typeof duration === 'string' ? parseDuration(duration) : fallback;
}

function parseDuration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';
  if (unit === 'm') return Math.floor(amount * 60_000);
  if (unit === 's') return Math.floor(amount * 1_000);
  return Math.floor(amount);
}

export function assertOptions(options: Options): void {
  if (options.matches < 1) throw new Error('--matches must be at least 1');
  if (options.players < options.matches * 2) {
    throw new Error('--players must be at least two times --matches');
  }
  if (options.game !== 'equation-artillery' && options.game !== 'formula-frenzy') {
    throw new Error('--game must be equation-artillery or formula-frenzy');
  }
}

async function createGuest(url: string, index: number, stats: LoadStats): Promise<GuestSession> {
  const start = performance.now();
  const response = await fetch(`${url}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: `Load Player ${index + 1}` }),
  });
  stats.authLatencies.push(performance.now() - start);
  if (!response.ok) throw new Error(`Guest auth failed with HTTP ${response.status}`);
  return (await response.json()) as GuestSession;
}

async function connect(
  url: string,
  token: string,
  configure?: (socket: Socket) => void,
): Promise<Socket> {
  const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  configure?.(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function emitAck<T>(
  stats: LoadStats,
  socket: Socket,
  event: CommandEvent,
  payload: unknown,
  timeoutMs = 5_000,
): Promise<CommandAck<T>> {
  stats.recordCommand(event);
  const start = performance.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const latency = performance.now() - start;
      stats.recordAck(event, 'timeout', latency);
      if (event === 'formula:answer') stats.formulaTimeouts += 1;
      resolve({ ok: false, code: 'TIMEOUT', error: `${event} timed out` });
    }, timeoutMs);
    socket.emit(event, payload, (response: CommandAck<T>) => {
      clearTimeout(timer);
      const latency = performance.now() - start;
      stats.recordAck(event, ackResult(response), latency);
      resolve(response);
    });
  });
}

function ackResult(response: CommandAck): string {
  if (response.ok) return 'ok';
  const code = response.code?.toLowerCase() ?? 'error';
  if (code === 'invalid_command') return 'invalid';
  return code;
}

function attachStateTracking(match: MatchRunner, participant: Participant, stats: LoadStats): void {
  for (const event of ['room:state', 'match:state', 'formula:state', 'match:started'] as const) {
    participant.socket.on(event, (state: MatchStateLike) => {
      const previousStatus = match.tracker.currentStatus;
      match.tracker.update(state);
      if (previousStatus === 'active' && state.status === 'paused') stats.matchesPaused += 1;
      if (previousStatus === 'paused' && state.status === 'active') stats.matchesResumed += 1;
    });
  }
}

async function setupMatch(
  options: Options,
  stats: LoadStats,
  index: number,
  rampDelayMs: number,
): Promise<MatchRunner> {
  await wait(rampDelayMs);
  const hostIndex = index * 2;
  const guestIndex = hostIndex + 1;
  const [hostSession, guestSession] = await Promise.all([
    createGuest(options.url, hostIndex, stats),
    createGuest(options.url, guestIndex, stats),
  ]);
  const [hostSocket, guestSocket] = await Promise.all([
    connect(options.url, hostSession.token),
    connect(options.url, guestSession.token),
  ]);
  const tracker = new VersionTracker();
  const match: MatchRunner = {
    index,
    game: options.game,
    host: {
      socket: hostSocket,
      token: hostSession.token,
      userId: hostSession.user.id,
      role: 'host',
    },
    guest: {
      socket: guestSocket,
      token: guestSession.token,
      userId: guestSession.user.id,
      role: 'guest',
    },
    tracker,
    reconnectTargets: [],
    nextReconnectAt: 0,
    reconnectsRun: 0,
    nextFormulaAnswerAt: 0,
    nextFormulaTypingAt: 0,
    nextArtilleryFireAt: 0,
  };
  attachStateTracking(match, match.host, stats);
  attachStateTracking(match, match.guest, stats);

  const created = await emitAck<MatchStateLike>(
    stats,
    match.host.socket,
    'room:create',
    versionedPayloadForVersion(0, { gameId: options.game }),
  );
  if (!created.ok || !created.data) throw new Error(created.error ?? 'room:create failed');
  tracker.update(created.data);

  const joined = await emitAck<MatchStateLike>(
    stats,
    match.guest.socket,
    'room:join',
    versionedPayload(tracker, {
      roomCode: tracker.currentRoomCode ?? created.data.roomCode,
      gameId: options.game,
    }),
  );
  if (!joined.ok || !joined.data) throw new Error(joined.error ?? 'room:join failed');
  tracker.update(joined.data);

  if (options.game === 'formula-frenzy') {
    const started = await emitAck<MatchStateLike>(
      stats,
      match.host.socket,
      'formula:start',
      versionedPayload(tracker),
    );
    if (!started.ok || !started.data) throw new Error(started.error ?? 'formula:start failed');
    tracker.update(started.data);
  }

  if (index / options.matches < options.reconnectRatio) match.reconnectTargets.push(match.guest);
  return match;
}

async function exerciseFormula(
  match: MatchRunner,
  options: Options,
  stats: LoadStats,
  now: number,
): Promise<void> {
  if (match.tracker.currentStatus === 'ended') {
    const restarted = await emitAck<MatchStateLike>(
      stats,
      match.host.socket,
      'formula:start',
      versionedPayload(match.tracker),
    );
    if (restarted.data) match.tracker.update(restarted.data);
  }

  const typingInterval = rateIntervalMs(options.formulaTypingRatePerPlayerPerSecond);
  if (now >= match.nextFormulaTypingAt) {
    for (const participant of [match.host, match.guest]) {
      stats.recordCommand('formula:typing');
      participant.socket.emit('formula:typing', { input: String((now + match.index) % 10) });
    }
    match.nextFormulaTypingAt = now + typingInterval;
  }

  const answerInterval = rateIntervalMs(options.formulaAnswerRatePerPlayerPerSecond);
  if (now < match.nextFormulaAnswerAt || match.tracker.currentStatus !== 'active') return;

  for (const participant of [match.host, match.guest]) {
    stats.formulaAnswersSent += 1;
    const answer =
      options.wrongAnswerRatio >= 1 || Math.random() < options.wrongAnswerRatio ? 999_999 : 999_998;
    const response = await emitAck<MatchStateLike>(
      stats,
      participant.socket,
      'formula:answer',
      versionedPayload(match.tracker, {
        answer,
      }),
    );
    if (response.data) match.tracker.update(response.data);
    if (response.ok) stats.formulaCorrectAccepted += 1;
    else if (response.code === 'WRONG_ANSWER') stats.formulaWrongRejected += 1;
    else if (response.code === 'STALE') stats.formulaStaleAnswers += 1;
    if (match.tracker.currentStatus !== 'active') break;
  }
  match.nextFormulaAnswerAt = now + answerInterval;
}

async function exerciseArtillery(
  match: MatchRunner,
  options: Options,
  stats: LoadStats,
  now: number,
): Promise<void> {
  if (match.tracker.currentStatus !== 'active' || now < match.nextArtilleryFireAt) return;
  const shooter = match.tracker.currentTurnUserId === match.guest.userId ? match.guest : match.host;
  stats.artilleryShotsSent += 1;
  const response = await emitAck<MatchStateLike>(
    stats,
    shooter.socket,
    'match:fire',
    versionedPayload(match.tracker, {
      equation: EQUATIONS[stats.artilleryShotsSent % EQUATIONS.length],
    }),
  );
  if (response.data) match.tracker.update(response.data);
  if (response.ok) stats.artilleryShotsAccepted += 1;
  else if (response.code === 'INVALID_COMMAND') stats.artilleryInvalidShots += 1;
  else if (response.code === 'STALE') stats.artilleryStaleShots += 1;
  match.nextArtilleryFireAt = now + rateIntervalMs(options.artilleryFireRatePerMatchPerSecond);
}

async function maybeReconnect(
  match: MatchRunner,
  options: Options,
  stats: LoadStats,
  now: number,
): Promise<void> {
  if (!match.reconnectTargets.length) return;
  if (match.reconnectsRun >= options.reconnectsPerSelectedPlayer) return;
  if (now < match.nextReconnectAt) return;
  const target = match.reconnectTargets[0];
  stats.recordCommand('reconnect');
  stats.reconnectAttempted += 1;
  const start = performance.now();
  target.socket.disconnect();
  await wait(options.reconnectDelayMs);
  try {
    let restoredState = Promise.resolve(false);
    target.socket = await connect(options.url, reconnectTokenFor(target), (socket) => {
      target.socket = socket;
      attachStateTracking(match, target, stats);
      restoredState = waitForState(socket, options.reconnectDelayMs + 3_000);
    });
    const restored = await restoredState;
    stats.reconnectLatencies.push(performance.now() - start);
    if (restored) stats.reconnectSucceeded += 1;
    else {
      stats.reconnectFailed += 1;
      stats.warnings.push(`Reconnect did not receive restored state for match ${match.index}.`);
    }
  } catch (error) {
    stats.reconnectFailed += 1;
    stats.errors.push(error instanceof Error ? error.message : String(error));
  }
  match.reconnectsRun += 1;
  match.nextReconnectAt = now + options.durationMs;
}

function waitForState(socket: Socket, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    const done = (): void => {
      clearTimeout(timeout);
      resolve(true);
    };
    socket.once('room:state', done);
    socket.once('match:state', done);
  });
}

function rateIntervalMs(rate: number): number {
  return rate <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(1_000 / rate));
}

async function leaveAndDisconnect(
  matches: readonly MatchRunner[],
  stats: LoadStats,
): Promise<void> {
  await Promise.all(
    matches.map(async (match) => {
      if (!match.host.socket.connected) return;
      const response = await emitAck<MatchStateLike>(
        stats,
        match.host.socket,
        'match:leave',
        versionedPayload(match.tracker),
      );
      if (response.data) match.tracker.update(response.data);
      if (response.code === 'STALE') {
        stats.warnings.push(
          `match:leave returned STALE for match ${match.index}; latest version was ${match.tracker.version}.`,
        );
      }
    }),
  );
  for (const match of matches) {
    match.host.socket.disconnect();
    match.guest.socket.disconnect();
  }
}

export async function writeOutputFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function run(options: Options): Promise<LoadSummary> {
  assertOptions(options);
  const stats = new LoadStats();
  const runStartedAt = Date.now();
  const rampStep = options.matches > 1 ? options.rampUpMs / (options.matches - 1) : 0;
  const matches = await Promise.all(
    Array.from({ length: options.matches }, (_, index) =>
      setupMatch(options, stats, index, Math.floor(rampStep * index)),
    ),
  );

  await wait(options.warmupMs);
  const testDeadline = Date.now() + options.durationMs;
  while (Date.now() < testDeadline) {
    const now = Date.now();
    await Promise.all(
      matches.map(async (match) => {
        if (options.game === 'formula-frenzy') await exerciseFormula(match, options, stats, now);
        else await exerciseArtillery(match, options, stats, now);
        await maybeReconnect(match, options, stats, now);
      }),
    );
    await wait(50);
  }

  await leaveAndDisconnect(matches, stats);
  await wait(options.cooldownMs);

  let rawMetrics: string | null = null;
  let postRunMetrics: PostRunMetrics = {
    socketActive: null,
    socketConnectionsTotal: null,
    socketDisconnectsTotal: null,
  };
  if (options.scrapeMetrics) {
    rawMetrics = await fetch(options.metricsUrl).then((response) => response.text());
    postRunMetrics = parsePostRunMetrics(rawMetrics);
    if (postRunMetrics.socketActive !== 0) {
      stats.warnings.push(
        `mathwar_socket_active was ${postRunMetrics.socketActive} after cooldown.`,
      );
    }
  }

  const summary = createSummary(options, stats, Date.now() - runStartedAt, postRunMetrics);
  if (options.metricsOut && rawMetrics !== null)
    await writeOutputFile(options.metricsOut, rawMetrics);
  if (options.jsonOut)
    await writeOutputFile(options.jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function createSummary(
  options: Options,
  stats: LoadStats,
  elapsedMs: number,
  postRunMetrics: PostRunMetrics,
): LoadSummary {
  return {
    scenario: options.scenario,
    url: options.url,
    players: options.players,
    matches: options.matches,
    game: options.game,
    warmupMs: options.warmupMs,
    durationMs: options.durationMs,
    cooldownMs: options.cooldownMs,
    elapsedMs,
    commands: stats.commands,
    commandsByEvent: stats.commandsByEvent,
    acksByEvent: stats.acksByEvent,
    acksByResult: stats.acksByResult,
    formula: {
      answersSent: stats.formulaAnswersSent,
      correctAnswersAccepted: stats.formulaCorrectAccepted,
      wrongAnswersRejected: stats.formulaWrongRejected,
      staleAnswers: stats.formulaStaleAnswers,
      timeouts: stats.formulaTimeouts,
    },
    artillery: {
      shotsSent: stats.artilleryShotsSent,
      shotsAccepted: stats.artilleryShotsAccepted,
      invalidShots: stats.artilleryInvalidShots,
      staleShots: stats.artilleryStaleShots,
    },
    reconnects: {
      attempted: stats.reconnectAttempted,
      succeeded: stats.reconnectSucceeded,
      failed: stats.reconnectFailed,
      matchesPaused: stats.matchesPaused,
      matchesResumed: stats.matchesResumed,
    },
    latencyMs: {
      auth: latencySummary(stats.authLatencies),
      socketCommandAck: latencySummary(stats.commandLatencies),
      reconnect: latencySummary(stats.reconnectLatencies),
      byEvent: Object.fromEntries(
        [...stats.eventLatencies.entries()].map(([event, values]) => [
          event,
          latencySummary(values),
        ]),
      ),
    },
    postRunMetrics,
    warnings: stats.warnings,
    errors: stats.errors,
  };
}

export async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
