import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { io, Socket } from 'socket.io-client';

type GameMode = 'equation-artillery' | 'formula-frenzy';
type ScenarioName = 'smoke' | 'small' | 'stress' | 'custom';

interface Options {
  readonly url: string;
  readonly players: number;
  readonly matches: number;
  readonly rampUpMs: number;
  readonly durationMs: number;
  readonly game: GameMode;
  readonly scenario: ScenarioName;
  readonly dryRun: boolean;
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

interface MatchRunner {
  readonly host: Socket;
  guest: Socket;
  readonly guestToken: string;
  readonly roomCode: string;
  version: number;
  turn: 'host' | 'guest';
}

const SCENARIOS: Record<ScenarioName, Omit<Options, 'url' | 'scenario' | 'dryRun'>> = {
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
};

const EQUATIONS = ['0', 'x*0', '0.01*x*x', 'sin(x)', 'cos(x)'];

function parseArgs(argv: readonly string[]): Options {
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
  const defaults = SCENARIOS[scenario];
  const matches = numberValue(values, 'matches', defaults.matches);
  const players = numberValue(values, 'players', Math.max(defaults.players, matches * 2));

  return {
    url: stringValue(values, 'url', 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    players,
    matches,
    rampUpMs: numberValue(values, 'ramp-up-ms', defaults.rampUpMs),
    durationMs: numberValue(values, 'duration-ms', defaults.durationMs),
    game: stringValue(values, 'game', defaults.game) as GameMode,
    scenario,
    dryRun: values.has('dry-run'),
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
  const value = values.get(key);
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${key}: ${value}`);
  return Math.floor(parsed);
}

function assertOptions(options: Options): void {
  if (options.matches < 1) throw new Error('--matches must be at least 1');
  if (options.players < options.matches * 2) {
    throw new Error('--players must be at least two times --matches');
  }
  if (options.game !== 'equation-artillery' && options.game !== 'formula-frenzy') {
    throw new Error('--game must be equation-artillery or formula-frenzy');
  }
}

async function createGuest(url: string, index: number): Promise<GuestSession> {
  const response = await fetch(`${url}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: `Load Player ${index + 1}` }),
  });
  if (!response.ok) throw new Error(`Guest auth failed with HTTP ${response.status}`);
  return (await response.json()) as GuestSession;
}

async function connect(url: string, token: string): Promise<Socket> {
  const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

function emitAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupMatch(
  url: string,
  game: GameMode,
  hostIndex: number,
  guestIndex: number,
  rampDelayMs: number,
): Promise<MatchRunner> {
  await wait(rampDelayMs);
  const [hostSession, guestSession] = await Promise.all([
    createGuest(url, hostIndex),
    createGuest(url, guestIndex),
  ]);
  const [host, guest] = await Promise.all([
    connect(url, hostSession.token),
    connect(url, guestSession.token),
  ]);
  const created = await emitAck<{
    ok: boolean;
    data?: { roomCode: string; version: number };
    error?: string;
  }>(host, 'room:create', {
    commandId: randomUUID(),
    expectedVersion: 0,
    gameId: game,
  });
  if (!created.ok || !created.data) throw new Error(created.error ?? 'room:create failed');

  const joined = await emitAck<{ ok: boolean; data?: { version: number }; error?: string }>(
    guest,
    'room:join',
    {
      commandId: randomUUID(),
      expectedVersion: created.data.version,
      roomCode: created.data.roomCode,
      gameId: game,
    },
  );
  if (!joined.ok || !joined.data) throw new Error(joined.error ?? 'room:join failed');

  if (game === 'formula-frenzy') {
    const started = await emitAck<{ ok: boolean; data?: { version: number }; error?: string }>(
      host,
      'formula:start',
      {
        commandId: randomUUID(),
        expectedVersion: joined.data.version,
      },
    );
    if (!started.ok || !started.data) throw new Error(started.error ?? 'formula:start failed');
    return {
      host,
      guest,
      guestToken: guestSession.token,
      roomCode: created.data.roomCode,
      version: started.data.version,
      turn: 'host',
    };
  }

  return {
    host,
    guest,
    guestToken: guestSession.token,
    roomCode: created.data.roomCode,
    version: joined.data.version,
    turn: 'host',
  };
}

async function exerciseEquationArtillery(match: MatchRunner, iteration: number): Promise<void> {
  const socket = match.turn === 'host' ? match.host : match.guest;
  const response = await emitAck<{ ok: boolean; data?: { version: number }; code?: string }>(
    socket,
    'match:fire',
    {
      commandId: randomUUID(),
      expectedVersion: match.version,
      equation: EQUATIONS[iteration % EQUATIONS.length],
    },
  );
  if (response.ok && response.data) {
    match.version = response.data.version;
    match.turn = match.turn === 'host' ? 'guest' : 'host';
  }
}

async function exerciseFormulaFrenzy(match: MatchRunner, iteration: number): Promise<void> {
  const socket = iteration % 2 === 0 ? match.host : match.guest;
  socket.emit('formula:typing', { input: String(iteration % 10) });
  const response = await emitAck<{ ok: boolean; data?: { version: number }; code?: string }>(
    socket,
    'formula:answer',
    {
      commandId: randomUUID(),
      expectedVersion: match.version,
      answer: 999_999,
    },
  );
  if (response.data?.version) match.version = response.data.version;
}

async function reconnectGuest(url: string, match: MatchRunner): Promise<void> {
  match.guest.disconnect();
  await wait(250);
  match.guest = await connect(url, match.guestToken);
}

async function run(options: Options): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const rampStep = options.matches > 1 ? options.rampUpMs / (options.matches - 1) : 0;
  const matches = await Promise.all(
    Array.from({ length: options.matches }, (_, index) =>
      setupMatch(options.url, options.game, index * 2, index * 2 + 1, Math.floor(rampStep * index)),
    ),
  );

  let commands = 0;
  let reconnects = 0;
  let iteration = 0;
  const deadline = startedAt + options.durationMs;
  while (Date.now() < deadline) {
    await Promise.all(
      matches.map(async (match, index) => {
        if (options.game === 'formula-frenzy') {
          await exerciseFormulaFrenzy(match, iteration + index);
        } else {
          await exerciseEquationArtillery(match, iteration + index);
        }
        commands += 1;
      }),
    );
    if (iteration > 0 && iteration % 20 === 0) {
      await reconnectGuest(options.url, matches[iteration % matches.length]);
      reconnects += 1;
    }
    iteration += 1;
    await wait(500);
  }

  await Promise.all(
    matches.map((match) =>
      emitAck(match.host, 'match:leave', {
        commandId: randomUUID(),
        expectedVersion: match.version,
      }).catch(() => undefined),
    ),
  );
  matches.forEach((match) => {
    match.host.disconnect();
    match.guest.disconnect();
  });

  const summary = {
    scenario: options.scenario,
    game: options.game,
    url: options.url,
    players: options.players,
    matches: options.matches,
    durationMs: Date.now() - startedAt,
    commands,
    reconnects,
  };

  if (options.metricsOut) {
    const metrics = await fetch(`${options.url}/metrics`).then((response) => response.text());
    await writeFile(options.metricsOut, metrics);
  }
  if (options.jsonOut) {
    await writeFile(options.jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
  }
  return summary;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertOptions(options);
  if (options.dryRun) {
    console.log(JSON.stringify(options, null, 2));
    return;
  }
  const summary = await run(options);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
