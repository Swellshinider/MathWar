import { MultiplayerMatchState } from '@math-war/game-engine';
import { Redis } from 'ioredis';
import { MatchRepository, UpdateResult } from './repository.js';

type RedisClient = Pick<
  Redis,
  | 'connect'
  | 'del'
  | 'get'
  | 'mget'
  | 'multi'
  | 'quit'
  | 'sadd'
  | 'sismember'
  | 'set'
  | 'unwatch'
  | 'watch'
  | 'zrangebyscore'
>;

interface RedisMulti {
  del(...keys: string[]): RedisMulti;
  sadd(key: string, ...members: string[]): RedisMulti;
  set(key: string, value: string): RedisMulti;
  zadd(key: string, score: number, member: string): RedisMulti;
  zrem(key: string, ...members: string[]): RedisMulti;
  exec(): Promise<unknown[] | null>;
}

export interface RedisMatchRepositoryOptions {
  readonly keyPrefix?: string;
}

const DEFAULT_KEY_PREFIX = 'mathwar:multiplayer';
const MAX_UPDATE_ATTEMPTS = 8;

export class RedisMatchRepository implements MatchRepository {
  private readonly redis: RedisClient;
  private readonly keyPrefix: string;
  private readonly ownsClient: boolean;

  constructor(urlOrClient: string | RedisClient, options: RedisMatchRepositoryOptions = {}) {
    this.redis =
      typeof urlOrClient === 'string' ? new Redis(urlOrClient, { lazyConnect: true }) : urlOrClient;
    this.ownsClient = typeof urlOrClient === 'string';
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  async initialize(): Promise<void> {
    if (this.ownsClient) await this.redis.connect();
  }

  async create(state: MultiplayerMatchState, commandId: string): Promise<boolean> {
    const roomWasReserved = await this.redis.set(this.roomKey(state.roomCode), state.id, 'NX');
    if (roomWasReserved !== 'OK') return false;
    try {
      const transaction = this.redis.multi();
      this.writeMatch(transaction, state);
      transaction.sadd(this.commandsKey(state.id), commandId);
      await transaction.exec();
      return true;
    } catch (error) {
      await this.redis.del(this.roomKey(state.roomCode));
      throw error;
    }
  }

  async findByCode(roomCode: string): Promise<MultiplayerMatchState | null> {
    const id = await this.redis.get(this.roomKey(roomCode));
    return id ? this.findById(id) : null;
  }

  async findById(id: string): Promise<MultiplayerMatchState | null> {
    const state = await this.redis.get(this.matchKey(id));
    return state ? (JSON.parse(state) as MultiplayerMatchState) : null;
  }

  async findActiveByUser(userId: string): Promise<MultiplayerMatchState | null> {
    const id = await this.redis.get(this.activeUserKey(userId));
    if (!id) return null;
    const state = await this.findById(id);
    if (!state || state.status === 'ended') {
      await this.redis.del(this.activeUserKey(userId));
      return null;
    }
    return state;
  }

  async update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MultiplayerMatchState) => MultiplayerMatchState,
  ): Promise<UpdateResult> {
    const matchKey = this.matchKey(id);
    const commandsKey = this.commandsKey(id);
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      await this.redis.watch(matchKey, commandsKey);
      const isDuplicate = await this.redis.sismember(commandsKey, commandId);
      if (isDuplicate) {
        await this.redis.unwatch();
        return { ok: false, reason: 'duplicate' };
      }
      const serialized = await this.redis.get(matchKey);
      if (!serialized) {
        await this.redis.unwatch();
        return { ok: false, reason: 'missing' };
      }
      const current = JSON.parse(serialized) as MultiplayerMatchState;
      if (current.version !== expectedVersion) {
        await this.redis.unwatch();
        return { ok: false, reason: 'stale' };
      }

      const next = transform(structuredClone(current));
      const transaction = this.redis.multi();
      transaction.sadd(commandsKey, commandId);
      this.rewriteMatch(transaction, current, next);
      const result = await transaction.exec();
      if (result) return { ok: true, state: next };
    }
    return { ok: false, reason: 'stale' };
  }

  async listExpiredReconnects(now: Date): Promise<readonly MultiplayerMatchState[]> {
    const ids = await this.redis.zrangebyscore(this.reconnectKey(), 0, now.getTime());
    if (!ids.length) return [];
    const states = await this.redis.mget(...ids.map((id) => this.matchKey(id)));
    return states
      .filter((state): state is string => state !== null)
      .map((state) => JSON.parse(state) as MultiplayerMatchState)
      .filter(
        (state) =>
          state.status === 'paused' &&
          state.reconnectDeadline !== null &&
          new Date(state.reconnectDeadline).getTime() <= now.getTime(),
      );
  }

  async markRoomEmpty(id: string, emptySince: Date): Promise<void> {
    await this.redis.multi().zadd(this.emptyKey(), emptySince.getTime(), id).exec();
  }

  async clearRoomEmpty(id: string): Promise<void> {
    await this.redis.multi().zrem(this.emptyKey(), id).exec();
  }

  async deleteEmptyBefore(cutoff: Date): Promise<number> {
    return this.deleteIds(await this.redis.zrangebyscore(this.emptyKey(), 0, cutoff.getTime()));
  }

  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    return this.deleteIds(await this.redis.zrangebyscore(this.finishedKey(), 0, cutoff.getTime()));
  }

  async delete(id: string): Promise<boolean> {
    const state = await this.findById(id);
    if (!state) return false;
    const transaction = this.redis.multi();
    this.deleteMatch(transaction, state);
    await transaction.exec();
    return true;
  }

  async close(): Promise<void> {
    if (this.ownsClient) await this.redis.quit();
  }

  private async deleteIds(ids: readonly string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) deleted += 1;
    }
    return deleted;
  }

  private rewriteMatch(
    transaction: RedisMulti,
    previous: MultiplayerMatchState,
    next: MultiplayerMatchState,
  ): void {
    this.removeIndexes(transaction, previous);
    this.writeMatch(transaction, next);
  }

  private writeMatch(transaction: RedisMulti, state: MultiplayerMatchState): void {
    transaction.set(this.matchKey(state.id), JSON.stringify(state));
    transaction.set(this.roomKey(state.roomCode), state.id);
    if (state.status !== 'ended') {
      for (const player of state.players) {
        transaction.set(this.activeUserKey(player.userId), state.id);
      }
    }
    if (state.status === 'ended') {
      transaction.zadd(this.finishedKey(), new Date(state.updatedAt).getTime(), state.id);
      transaction.zrem(this.reconnectKey(), state.id);
    } else {
      transaction.zrem(this.finishedKey(), state.id);
    }
    if (state.status === 'paused' && state.reconnectDeadline) {
      transaction.zadd(this.reconnectKey(), new Date(state.reconnectDeadline).getTime(), state.id);
    } else {
      transaction.zrem(this.reconnectKey(), state.id);
    }
  }

  private removeIndexes(transaction: RedisMulti, state: MultiplayerMatchState): void {
    for (const player of state.players) {
      transaction.del(this.activeUserKey(player.userId));
    }
    transaction.zrem(this.finishedKey(), state.id);
    transaction.zrem(this.reconnectKey(), state.id);
  }

  private deleteMatch(transaction: RedisMulti, state: MultiplayerMatchState): void {
    this.removeIndexes(transaction, state);
    transaction.del(
      this.matchKey(state.id),
      this.roomKey(state.roomCode),
      this.commandsKey(state.id),
    );
    transaction.zrem(this.emptyKey(), state.id);
  }

  private matchKey(id: string): string {
    return `${this.keyPrefix}:match:${id}`;
  }

  private roomKey(roomCode: string): string {
    return `${this.keyPrefix}:room:${roomCode}`;
  }

  private activeUserKey(userId: string): string {
    return `${this.keyPrefix}:active-user:${userId}`;
  }

  private commandsKey(id: string): string {
    return `${this.keyPrefix}:commands:${id}`;
  }

  private emptyKey(): string {
    return `${this.keyPrefix}:empty`;
  }

  private finishedKey(): string {
    return `${this.keyPrefix}:finished`;
  }

  private reconnectKey(): string {
    return `${this.keyPrefix}:reconnect`;
  }
}

export function redisMatchRepositoryOptionsFromEnv(): RedisMatchRepositoryOptions {
  const baseKeyPrefix = process.env['REDIS_KEY_PREFIX'] ?? 'mathwar';
  return {
    keyPrefix: `${baseKeyPrefix}:multiplayer`,
  };
}
