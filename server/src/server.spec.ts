import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveShot } from '@math-war/game-engine';
import { Server as SocketServer } from 'socket.io';
import { io as createClient, Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountTokenVerifier } from './account-auth.js';
import { InMemoryAccountRepository } from './account-repository.js';
import { createGuestTokenIssuer, createGuestTokenVerifier } from './auth.js';
import { InMemoryMatchRepository } from './repository.js';
import { createMultiplayerServer } from './server.js';

interface Harness {
  readonly repository: InMemoryMatchRepository;
  readonly server: Awaited<ReturnType<typeof createMultiplayerServer>>;
  readonly url: string;
  readonly clients: Socket[];
}

const harnesses: Harness[] = [];

async function createHarness(
  reconnectWindowMs = 60_000,
  idleCleanupMs = 40,
  configureSocketAdapter?: (io: SocketServer) => Promise<{ close(): Promise<void> } | void>,
): Promise<Harness> {
  const repository = new InMemoryMatchRepository();
  const server = await createMultiplayerServer({
    repository,
    verifyToken: async (token) => ({ id: token, displayName: token }),
    issueGuestSession: createGuestTokenIssuer('test-secret'),
    allowedOrigin: '*',
    reconnectWindowMs,
    idleCleanupMs,
    sweepIntervalMs: 10,
    configureSocketAdapter,
  });
  const address = await server.listen(0, '127.0.0.1');
  const harness = { repository, server, url: address, clients: [] };
  harnesses.push(harness);
  return harness;
}

async function connect(harness: Harness, userId: string): Promise<Socket> {
  const socket = createClient(harness.url, { auth: { token: userId }, transports: ['websocket'] });
  harness.clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

function emit<T>(socket: Socket, event: string, command: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, command, resolve));
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

afterEach(async () => {
  while (harnesses.length) {
    const harness = harnesses.pop();
    harness?.clients.forEach((client) => client.disconnect());
    await harness?.server.close();
  }
});

