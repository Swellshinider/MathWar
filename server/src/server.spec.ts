import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveShot } from '@math-war/game-engine';
import { io as createClient, Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryMatchRepository } from './repository.js';
import { createMultiplayerServer } from './server.js';

interface Harness {
  readonly repository: InMemoryMatchRepository;
  readonly server: Awaited<ReturnType<typeof createMultiplayerServer>>;
  readonly url: string;
  readonly clients: Socket[];
}

const harnesses: Harness[] = [];

async function createHarness(reconnectWindowMs = 60_000): Promise<Harness> {
  const repository = new InMemoryMatchRepository();
  const server = await createMultiplayerServer({
    repository,
    verifyToken: async (token) => ({ id: token, displayName: token }),
    allowedOrigin: '*',
    reconnectWindowMs,
    sweepIntervalMs: 10,
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
    await writeFile(join(staticRoot, 'index.html'), '<html>Math War</html>');
    await writeFile(join(staticRoot, 'main.js'), 'console.log("asset");');
    await writeFile(join(staticRoot, 'favicon.ico'), 'icon');
    await writeFile(join(staticRoot, 'config.js'), 'window.MATH_WAR_CONFIG = { legacy: true };');
    const repository = new InMemoryMatchRepository();
    const server = await createMultiplayerServer({
      repository,
      verifyToken: async (token) => ({ id: token, displayName: token }),
      allowedOrigin: 'https://math-war.example',
      staticRoot,
      browserConfig: {
        serverUrl: 'https://math-war.example',
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_test',
      },
    });
    harnesses.push({ repository, server, url: '', clients: [] });

    try {
      const config = await server.fastify.inject({ method: 'GET', url: '/config.js' });
      expect(config.headers['cache-control']).toBe('no-store');
      expect(config.headers['content-type']).toContain('application/javascript');
      expect(config.body).toContain('supabasePublishableKey');
      expect(config.body).toContain('sb_publishable_test');
      expect(config.body).not.toContain('service_role');
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
      expect(route.body).toContain('Math War');
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
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

  it('creates, joins, rejects unsafe commands, and resolves a winning shot', async () => {
    const harness = await createHarness();
    const left = await connect(harness, 'left');
    const right = await connect(harness, 'right');
    const created = await emit<{ ok: true; data: { roomCode: string; version: number } }>(
      left,
      'room:create',
      { commandId: randomUUID(), expectedVersion: 0 },
    );
    expect(created.ok).toBe(true);
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
    let equation = '';
    for (let coefficient = -40; coefficient <= 40 && !equation; coefficient += 1) {
      const value = coefficient / 1000;
      const leftPlayer = persisted!.players[0];
      const rightPlayer = persisted!.players[1];
      const slope = (rightPlayer.position.y - leftPlayer.position.y) / 18;
      const candidate = `${value}x(x-18)+${slope}x`;
      if (resolveShot(persisted!, 'left', 'probe', candidate).impact === 'opponent')
        equation = candidate;
    }
    expect(equation).not.toBe('');
    const shotPromise = once<{ impact: string; state: { status: string; winnerUserId: string } }>(
      right,
      'shot:resolved',
    );
    const fired = await emit<{ ok: true }>(left, 'match:fire', {
      commandId: randomUUID(),
      expectedVersion: persisted!.version,
      equation,
    });
    expect(fired.ok).toBe(true);
    const shot = await shotPromise;
    expect(shot.impact).toBe('opponent');
    expect(shot.state).toMatchObject({ status: 'ended', winnerUserId: 'left' });
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
