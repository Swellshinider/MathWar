import { Server as SocketServer } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const instances: MockRedis[] = [];
  const createAdapter = vi.fn(() => 'redis-adapter');

  class MockRedis {
    readonly connect = vi.fn().mockResolvedValue(undefined);
    readonly quit = vi.fn().mockResolvedValue(undefined);
    readonly on = vi.fn();

    constructor(readonly url: string, readonly options?: object) {
      instances.push(this);
    }

    duplicate() {
      return new MockRedis(this.url, this.options);
    }
  }

  return { MockRedis, createAdapter, instances };
});

vi.mock('ioredis', () => ({ Redis: mocks.MockRedis }));
vi.mock('@socket.io/redis-adapter', () => ({ createAdapter: mocks.createAdapter }));

import { configureRedisSocketAdapter, redisAdapterOptionsFromEnv } from './redis-adapter.js';

describe('Redis Socket.IO adapter', () => {
  beforeEach(() => {
    mocks.instances.length = 0;
    mocks.createAdapter.mockClear();
  });

  it('reads Redis options from the environment', () => {
    const previousUrl = process.env['REDIS_URL'];
    const previousKeyPrefix = process.env['REDIS_KEY_PREFIX'];
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    process.env['REDIS_KEY_PREFIX'] = 'mathwar:test';

    try {
      expect(redisAdapterOptionsFromEnv()).toEqual({
        url: 'redis://localhost:6379',
        keyPrefix: 'mathwar:test:socket.io',
      });
    } finally {
      if (previousUrl === undefined) delete process.env['REDIS_URL'];
      else process.env['REDIS_URL'] = previousUrl;
      if (previousKeyPrefix === undefined) delete process.env['REDIS_KEY_PREFIX'];
      else process.env['REDIS_KEY_PREFIX'] = previousKeyPrefix;
    }
  });

  it('returns null when Redis is not configured', () => {
    const previousUrl = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];

    try {
      expect(redisAdapterOptionsFromEnv()).toBeNull();
    } finally {
      if (previousUrl !== undefined) process.env['REDIS_URL'] = previousUrl;
    }
  });

  it('configures and closes Redis pub/sub clients', async () => {
    const adapter = vi.fn();
    const io = { adapter } as unknown as SocketServer;

    const handle = await configureRedisSocketAdapter(io, {
      url: 'redis://localhost:6379',
      keyPrefix: 'mathwar:test',
    });

    expect(mocks.instances).toHaveLength(2);
    expect(mocks.instances[0].connect).toHaveBeenCalledTimes(1);
    expect(mocks.instances[1].connect).toHaveBeenCalledTimes(1);
    expect(mocks.createAdapter).toHaveBeenCalledWith(mocks.instances[0], mocks.instances[1], {
      key: 'mathwar:test',
      publishOnSpecificResponseChannel: true,
    });
    expect(adapter).toHaveBeenCalledWith('redis-adapter');

    await handle.close();

    expect(mocks.instances[0].quit).toHaveBeenCalledTimes(1);
    expect(mocks.instances[1].quit).toHaveBeenCalledTimes(1);
  });
});
