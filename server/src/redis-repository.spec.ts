import { randomUUID } from 'node:crypto';
import { createMatchState, MultiplayerMatchState } from '@math-war/game-engine';
import { describe, expect, it } from 'vitest';
import { RedisMatchRepository } from './redis-repository.js';

class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly sortedSets = new Map<string, Map<string, number>>();
  connected = false;
  closed = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async quit(): Promise<void> {
    this.closed = true;
  }

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => this.strings.get(key) ?? null);
  }

  async set(key: string, value: string, mode?: string): Promise<'OK' | null> {
    if (mode === 'NX' && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) deleted += 1;
      if (this.sets.delete(key)) deleted += 1;
      if (this.sortedSets.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async eval(_script: string, _numberOfKeys: number, key: string, value: string): Promise<number> {
    if (this.strings.get(key) !== value) return 0;
    return this.del(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, set);
    const size = set.size;
    members.forEach((member) => set.add(member));
    return set.size - size;
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.has(member) ? 1 : 0;
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    return [...(this.sortedSets.get(key) ?? new Map<string, number>()).entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }

  async watch(): Promise<'OK'> {
    return 'OK';
  }

  async unwatch(): Promise<'OK'> {
    return 'OK';
  }

  multi(): FakeMulti {
    return new FakeMulti(this);
  }
}

class FakeMulti {
  private readonly operations: (() => void)[] = [];

  constructor(private readonly redis: FakeRedis) {}

  del(...keys: string[]): this {
    this.operations.push(() => void this.redis.del(...keys));
    return this;
  }

  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): this {
    this.operations.push(
      () => void this.redis.eval(script, numberOfKeys, String(args[0]), String(args[1])),
    );
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    this.operations.push(() => void this.redis.sadd(key, ...members));
    return this;
  }

  set(key: string, value: string): this {
    this.operations.push(() => void this.redis.set(key, value));
    return this;
  }

  srem(key: string, ...members: string[]): this {
    this.operations.push(() => {
      const set = this.redis.sets.get(key);
      members.forEach((member) => set?.delete(member));
    });
    return this;
  }

  zadd(key: string, score: number, member: string): this {
    this.operations.push(() => {
      const sortedSet = this.redis.sortedSets.get(key) ?? new Map<string, number>();
      this.redis.sortedSets.set(key, sortedSet);
      sortedSet.set(member, score);
    });
    return this;
  }

  zrem(key: string, ...members: string[]): this {
    this.operations.push(() => {
      const sortedSet = this.redis.sortedSets.get(key);
      members.forEach((member) => sortedSet?.delete(member));
    });
    return this;
  }

  async exec(): Promise<unknown[]> {
    this.operations.forEach((operation) => operation());
    return [];
  }
}

function createState(roomCode = 'ABCD-1234'): MultiplayerMatchState {
  return createMatchState(randomUUID(), roomCode, 'seed', {
    userId: 'host',
    displayName: 'Host',
  });
}

describe('RedisMatchRepository', () => {
  it('creates and finds matches by id, room code, and active user', async () => {
    const repository = new RedisMatchRepository(new FakeRedis() as never);
    const state = createState();

    await expect(repository.create(state, randomUUID())).resolves.toBe(true);
    await expect(repository.findById(state.id)).resolves.toEqual(state);
    await expect(repository.findByCode(state.roomCode)).resolves.toEqual(state);
    await expect(repository.findActiveByUser('host')).resolves.toEqual(state);
  });

  it('rejects duplicate room codes', async () => {
    const repository = new RedisMatchRepository(new FakeRedis() as never);

    await expect(repository.create(createState('ROOM-0001'), randomUUID())).resolves.toBe(true);
    await expect(repository.create(createState('ROOM-0001'), randomUUID())).resolves.toBe(false);
  });

  it('updates with version and command idempotency checks', async () => {
    const repository = new RedisMatchRepository(new FakeRedis() as never);
    const state = createState();
    const commandId = randomUUID();
    await repository.create(state, randomUUID());

    const updated = await repository.update(state.id, state.version, commandId, (current) => ({
      ...current,
      version: current.version + 1,
      status: 'paused',
      disconnectedUserId: 'host',
      reconnectDeadline: '2026-07-02T12:00:00.000Z',
      updatedAt: '2026-07-02T11:59:00.000Z',
    }));

    expect(updated).toMatchObject({ ok: true, state: { version: state.version + 1 } });
    await expect(
      repository.update(state.id, state.version, commandId, (current) => current),
    ).resolves.toEqual({ ok: false, reason: 'duplicate' });
    await expect(
      repository.update(state.id, state.version, randomUUID(), (current) => current),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
  });

  it('lists expired reconnects and deletes empty or finished matches', async () => {
    const repository = new RedisMatchRepository(new FakeRedis() as never);
    const state = createState();
    await repository.create(state, randomUUID());
    const paused = await repository.update(state.id, state.version, randomUUID(), (current) => ({
      ...current,
      version: current.version + 1,
      status: 'paused',
      disconnectedUserId: 'host',
      reconnectDeadline: '2026-07-02T12:00:00.000Z',
      updatedAt: '2026-07-02T11:59:00.000Z',
    }));
    expect(paused.ok).toBe(true);

    await expect(
      repository.listExpiredReconnects(new Date('2026-07-02T12:01:00.000Z')),
    ).resolves.toHaveLength(1);
    await repository.markRoomEmpty(state.id, new Date('2026-07-02T12:02:00.000Z'));
    await expect(repository.deleteEmptyBefore(new Date('2026-07-02T12:03:00.000Z'))).resolves.toBe(
      1,
    );
    await expect(repository.findById(state.id)).resolves.toBeNull();

    const finished = createState('ROOM-0002');
    await repository.create(finished, randomUUID());
    const ended = await repository.update(
      finished.id,
      finished.version,
      randomUUID(),
      (current) => ({
        ...current,
        version: current.version + 1,
        status: 'ended',
        winnerUserId: null,
        endReason: 'left',
        updatedAt: '2026-07-02T12:00:00.000Z',
      }),
    );
    expect(ended.ok).toBe(true);
    await expect(
      repository.deleteFinishedBefore(new Date('2026-07-03T12:00:00.000Z')),
    ).resolves.toBe(1);
    await expect(repository.findById(finished.id)).resolves.toBeNull();
  });

  it('does not delete a newer active-user index while cleaning an old match', async () => {
    const repository = new RedisMatchRepository(new FakeRedis() as never);
    const first = createState('ROOM-0001');
    const second = { ...createState('ROOM-0002'), players: first.players };
    await repository.create(first, randomUUID());
    await repository.create(second, randomUUID());

    await expect(repository.delete(first.id)).resolves.toBe(true);
    await expect(repository.findActiveByUser('host')).resolves.toEqual(second);
  });
});
