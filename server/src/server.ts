import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { AuthenticatedUser } from '@math-war/game-engine';
import { AccountProgressRepository } from './account-progress-repository.js';
import { AccountRepository } from './account-repository.js';
import { UsernameAvailabilityCache } from './account-username-cache.js';
import { TokenVerifier } from './auth.js';
import { LeaderboardRepository } from './leaderboard-repository.js';
import { createMathWarMetrics } from './observability/metrics.js';
import { InstrumentedMatchRepository } from './observability/repository.js';
import { MatchRepository } from './repository.js';
import { SocketAdapterHandle } from './redis-adapter.js';
import { registerHttpRoutes } from './server/http-routes.js';
import { createSocketRuntime } from './server/socket-runtime.js';

const HTTP_BODY_LIMIT_BYTES = 512 * 1024;

export interface MultiplayerServerOptions {
  readonly repository: MatchRepository;
  readonly verifyToken: TokenVerifier;
  readonly accounts?: {
    readonly repository: AccountRepository;
    readonly accessTokenSecret: string;
    readonly refreshTokenSecret: string;
    readonly usernameAvailabilityCache?: UsernameAvailabilityCache;
    readonly refreshCookieSecure?: boolean;
  };
  readonly leaderboardRepository?: LeaderboardRepository;
  readonly progressRepository?: AccountProgressRepository;
  readonly allowedOrigin: string;
  readonly reconnectWindowMs?: number;
  readonly sweepIntervalMs?: number;
  readonly idleCleanupMs?: number;
  readonly staticRoot?: string;
  readonly browserConfig?: {
    readonly serverUrl: string;
    readonly siteUrl?: string;
  };
  readonly configureSocketAdapter?: (io: SocketServer) => Promise<SocketAdapterHandle | void>;
  readonly issueGuestSession?: (
    displayName: string,
  ) => Promise<{ token: string; expiresAt: string; user: AuthenticatedUser }>;
}

export async function createMultiplayerServer(options: MultiplayerServerOptions) {
  const fastify = Fastify({
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
    logger:
      process.env['NODE_ENV'] === 'test'
        ? false
        : {
            level: process.env['LOG_LEVEL'] ?? 'info',
          },
  });
  const metrics = createMathWarMetrics();
  const repository = new InstrumentedMatchRepository(options.repository, metrics);
  const accountRepository = options.accounts?.repository;
  const leaderboardRepository = options.leaderboardRepository;
  const progressRepository = options.progressRepository;
  const usernameAvailabilityCache = options.accounts?.usernameAvailabilityCache;

  await registerHttpRoutes({ fastify, metrics, options });

  const socketRuntime = await createSocketRuntime({ fastify, metrics, repository, options });

  await repository.initialize();
  await accountRepository?.initialize();
  await leaderboardRepository?.initialize();
  await progressRepository?.initialize();
  await usernameAvailabilityCache?.initialize();
  const sweep = socketRuntime.startSweep();

  return {
    fastify,
    io: socketRuntime.io,
    async listen(port: number, host = '0.0.0.0'): Promise<string> {
      return fastify.listen({ port, host });
    },
    async close(): Promise<void> {
      clearInterval(sweep);
      await fastify.close();
      await socketRuntime.close();
      await usernameAvailabilityCache?.close();
      await progressRepository?.close();
      await leaderboardRepository?.close();
      await accountRepository?.close();
      await repository.close();
      metrics.shutdown();
    },
  };
}
