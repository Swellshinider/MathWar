import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

export interface RedisSocketAdapterOptions {
  readonly url: string;
  readonly keyPrefix?: string;
  readonly logger?: {
    error(fields: object, message?: string): void;
    info(fields: object, message?: string): void;
  };
}

export interface SocketAdapterHandle {
  close(): Promise<void>;
}

export async function configureRedisSocketAdapter(
  io: SocketServer,
  options: RedisSocketAdapterOptions,
): Promise<SocketAdapterHandle> {
  const pubClient = new Redis(options.url, { lazyConnect: true });
  const subClient = pubClient.duplicate();
  const key = options.keyPrefix ?? 'mathwar:socket.io';

  const logError = (client: 'pub' | 'sub') => (error: Error) => {
    options.logger?.error({ error, redisClient: client }, 'Redis adapter client error');
  };
  pubClient.on('error', logError('pub'));
  subClient.on('error', logError('sub'));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient, { key, publishOnSpecificResponseChannel: true }));
  options.logger?.info({ redisKeyPrefix: key }, 'Socket.IO Redis adapter configured');

  return {
    async close() {
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
}

export function redisAdapterOptionsFromEnv(): RedisSocketAdapterOptions | null {
  const url = process.env['REDIS_URL'];
  if (!url) return null;
  const baseKeyPrefix = process.env['REDIS_KEY_PREFIX'] ?? 'mathwar';
  return {
    url,
    keyPrefix: `${baseKeyPrefix}:socket.io`,
  };
}
