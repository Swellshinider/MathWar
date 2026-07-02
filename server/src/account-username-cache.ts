import { Redis } from 'ioredis';

type RedisClient = Pick<Redis, 'connect' | 'get' | 'quit'> & {
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>;
};

export interface UsernameAvailabilityCache {
  initialize(): Promise<void>;
  isUsernameTaken(username: string): Promise<boolean>;
  storeUsernameTaken(username: string): Promise<void>;
  close(): Promise<void>;
}

export interface RedisUsernameAvailabilityCacheOptions {
  readonly keyPrefix?: string;
  readonly takenTtlSeconds?: number;
}

const DEFAULT_KEY_PREFIX = 'mathwar:account';
const DEFAULT_TAKEN_TTL_SECONDS = 30 * 60;

export class RedisUsernameAvailabilityCache implements UsernameAvailabilityCache {
  private readonly redis: RedisClient;
  private readonly keyPrefix: string;
  private readonly takenTtlSeconds: number;
  private readonly ownsClient: boolean;

  constructor(
    urlOrClient: string | RedisClient,
    options: RedisUsernameAvailabilityCacheOptions = {},
  ) {
    this.redis =
      typeof urlOrClient === 'string' ? new Redis(urlOrClient, { lazyConnect: true }) : urlOrClient;
    this.ownsClient = typeof urlOrClient === 'string';
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.takenTtlSeconds = options.takenTtlSeconds ?? DEFAULT_TAKEN_TTL_SECONDS;
  }

  async initialize(): Promise<void> {
    if (this.ownsClient) await this.redis.connect();
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    return (await this.redis.get(this.takenKey(username))) === '1';
  }

  async storeUsernameTaken(username: string): Promise<void> {
    await this.redis.set(this.takenKey(username), '1', 'EX', this.takenTtlSeconds);
  }

  async close(): Promise<void> {
    if (this.ownsClient) await this.redis.quit();
  }

  private takenKey(username: string): string {
    return `${this.keyPrefix}:username:taken:${username}`;
  }
}

export function redisUsernameAvailabilityCacheOptionsFromEnv(): RedisUsernameAvailabilityCacheOptions {
  return {
    keyPrefix: process.env['REDIS_KEY_PREFIX']
      ? `${process.env['REDIS_KEY_PREFIX']}:account`
      : undefined,
  };
}
