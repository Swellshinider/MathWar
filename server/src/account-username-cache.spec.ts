import { describe, expect, it } from 'vitest';
import { RedisUsernameAvailabilityCache } from './account-username-cache.js';

class FakeRedis {
  readonly values = new Map<string, { value: string; ttlSeconds: number }>();

  async connect(): Promise<void> {}
  async quit(): Promise<void> {}

  async get(key: string): Promise<string | null> {
    return this.values.get(key)?.value ?? null;
  }

  async set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<void> {
    expect(mode).toBe('EX');
    this.values.set(key, { value, ttlSeconds });
  }
}

describe('RedisUsernameAvailabilityCache', () => {
  it('stores taken usernames with a 30 minute TTL', async () => {
    const redis = new FakeRedis();
    const cache = new RedisUsernameAvailabilityCache(redis);

    expect(await cache.isUsernameTaken('player_one')).toBe(false);

    await cache.storeUsernameTaken('player_one');

    expect(await cache.isUsernameTaken('player_one')).toBe(true);
    expect(redis.values.get('mathwar:account:username:taken:player_one')).toEqual({
      value: '1',
      ttlSeconds: 30 * 60,
    });
  });
});