describe('multiplayer socket server', () => {
  it('serves the browser app, runtime config, and SPA fallbacks', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'math-war-static-'));
    await writeFile(join(staticRoot, 'index.html'), '<html>MathWar</html>');
    await writeFile(join(staticRoot, 'main.js'), 'console.log("asset");');
    await writeFile(join(staticRoot, 'favicon.ico'), 'icon');
    await writeFile(join(staticRoot, 'config.js'), 'window.MATH_WAR_CONFIG = { legacy: true };');
    const repository = new InMemoryMatchRepository();
    const server = await createMultiplayerServer({
      repository,
      verifyToken: createGuestTokenVerifier('test-secret'),
      issueGuestSession: createGuestTokenIssuer('test-secret'),
      allowedOrigin: 'https://math-war.example',
      staticRoot,
      browserConfig: {
        serverUrl: 'https://math-war.example',
      },
    });
    harnesses.push({ repository, server, url: '', clients: [] });

    try {
      const config = await server.fastify.inject({ method: 'GET', url: '/config.js' });
      expect(config.headers['cache-control']).toBe('no-store');
      expect(config.headers['content-type']).toContain('application/javascript');
      expect(config.body).toContain('serverUrl');
      expect(config.body).not.toContain('supabase');
      expect(config.body).not.toContain('legacy');

      const asset = await server.fastify.inject({ method: 'GET', url: '/main.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain('asset');

      const favicon = await server.fastify.inject({ method: 'GET', url: '/favicon.ico' });
      expect(favicon.statusCode).toBe(200);
      expect(favicon.headers['content-type']).toContain('image/vnd.microsoft.icon');

      const route = await server.fastify.inject({
        method: 'GET',
        url: '/games/equation-artillery/multiplayer',
        headers: { accept: 'text/html' },
      });
      expect(route.statusCode).toBe(200);
      expect(route.body).toContain('MathWar');

      const health = await server.fastify.inject({ method: 'GET', url: '/healthz' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: 'ok' });
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it('creates guest sessions through the HTTP auth route', async () => {
    const harness = await createHarness();
    const response = await harness.server.fastify.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { displayName: 'Guest Player' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(String),
      user: {
        id: expect.any(String),
        displayName: 'Guest Player',
      },
    });
  });

  it('creates account sessions, rotates refresh tokens, and accepts account socket tokens', async () => {
    const repository = new InMemoryMatchRepository();
    const accountRepository = new InMemoryAccountRepository();
    const accountAccessSecret = 'account-access-secret-with-enough-length';
    const verifyGuestToken = createGuestTokenVerifier('test-secret');
    const verifyAccountToken = createAccountTokenVerifier(accountAccessSecret);
    const server = await createMultiplayerServer({
      repository,
      verifyToken: async (token) => {
        try {
          return await verifyGuestToken(token);
        } catch {
          return verifyAccountToken(token);
        }
      },
      issueGuestSession: createGuestTokenIssuer('test-secret'),
      accounts: {
        repository: accountRepository,
        accessTokenSecret: accountAccessSecret,
        refreshTokenSecret: 'account-refresh-secret-with-enough-length',
        refreshCookieSecure: false,
      },
      allowedOrigin: '*',
      reconnectWindowMs: 60_000,
      idleCleanupMs: 40,
      sweepIntervalMs: 10,
    });
    const address = await server.listen(0, '127.0.0.1');
    const harness = { repository, server, url: address, clients: [] };
    harnesses.push(harness);

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/api/account/register',
      payload: {
        username: 'Player_One',
        password: 'password123',
        displayName: 'Player One',
      },
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json();
    expect(createdBody).toMatchObject({
      accessToken: expect.any(String),
      user: {
        id: expect.any(String),
        username: 'player_one',
        displayName: 'Player One',
      },
    });
    expect(created.headers['set-cookie']).toContain('math-war-refresh-token=');

    const duplicate = await server.fastify.inject({
      method: 'POST',
      url: '/api/account/register',
      payload: {
        username: 'player_one',
        password: 'password123',
        displayName: 'Other',
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const available = await server.fastify.inject({
      method: 'GET',
      url: '/api/account/username-availability?username=new_player',
    });
    expect(available.statusCode).toBe(200);
    expect(available.json()).toEqual({ username: 'new_player', available: true });

    const unavailable = await server.fastify.inject({
      method: 'GET',
      url: '/api/account/username-availability?username=PLAYER_ONE',
    });
    expect(unavailable.statusCode).toBe(200);
    expect(unavailable.json()).toEqual({ username: 'player_one', available: false });

    const loggedIn = await server.fastify.inject({
      method: 'POST',
      url: '/api/account/login',
      payload: {
        username: 'PLAYER_ONE',
        password: 'password123',
      },
    });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().user.username).toBe('player_one');

    const refreshCookie = String(created.headers['set-cookie']).split(';')[0];
    const refreshed = await server.fastify.inject({
      method: 'POST',
      url: '/api/account/refresh',
      headers: { cookie: refreshCookie },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toMatchObject({
      accessToken: expect.any(String),
      user: {
        username: 'player_one',
        displayName: 'Player One',
      },
    });

    const profile = await server.fastify.inject({
      method: 'PATCH',
      url: '/api/account/profile',
      headers: { authorization: `Bearer ${refreshed.json().accessToken}` },
      payload: { displayName: 'Renamed Player' },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().displayName).toBe('Renamed Player');

    const socket = await connect(harness, refreshed.json().accessToken);
    expect(socket.connected).toBe(true);
  });

  it('rate limits repeated guest session attempts', async () => {
    const harness = await createHarness();
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await harness.server.fastify.inject({
          method: 'POST',
          url: '/api/auth/guest',
          payload: { displayName: `Guest ${index}` },
        }),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[10].statusCode).toBe(429);
  });

  it('exposes HTTP, auth, socket, and repository metrics', async () => {
    const harness = await createHarness();
    await harness.server.fastify.inject({ method: 'GET', url: '/healthz' });
    await harness.server.fastify.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: {},
    });
    await harness.server.fastify.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { displayName: 'Metrics Guest' },
    });

    const socket = await connect(harness, 'metrics-user');
    const rejected = await emit<{ ok: false; code: string }>(socket, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 2,
    });
    expect(rejected.code).toBe('INVALID_COMMAND');
    const created = await emit<{ ok: true }>(socket, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    expect(created.ok).toBe(true);

    const metrics = await harness.server.fastify.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('mathwar_http_requests_total');
    expect(metrics.body).toContain('route="/healthz",status_code="200"');
    expect(metrics.body).toContain('mathwar_guest_auth_requests_total{outcome="accepted"} 1');
    expect(metrics.body).toContain('mathwar_guest_auth_requests_total{outcome="rejected"} 1');
    expect(metrics.body).toContain(
      'mathwar_socket_commands_total{command="room:create",outcome="rejected",code="INVALID_COMMAND"} 1',
    );
    expect(metrics.body).toContain(
      'mathwar_socket_commands_total{command="room:create",outcome="accepted",code="OK"} 1',
    );
    expect(metrics.body).toContain(
      'mathwar_repository_operations_total{operation="create",outcome="ok"} 1',
    );
    expect(metrics.body).toContain('mathwar_socket_resume_checks_total{outcome="miss"}');
    expect(metrics.body).not.toContain('mathwar_socket_reconnects_total{outcome="attempt"}');
  });

  it('requires a bearer token for metrics when one is configured', async () => {
    const previousMetricsToken = process.env['METRICS_TOKEN'];
    process.env['METRICS_TOKEN'] = 'metrics-secret';
    const harness = await createHarness();

    try {
      const missing = await harness.server.fastify.inject({ method: 'GET', url: '/metrics' });
      expect(missing.statusCode).toBe(401);

      const wrong = await harness.server.fastify.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: 'Bearer wrong' },
      });
      expect(wrong.statusCode).toBe(401);

      const accepted = await harness.server.fastify.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: 'Bearer metrics-secret' },
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.body).toContain('mathwar_http_requests_total');
    } finally {
      if (previousMetricsToken === undefined) delete process.env['METRICS_TOKEN'];
      else process.env['METRICS_TOKEN'] = previousMetricsToken;
    }
  });

  it('requires authentication during the handshake', async () => {
    const harness = await createHarness();
    const socket = createClient(harness.url, { transports: ['websocket'] });
    harness.clients.push(socket);
    const message = await new Promise<string>((resolve) =>
      socket.once('connect_error', (error) => resolve(error.message)),
    );
    expect(message).toContain('Authentication required');
  });

  it('does not configure a socket adapter unless one is provided', async () => {
    const harness = await createHarness();

    expect(harness.server.io.sockets.adapter.constructor.name).toBe('Adapter');
  });

  it('configures and closes an injected socket adapter', async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const configure = vi.fn(async (io: SocketServer) => {
      expect(io).toBeInstanceOf(SocketServer);
      return { close };
    });
    const harness = await createHarness(60_000, 40, configure);

    expect(configure).toHaveBeenCalledTimes(1);
    await harness.server.close();
    harnesses.splice(harnesses.indexOf(harness), 1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('creates, joins, rejects unsafe commands, and resolves a character hit', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ ok: true; data: { roomCode: string; version: number } }>(
      left,
      'room:create',
      { commandId: randomUUID(), expectedVersion: 0 },
    );
    expect(created.ok).toBe(true);
    expect(created.data.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const startedPromise = once<{ version: number }>(left, 'match:started');
    const joined = await emit<{ ok: true; data: { version: number } }>(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });
    expect(joined.ok).toBe(true);
    const started = await startedPromise;

    const outOfTurn = await emit<{ ok: false; code: string }>(right, 'match:fire', {
      commandId: randomUUID(),
      expectedVersion: started.version,
      equation: '0',
    });
    expect(outOfTurn.code).toBe('OUT_OF_TURN');
    const stale = await emit<{ ok: false; code: string }>(left, 'match:fire', {
      commandId: randomUUID(),
      expectedVersion: 0,
      equation: '0',
    });
    expect(stale.code).toBe('STALE');

    const persisted = await harness.repository.findByCode(created.data.roomCode);
    expect(persisted).not.toBeNull();
    const cleared = await harness.repository.update(
      persisted!.id,
      persisted!.version,
      randomUUID(),
      (state) => ({
        ...state,
        walls: [],
        version: state.version + 1,
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(cleared.ok).toBe(true);
    const clearState = cleared.ok ? cleared.state : persisted!;
    let equation = '';
    for (let coefficient = -40; coefficient <= 40 && !equation; coefficient += 1) {
      const value = coefficient / 1000;
      const leftCharacter = clearState.characters.find((character) => character.id === 0)!;
      const rightCharacter = clearState.characters.find((character) => character.id === 3)!;
      const distance = rightCharacter.position.x - leftCharacter.position.x;
      const slope = (rightCharacter.position.y - leftCharacter.position.y) / distance;
      const candidate = `${value}x(x-${distance})+${slope}x`;
      if (resolveShot(clearState, 'left', 'probe', candidate).impact === 'opponent')
        equation = candidate;
    }
    expect(equation).not.toBe('');
    const shotPromise = once<{
      impact: string;
      shooterCharacterId: number;
      state: {
        status: string;
        winnerUserId: string | null;
        turnCharacterId: number;
        turnUserId: string | null;
        characters: { id: number; ownerUserId: string; alive: boolean }[];
      };
    }>(right, 'shot:resolved');
    const fired = await emit<{ ok: true }>(left, 'match:fire', {
      commandId: randomUUID(),
      expectedVersion: clearState.version,
      equation,
    });
    expect(fired.ok).toBe(true);
    const shot = await shotPromise;
    expect(shot.impact).toBe('opponent');
    expect(shot.shooterCharacterId).toBe(0);
    expect(shot.state).toMatchObject({ status: 'active', winnerUserId: null });
    expect(shot.state.turnUserId).toBe('right');
    expect(shot.state.characters).toContainEqual(
      expect.objectContaining({
        id: shot.state.turnCharacterId,
        ownerUserId: 'right',
        alive: true,
      }),
    );
  });

  it('returns the active match when a player tries to create another room', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });

    const rejected = await emit<{
      ok: false;
      code: string;
      data: { roomCode: string; gameId?: string };
    }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
      gameId: 'formula-frenzy',
    });

    expect(rejected.code).toBe('ALREADY_IN_MATCH');
    expect(rejected.data.roomCode).toBe(created.data.roomCode);
    expect(rejected.data.gameId ?? 'equation-artillery').toBe('equation-artillery');
  });

  it('runs a formula frenzy room with answers and opponent typing', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{
      ok: true;
      data: {
        gameId: 'formula-frenzy';
        roomCode: string;
        version: number;
        formulaPlayers: { userId: string; currentProblem: { prompt: string; answer?: number } }[];
      };
    }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
      gameId: 'formula-frenzy',
    });
    expect(created.ok).toBe(true);
    expect(created.data.gameId).toBe('formula-frenzy');
    expect(created.data.formulaPlayers).toEqual([]);

    const mismatched = await emit<{ ok: false; code: string }>(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
      gameId: 'equation-artillery',
    });
    expect(mismatched.code).toBe('ROOM_UNAVAILABLE');

    const joined = await emit<{
      ok: true;
      data: {
        status: string;
        version: number;
        formulaPlayers: {
          userId: string;
          currentProblem: { prompt: string; answer?: number };
        }[];
      };
    }>(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
      gameId: 'formula-frenzy',
    });
    expect(joined.ok).toBe(true);
    expect(joined.data.status).toBe('waiting');
    expect(joined.data.formulaPlayers).toEqual([]);

    const rejectedStart = await emit<{ ok: false; code: string }>(right, 'formula:start', {
      commandId: randomUUID(),
      expectedVersion: joined.data.version,
    });
    expect(rejectedStart.code).toBe('OUT_OF_TURN');

    const startedPromise = once<{
      gameId: 'formula-frenzy';
      formulaPlayers: {
        userId: string;
        currentProblem: { prompt: string; answer?: number };
      }[];
    }>(right, 'match:started');
    const startedResponse = await emit<{
      ok: true;
      data: {
        status: string;
        version: number;
        formulaPlayers: {
          userId: string;
          currentProblem: { prompt: string; answer?: number };
        }[];
      };
    }>(left, 'formula:start', {
      commandId: randomUUID(),
      expectedVersion: joined.data.version,
    });
    expect(startedResponse.ok).toBe(true);
    expect(startedResponse.data.status).toBe('active');
    const started = await startedPromise;
    expect(started.formulaPlayers[0].currentProblem.answer).toBeUndefined();
    let legacyFormulaStateEmitted = false;
    right.once('formula:state', () => {
      legacyFormulaStateEmitted = true;
    });

    const persisted = await harness.repository.findByCode(created.data.roomCode);
    const leftAnswer = persisted!.formulaPlayers.find((player) => player.userId === 'left')!
      .currentProblem.answer;
    const typingPromise = once<{ userId: string; input: string }>(right, 'formula:typing');
    left.emit('formula:typing', { input: String(leftAnswer).slice(0, 1) });
    await expect(typingPromise).resolves.toEqual({
      userId: 'left',
      input: String(leftAnswer).slice(0, 1),
    });

    const missed = await emit<{
      ok: false;
      code: string;
      data: {
        version: number;
        formulaPlayers: {
          userId: string;
          hearts: number;
          streak: number;
          currentProblem: { answer?: number };
        }[];
      };
    }>(left, 'formula:answer', {
      commandId: randomUUID(),
      expectedVersion: startedResponse.data.version,
      answer: 999999,
    });
    expect(missed.code).toBe('WRONG_ANSWER');
    const missedLeft = missed.data.formulaPlayers.find((player) => player.userId === 'left');
    expect(missedLeft).toMatchObject({ hearts: 2, streak: 0 });
    expect(missedLeft?.currentProblem.answer).toBeUndefined();

    const hinted = await emit<{
      ok: true;
      data: {
        version: number;
        formulaPlayers: {
          userId: string;
          hintsRemaining: number;
          currentHint: string | null;
          currentProblem: { answer?: number; hint?: string };
        }[];
      };
    }>(left, 'formula:hint', {
      commandId: randomUUID(),
      expectedVersion: missed.data.version,
    });
    const hintedLeft = hinted.data.formulaPlayers.find((player) => player.userId === 'left');
    expect(hintedLeft?.hintsRemaining).toBe(2);
    expect(hintedLeft?.currentHint).toEqual(expect.any(String));
    expect(hintedLeft?.currentProblem.answer).toBeUndefined();
    expect(hintedLeft?.currentProblem.hint).toBeUndefined();

    const answered = await emit<{
      ok: true;
      data: {
        formulaPlayers: {
          userId: string;
          score: number;
          totalCorrect: number;
          currentProblem: { answer?: number };
        }[];
      };
    }>(left, 'formula:answer', {
      commandId: randomUUID(),
      expectedVersion: hinted.data.version,
      answer: leftAnswer,
    });
    expect(answered.ok).toBe(true);
    const leftPlayer = answered.data.formulaPlayers.find((player) => player.userId === 'left');
    expect(leftPlayer?.score).toBeGreaterThan(100);
    expect(leftPlayer?.totalCorrect).toBe(1);
    expect(answered.data.formulaPlayers[0].currentProblem.answer).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(legacyFormulaStateEmitted).toBe(false);
  });

  it('ends a formula frenzy room when a player timer expires', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
      gameId: 'formula-frenzy',
    });
    await emit(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
      gameId: 'formula-frenzy',
    });
    const persisted = await harness.repository.findByCode(created.data.roomCode);
    const started = await emit<{ ok: true; data: { version: number } }>(left, 'formula:start', {
      commandId: randomUUID(),
      expectedVersion: persisted!.version,
    });
    await harness.repository.update(persisted!.id, started.data.version, randomUUID(), (state) => ({
      ...state,
      formulaPlayers:
        state.gameId === 'formula-frenzy'
          ? state.formulaPlayers.map((player) =>
              player.userId === 'left'
                ? {
                    ...player,
                    hearts: 1,
                    currentProblem: {
                      ...player.currentProblem,
                      startedAt: new Date(Date.now() - 60_000).toISOString(),
                    },
                  }
                : player,
            )
          : [],
      version: started.data.version + 1,
    }));

    const ended = once<{ reason: string; winnerUserId: string }>(right, 'match:ended');
    await emit(left, 'formula:hint', {
      commandId: randomUUID(),
      expectedVersion: started.data.version + 1,
    });

    await expect(ended).resolves.toMatchObject({ reason: 'timeout', winnerUserId: 'right' });
    const endedState = await harness.repository.findByCode(created.data.roomCode);
    const rejectedRestart = await emit<{ ok: false; code: string }>(right, 'formula:start', {
      commandId: randomUUID(),
      expectedVersion: endedState!.version,
    });
    expect(rejectedRestart.code).toBe('OUT_OF_TURN');
    const restarted = await emit<{ ok: true; data: { status: string; formulaPlayers: unknown[] } }>(
      left,
      'formula:start',
      {
        commandId: randomUUID(),
        expectedVersion: endedState!.version,
      },
    );
    expect(restarted.ok).toBe(true);
    expect(restarted.data.status).toBe('active');
    expect(restarted.data.formulaPlayers).toHaveLength(2);
  });

  it('accepts canonical, lowercase, and compact room codes when joining', async () => {
    const harness = await createHarness();
    const variants = [
      (roomCode: string) => roomCode,
      (roomCode: string) => roomCode.toLowerCase(),
      (roomCode: string) => roomCode.replace('-', ''),
    ];

    for (const [index, variant] of variants.entries()) {
      const left = await connect(harness, `left-${index}`);
      const right = await connect(harness, `right-${index}`);
      const created = await emit<{ ok: true; data: { roomCode: string } }>(left, 'room:create', {
        commandId: randomUUID(),
        expectedVersion: 0,
      });

      expect(created.data.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      const joined = await emit<{ ok: boolean }>(right, 'room:join', {
        commandId: randomUUID(),
        expectedVersion: 0,
        roomCode: variant(created.data.roomCode),
      });

      expect(joined.ok).toBe(true);
    }
  });

  it('allows joining a waiting room after the host reconnects', async () => {
    const harness = await createHarness();
    const host = await connect(harness, 'host');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    await connect(harness, 'host');
    const waitingState = await harness.repository.findByCode(created.data.roomCode);
    expect(waitingState).toMatchObject({ status: 'waiting', version: 1 });

    const guest = await connect(harness, 'guest');
    const joined = await emit<{ ok: boolean; code?: string; error?: string }>(guest, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });

    expect(joined).toMatchObject({ ok: true });
  });

  it('stores canonical room codes with the separator', async () => {
    const harness = await createHarness();
    const host = await connect(harness, 'host');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });

    expect(created.data.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(created.data.roomCode).toHaveLength(9);
    expect(await harness.repository.findByCode(created.data.roomCode)).not.toBeNull();
  });

  it('restores a paused match on reconnect and ends it after the deadline', async () => {
    const harness = await createHarness(40);
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ data: { roomCode: string } }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    await emit(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });
    right.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reconnected = await connect(harness, 'right');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const restored = await harness.repository.findByCode(created.data.roomCode);
    expect(restored?.status).toBe('active');
    reconnected.disconnect();
    const ended = await once<{ reason: string; winnerUserId: string }>(left, 'match:ended');
    expect(ended).toMatchObject({ reason: 'abandonment', winnerUserId: 'left' });
  });

  it('deletes an abandoned waiting room after the idle grace period', async () => {
    const harness = await createHarness();
    const host = await connect(harness, 'host');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    expect(created.ok).toBe(true);
    host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const remaining = await harness.repository.findByCode(created.data.roomCode);
    expect(remaining).toBeNull();
  });

  it('keeps an empty waiting room until the full idle grace period elapses', async () => {
    const harness = await createHarness(60_000, 120);
    const host = await connect(harness, 'host');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    expect(created.ok).toBe(true);

    host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const remaining = await harness.repository.findByCode(created.data.roomCode);
    expect(remaining).not.toBeNull();
  });

  it('keeps a room whose player is still connected past the idle grace period', async () => {
    const harness = await createHarness();
    const host = await connect(harness, 'host');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const remaining = await harness.repository.findByCode(created.data.roomCode);
    expect(remaining?.status).toBe('waiting');
    host.disconnect();
  });

  it('deletes a waiting room immediately when the host leaves', async () => {
    const harness = await createHarness(60_000, 60_000);
    const host = await connect(harness, 'host');
    const created = await emit<{
      ok: true;
      data: { id: string; roomCode: string; version: number };
    }>(host, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });

    const left = await emit<{ ok: boolean; data?: { winnerUserId: string | null } }>(
      host,
      'match:leave',
      {
        commandId: randomUUID(),
        expectedVersion: created.data.version,
      },
    );

    expect(left).toMatchObject({ ok: true, data: { winnerUserId: null } });
    expect(await harness.repository.findByCode(created.data.roomCode)).toBeNull();
    expect(harness.server.io.sockets.adapter.rooms.get(`match:${created.data.id}`)).toBeUndefined();
  });

  it('keeps an ended match for the remaining player, then deletes it when the room empties', async () => {
    const harness = await createHarness(60_000, 60_000);
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{
      ok: true;
      data: { id: string; roomCode: string; version: number };
    }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    const joined = await emit<{ ok: true; data: { version: number } }>(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });
    const endedEvent = once<{ reason: string; winnerUserId: string }>(right, 'match:ended');

    const leftAck = await emit<{ ok: boolean; data?: { winnerUserId: string; endReason: string } }>(
      left,
      'match:leave',
      {
        commandId: randomUUID(),
        expectedVersion: joined.data.version,
      },
    );

    expect(leftAck).toMatchObject({
      ok: true,
      data: { winnerUserId: 'right', endReason: 'left' },
    });
    await expect(endedEvent).resolves.toMatchObject({
      reason: 'left',
      winnerUserId: 'right',
    });
    expect(await harness.repository.findByCode(created.data.roomCode)).toMatchObject({
      status: 'ended',
      winnerUserId: 'right',
      endReason: 'left',
    });
    expect(harness.server.io.sockets.adapter.rooms.get(`match:${created.data.id}`)?.size).toBe(1);

    const rightAck = await emit<{
      ok: boolean;
      data?: { winnerUserId: string; endReason: string };
    }>(right, 'match:leave', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });

    expect(rightAck).toMatchObject({
      ok: true,
      data: { winnerUserId: 'right', endReason: 'left' },
    });
    expect(await harness.repository.findByCode(created.data.roomCode)).toBeNull();
    expect(harness.server.io.sockets.adapter.rooms.get(`match:${created.data.id}`)).toBeUndefined();
  });

  it('deletes an active match once both players leave', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    await emit(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });
    right.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    left.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const remaining = await harness.repository.findByCode(created.data.roomCode);
    expect(remaining).toBeNull();
  });

  it('keeps an active match until all players have been gone for the idle grace period', async () => {
    const harness = await createHarness(60_000, 120);
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ ok: true; data: { roomCode: string } }>(left, 'room:create', {
      commandId: randomUUID(),
      expectedVersion: 0,
    });
    await emit(right, 'room:join', {
      commandId: randomUUID(),
      expectedVersion: 0,
      roomCode: created.data.roomCode,
    });

    right.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 80));
    left.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const remaining = await harness.repository.findByCode(created.data.roomCode);
    expect(remaining).not.toBeNull();
  });

  it('supports 25 rooms and 50 simultaneous connections', async () => {
    const harness = await createHarness();
    const clients = await Promise.all(
      Array.from({ length: 50 }, (_, index) => connect(harness, `load-user-${index}`)),
    );
    const created = await Promise.all(
      clients.slice(0, 25).map((client) =>
        emit<{ ok: boolean; data: { roomCode: string } }>(client, 'room:create', {
          commandId: randomUUID(),
          expectedVersion: 0,
        }),
      ),
    );
    const joined = await Promise.all(
      clients.slice(25).map((client, index) =>
        emit<{ ok: boolean }>(client, 'room:join', {
          commandId: randomUUID(),
          expectedVersion: 0,
          roomCode: created[index].data.roomCode,
        }),
      ),
    );
    expect(created.every((response) => response.ok)).toBe(true);
    expect(joined.every((response) => response.ok)).toBe(true);
  }, 15_000);
});
