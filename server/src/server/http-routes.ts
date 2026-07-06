import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { AuthenticatedUser } from '@math-war/game-engine';
import { FastifyInstance } from 'fastify';
import {
  AccountPublicUser,
  ACCOUNT_REFRESH_COOKIE,
  createAccountTokenVerifier,
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  issueAccountAccessToken,
  parseAvatarDataUrl,
  validateAccountDisplayName,
  validatePassword,
  validateUsername,
  verifyPasswordHash,
} from '../account-auth.js';
import {
  AccountProgress,
  AccountProgressRepository,
  FormulaFrenzyRunInput,
  isProgressDifficulty,
  validateProgressRunId,
} from '../account-progress-repository.js';
import { AccountRecord, AccountRepository } from '../account-repository.js';
import { UsernameAvailabilityCache } from '../account-username-cache.js';
import {
  isLeaderboardDifficulty,
  isLeaderboardGameId,
  isLeaderboardSort,
  LeaderboardEntry,
  LeaderboardRepository,
  LeaderboardScoreInput,
} from '../leaderboard-repository.js';
import { MathWarMetrics, nowSeconds, routeMetricLabel } from '../observability/metrics.js';
import {
  canonicalOrigin,
  createRobotsTxt,
  createSitemapXml,
  cspConnectSrc,
  isMetricsRequestAuthorized,
  isUniqueConstraintViolation,
} from './http-utils.js';
import {
  parseBoundedInteger,
  parseNullableBoundedInteger,
  parsePositiveInteger,
} from './validation.js';

const GUEST_AUTH_RATE_LIMIT_MAX = 10;
const GUEST_AUTH_RATE_LIMIT_WINDOW = '1 minute';
const ACCOUNT_AUTH_RATE_LIMIT_MAX = 10;
const ACCOUNT_AUTH_RATE_LIMIT_WINDOW = '1 minute';
const ACCOUNT_USERNAME_CHECK_RATE_LIMIT_MAX = 60;
const ACCOUNT_USERNAME_CHECK_RATE_LIMIT_WINDOW = '1 minute';
const LEADERBOARD_SAVE_RATE_LIMIT_MAX = 30;
const LEADERBOARD_SAVE_RATE_LIMIT_WINDOW = '1 minute';
const PROGRESS_SAVE_RATE_LIMIT_MAX = 60;
const PROGRESS_SAVE_RATE_LIMIT_WINDOW = '1 minute';

interface RegisterHttpRoutesOptions {
  readonly fastify: FastifyInstance;
  readonly metrics: MathWarMetrics;
  readonly options: {
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
    readonly staticRoot?: string;
    readonly browserConfig?: {
      readonly serverUrl: string;
      readonly siteUrl?: string;
    };
    readonly issueGuestSession?: (
      displayName: string,
    ) => Promise<{ token: string; expiresAt: string; user: AuthenticatedUser }>;
  };
}

function accountAvatarUrl(account: AccountRecord): string | null {
  if (!account.avatarMimeType || !account.avatarUpdatedAt) return null;
  return `/api/account/avatar/${account.id}?v=${encodeURIComponent(account.avatarUpdatedAt)}`;
}
function publicAccount(account: AccountRecord): AccountPublicUser {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    avatarUrl: accountAvatarUrl(account),
  };
}
function refreshCookieOptions(secure: boolean, expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/api/account',
    expires,
  };
}
export async function registerHttpRoutes({
  fastify,
  metrics,
  options,
}: RegisterHttpRoutesOptions): Promise<void> {
  const metricsEnabled = process.env['METRICS_ENABLED'] !== 'false';
  const accountOptions = options.accounts;
  const accountRepository = accountOptions?.repository;
  const leaderboardRepository = options.leaderboardRepository;
  const progressRepository = options.progressRepository;
  const usernameAvailabilityCache = accountOptions?.usernameAvailabilityCache;
  const accountTokenVerifier = accountOptions
    ? createAccountTokenVerifier(accountOptions.accessTokenSecret)
    : null;
  const refreshCookieSecure =
    accountOptions?.refreshCookieSecure ?? process.env['NODE_ENV'] === 'production';
  const requestStarts = new WeakMap<object, number>();

  fastify.addHook('onRequest', async (request) => {
    requestStarts.set(request, nowSeconds());
  });
  fastify.addHook('onResponse', async (request, reply) => {
    const start = requestStarts.get(request);
    if (start === undefined) return;
    metrics.observeHttp(
      request.method,
      routeMetricLabel(request.method, request.raw.url ?? request.url),
      reply.statusCode,
      nowSeconds() - start,
    );
  });

  await fastify.register(cors, {
    origin: options.allowedOrigin,
    credentials: options.allowedOrigin !== '*',
  });
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: cspConnectSrc(options.allowedOrigin),
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });
  await fastify.register(cookie);
  await fastify.register(rateLimit, { global: false });
  const healthHandler = async () => {
    metrics.recordHealthCall();
    return { status: 'ok' };
  };
  fastify.get('/health', healthHandler);
  fastify.get('/healthz', healthHandler);
  if (metricsEnabled) {
    fastify.get('/metrics', async (request, reply) => {
      if (!isMetricsRequestAuthorized(request.headers.authorization)) {
        return reply.code(401).send({ message: 'Metrics authorization is required.' });
      }
      return reply.type(metrics.contentType).send(await metrics.metrics());
    });
  }

  async function isUsernameCachedTaken(username: string): Promise<boolean> {
    try {
      return (await usernameAvailabilityCache?.isUsernameTaken(username)) ?? false;
    } catch (error) {
      fastify.log.warn({ error }, 'Username availability cache read failed');
      return false;
    }
  }

  async function cacheUsernameTaken(username: string): Promise<void> {
    try {
      await usernameAvailabilityCache?.storeUsernameTaken(username);
    } catch (error) {
      fastify.log.warn({ error }, 'Username availability cache write failed');
    }
  }

  async function requireAccount(request: { headers: { authorization?: string } }) {
    if (!accountRepository || !accountTokenVerifier)
      throw new Error('Account system is not configured.');
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
      throw new Error('Account authentication is required.');
    const user = await accountTokenVerifier(authorization.slice('Bearer '.length));
    const account = await accountRepository.findAccountById(user.id);
    if (!account) throw new Error('Account authentication is required.');
    return account;
  }

  async function createAccountSession(account: AccountRecord) {
    if (!accountOptions || !accountRepository) throw new Error('Account system is not configured.');
    const access = await issueAccountAccessToken(accountOptions.accessTokenSecret, account);
    const refresh = createRefreshToken(accountOptions.refreshTokenSecret);
    await accountRepository.createRefreshToken({
      accountId: account.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return {
      session: {
        accessToken: access.token,
        expiresAt: access.expiresAt.toISOString(),
        user: publicAccount(account),
      },
      refresh,
    };
  }

  if (accountRepository && accountOptions) {
    fastify.get<{ Querystring: { username?: unknown } }>(
      '/api/account/username-availability',
      {
        config: {
          rateLimit: {
            max: ACCOUNT_USERNAME_CHECK_RATE_LIMIT_MAX,
            timeWindow: ACCOUNT_USERNAME_CHECK_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        try {
          if (typeof request.query.username !== 'string') {
            return reply.code(400).send({ message: 'Username is required.' });
          }
          const username = validateUsername(request.query.username);
          reply.header('cache-control', 'no-store');
          if (await isUsernameCachedTaken(username)) {
            return { username, available: false };
          }
          const existing = await accountRepository.findAccountByUsername(username);
          if (existing) await cacheUsernameTaken(username);
          return { username, available: !existing };
        } catch (error) {
          return reply.code(400).send({
            message:
              error instanceof Error ? error.message : 'Could not check username availability.',
          });
        }
      },
    );

    fastify.post<{
      Body?: { username?: unknown; password?: unknown; displayName?: unknown };
    }>(
      '/api/account/register',
      {
        config: {
          rateLimit: {
            max: ACCOUNT_AUTH_RATE_LIMIT_MAX,
            timeWindow: ACCOUNT_AUTH_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        let username: string | null = null;
        try {
          if (
            typeof request.body?.username !== 'string' ||
            typeof request.body.password !== 'string' ||
            typeof request.body.displayName !== 'string'
          ) {
            return reply
              .code(400)
              .send({ message: 'Username, password, and display name are required.' });
          }
          username = validateUsername(request.body.username);
          const password = validatePassword(request.body.password);
          const displayName = validateAccountDisplayName(request.body.displayName);
          const existing = await accountRepository.findAccountByUsername(username);
          if (existing) {
            await cacheUsernameTaken(username);
            return reply
              .code(409)
              .send({ message: 'An account already exists for this username.' });
          }
          const account = await accountRepository.createAccount({
            username,
            passwordHash: await hashPassword(password),
            displayName,
          });
          const { session, refresh } = await createAccountSession(account);
          reply.setCookie(
            ACCOUNT_REFRESH_COOKIE,
            refresh.token,
            refreshCookieOptions(refreshCookieSecure, refresh.expiresAt),
          );
          return session;
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            if (username) await cacheUsernameTaken(username);
            return reply
              .code(409)
              .send({ message: 'An account already exists for this username.' });
          }
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not create the account.',
          });
        }
      },
    );

    fastify.post<{ Body?: { username?: unknown; password?: unknown } }>(
      '/api/account/login',
      {
        config: {
          rateLimit: {
            max: ACCOUNT_AUTH_RATE_LIMIT_MAX,
            timeWindow: ACCOUNT_AUTH_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        try {
          if (
            typeof request.body?.username !== 'string' ||
            typeof request.body.password !== 'string'
          ) {
            return reply.code(400).send({ message: 'Username and password are required.' });
          }
          const username = validateUsername(request.body.username);
          const password = validatePassword(request.body.password);
          const account = await accountRepository.findAccountByUsername(username);
          if (!account || !(await verifyPasswordHash(account.passwordHash, password))) {
            return reply.code(401).send({ message: 'Username or password is incorrect.' });
          }
          const { session, refresh } = await createAccountSession(account);
          reply.setCookie(
            ACCOUNT_REFRESH_COOKIE,
            refresh.token,
            refreshCookieOptions(refreshCookieSecure, refresh.expiresAt),
          );
          return session;
        } catch (error) {
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not sign in.',
          });
        }
      },
    );

    fastify.post('/api/account/refresh', async (request, reply) => {
      const token = request.cookies[ACCOUNT_REFRESH_COOKIE];
      if (!token) return reply.code(401).send({ message: 'Account refresh token is required.' });
      const tokenHash = hashRefreshToken(token, accountOptions.refreshTokenSecret);
      const current = await accountRepository.findRefreshToken(tokenHash);
      if (!current) {
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token is invalid.' });
      }
      if (current.revokedAt) {
        await accountRepository.revokeAccountRefreshTokens(current.accountId);
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token was already used.' });
      }
      if (new Date(current.expiresAt).getTime() <= Date.now()) {
        await accountRepository.revokeRefreshToken(current.id);
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token expired.' });
      }
      const account = await accountRepository.findAccountById(current.accountId);
      if (!account) {
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account no longer exists.' });
      }
      const refresh = createRefreshToken(accountOptions.refreshTokenSecret);
      const created = await accountRepository.createRefreshToken({
        accountId: account.id,
        tokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
      });
      await accountRepository.revokeRefreshToken(current.id, created.id);
      const access = await issueAccountAccessToken(accountOptions.accessTokenSecret, account);
      reply.setCookie(
        ACCOUNT_REFRESH_COOKIE,
        refresh.token,
        refreshCookieOptions(refreshCookieSecure, refresh.expiresAt),
      );
      return {
        accessToken: access.token,
        expiresAt: access.expiresAt.toISOString(),
        user: publicAccount(account),
      };
    });

    fastify.post('/api/account/logout', async (request, reply) => {
      const token = request.cookies[ACCOUNT_REFRESH_COOKIE];
      if (token) {
        const current = await accountRepository.findRefreshToken(
          hashRefreshToken(token, accountOptions.refreshTokenSecret),
        );
        if (current) await accountRepository.revokeRefreshToken(current.id);
      }
      reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
      return { ok: true };
    });

    fastify.get('/api/account/me', async (request, reply) => {
      try {
        const account = await requireAccount(request);
        return publicAccount(account);
      } catch {
        return reply.code(401).send({ message: 'Account authentication is required.' });
      }
    });

    fastify.patch<{ Body?: { displayName?: unknown } }>(
      '/api/account/profile',
      async (request, reply) => {
        let account: AccountRecord;
        try {
          account = await requireAccount(request);
        } catch (error) {
          return reply.code(401).send({
            message: error instanceof Error ? error.message : 'Account authentication is required.',
          });
        }
        try {
          if (typeof request.body?.displayName !== 'string') {
            return reply.code(400).send({ message: 'Display name is required.' });
          }
          const updated = await accountRepository.updateProfile(
            account.id,
            validateAccountDisplayName(request.body.displayName),
          );
          if (!updated) return reply.code(404).send({ message: 'Account not found.' });
          return publicAccount(updated);
        } catch (error) {
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not update the profile.',
          });
        }
      },
    );

    fastify.post<{
      Body?: { currentPassword?: unknown; newPassword?: unknown };
    }>('/api/account/password', async (request, reply) => {
      let account: AccountRecord;
      try {
        account = await requireAccount(request);
      } catch (error) {
        return reply.code(401).send({
          message: error instanceof Error ? error.message : 'Account authentication is required.',
        });
      }
      try {
        if (
          typeof request.body?.currentPassword !== 'string' ||
          typeof request.body.newPassword !== 'string'
        ) {
          return reply.code(400).send({ message: 'Current and new password are required.' });
        }
        const currentPassword = validatePassword(request.body.currentPassword);
        const newPassword = validatePassword(request.body.newPassword);
        if (!(await verifyPasswordHash(account.passwordHash, currentPassword))) {
          return reply.code(401).send({ message: 'Current password is incorrect.' });
        }
        const updated = await accountRepository.updatePassword(
          account.id,
          await hashPassword(newPassword),
        );
        await accountRepository.revokeAccountRefreshTokens(account.id);
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return publicAccount(updated ?? account);
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Could not update the password.',
        });
      }
    });

    fastify.post<{ Body?: { dataUrl?: unknown } }>(
      '/api/account/avatar',
      async (request, reply) => {
        let account: AccountRecord;
        try {
          account = await requireAccount(request);
        } catch (error) {
          return reply.code(401).send({
            message: error instanceof Error ? error.message : 'Account authentication is required.',
          });
        }
        try {
          if (typeof request.body?.dataUrl !== 'string') {
            return reply.code(400).send({ message: 'Avatar image is required.' });
          }
          const avatar = parseAvatarDataUrl(request.body.dataUrl);
          const updated = await accountRepository.setAvatar(account.id, avatar);
          if (!updated) return reply.code(404).send({ message: 'Account not found.' });
          return publicAccount(updated);
        } catch (error) {
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not update the avatar.',
          });
        }
      },
    );

    fastify.get<{ Params: { id: string } }>('/api/account/avatar/:id', async (request, reply) => {
      const avatar = await accountRepository.getAvatar(request.params.id);
      if (!avatar) return reply.code(404).send({ message: 'Avatar not found.' });
      return reply
        .header('cache-control', 'private, max-age=3600')
        .type(avatar.mimeType)
        .send(avatar.bytes);
    });

    if (progressRepository) {
      fastify.get('/api/account/progress', async (request, reply) => {
        let account: AccountRecord;
        try {
          account = await requireAccount(request);
        } catch (error) {
          return reply.code(401).send({
            message: error instanceof Error ? error.message : 'Account authentication is required.',
          });
        }
        reply.header('cache-control', 'no-store');
        const progress = await progressRepository.getProgress(account.id);
        if (leaderboardRepository) {
          const synced = await syncLeaderboardProgress(
            account.id,
            progress,
            leaderboardRepository,
            progressRepository,
          );
          if (synced) return progressRepository.getProgress(account.id);
        }
        return progress;
      });

      fastify.post<{
        Body?: {
          runId?: unknown;
          difficulty?: unknown;
          score?: unknown;
          level?: unknown;
          averageTimeMs?: unknown;
          bestStreak?: unknown;
          totalCorrect?: unknown;
        };
      }>(
        '/api/account/progress/formula-frenzy/runs',
        {
          config: {
            rateLimit: {
              max: PROGRESS_SAVE_RATE_LIMIT_MAX,
              timeWindow: PROGRESS_SAVE_RATE_LIMIT_WINDOW,
            },
          },
        },
        async (request, reply) => {
          let account: AccountRecord;
          try {
            account = await requireAccount(request);
          } catch (error) {
            return reply.code(401).send({
              message:
                error instanceof Error ? error.message : 'Account authentication is required.',
            });
          }
          try {
            const difficulty =
              typeof request.body?.difficulty === 'string' ? request.body.difficulty : 'normal';
            if (!isProgressDifficulty(difficulty)) {
              return reply.code(400).send({ message: 'Progress difficulty is invalid.' });
            }
            const run: FormulaFrenzyRunInput = {
              accountId: account.id,
              runId: validateProgressRunId(request.body?.runId),
              difficulty,
              score: parseBoundedInteger(request.body?.score, 'Score', 0, 1_000_000_000),
              level: parseBoundedInteger(request.body?.level, 'Level', 1, 1_000),
              averageTimeMs: parseNullableBoundedInteger(
                request.body?.averageTimeMs,
                'Average time',
                0,
                60 * 60 * 1000,
              ),
              bestStreak: parseBoundedInteger(
                request.body?.bestStreak,
                'Best streak',
                0,
                1_000_000,
              ),
              totalCorrect: parseBoundedInteger(
                request.body?.totalCorrect,
                'Total correct',
                0,
                1_000_000,
              ),
            };
            return progressRepository.saveFormulaFrenzyRun(run);
          } catch (error) {
            return reply.code(400).send({
              message: error instanceof Error ? error.message : 'Could not save progress.',
            });
          }
        },
      );
    }
  }

  if (leaderboardRepository) {
    fastify.get<{
      Params: { gameId: string };
      Querystring: {
        page?: unknown;
        pageSize?: unknown;
        sort?: unknown;
        difficulty?: unknown;
        username?: unknown;
      };
    }>('/api/leaderboards/:gameId', async (request, reply) => {
      try {
        if (!isLeaderboardGameId(request.params.gameId)) {
          return reply.code(404).send({ message: 'Leaderboard game is not supported.' });
        }
        const page = parsePositiveInteger(request.query.page, 1, 1, 100_000);
        const pageSize = parsePositiveInteger(request.query.pageSize, 10, 1, 50);
        const sortValue = typeof request.query.sort === 'string' ? request.query.sort : 'rank';
        if (!isLeaderboardSort(sortValue)) {
          return reply.code(400).send({ message: 'Leaderboard sort is invalid.' });
        }
        const difficultyValue =
          typeof request.query.difficulty === 'string' ? request.query.difficulty : 'normal';
        if (!isLeaderboardDifficulty(difficultyValue)) {
          return reply.code(400).send({ message: 'Leaderboard difficulty is invalid.' });
        }
        const username =
          typeof request.query.username === 'string' && request.query.username.trim()
            ? validateUsername(request.query.username)
            : undefined;
        reply.header('cache-control', 'no-store');
        return leaderboardRepository.list({
          gameId: request.params.gameId,
          difficulty: difficultyValue,
          page,
          pageSize,
          sort: sortValue,
          username,
        });
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Could not load leaderboard.',
        });
      }
    });

    fastify.post<{
      Params: { gameId: string };
      Body?: {
        score?: unknown;
        difficulty?: unknown;
        level?: unknown;
        averageTimeMs?: unknown;
        bestStreak?: unknown;
        totalCorrect?: unknown;
      };
    }>(
      '/api/leaderboards/:gameId/entries',
      {
        config: {
          rateLimit: {
            max: LEADERBOARD_SAVE_RATE_LIMIT_MAX,
            timeWindow: LEADERBOARD_SAVE_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        if (!isLeaderboardGameId(request.params.gameId)) {
          return reply.code(404).send({ message: 'Leaderboard game is not supported.' });
        }
        let account: AccountRecord;
        try {
          account = await requireAccount(request);
        } catch (error) {
          return reply.code(401).send({
            message: error instanceof Error ? error.message : 'Account authentication is required.',
          });
        }
        try {
          const score = parseBoundedInteger(request.body?.score, 'Score', 0, 1_000_000_000);
          const level = parseBoundedInteger(request.body?.level, 'Level', 1, 1_000);
          const averageTimeMs = parseNullableBoundedInteger(
            request.body?.averageTimeMs,
            'Average time',
            0,
            60 * 60 * 1000,
          );
          const bestStreak = parseBoundedInteger(
            request.body?.bestStreak,
            'Best streak',
            0,
            1_000_000,
          );
          const totalCorrect = parseBoundedInteger(
            request.body?.totalCorrect,
            'Total correct',
            0,
            1_000_000,
          );
          const difficulty =
            typeof request.body?.difficulty === 'string' ? request.body.difficulty : 'normal';
          if (!isLeaderboardDifficulty(difficulty)) {
            return reply.code(400).send({ message: 'Leaderboard difficulty is invalid.' });
          }
          const entry: LeaderboardScoreInput = {
            gameId: request.params.gameId,
            difficulty,
            accountId: account.id,
            username: account.username,
            score,
            level,
            averageTimeMs,
            bestStreak,
            totalCorrect,
          };
          return leaderboardRepository.saveBest(entry);
        } catch (error) {
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not save leaderboard score.',
          });
        }
      },
    );
  }

  fastify.post<{ Body?: { displayName?: unknown } }>(
    '/api/auth/guest',
    {
      config: {
        rateLimit: {
          max: GUEST_AUTH_RATE_LIMIT_MAX,
          timeWindow: GUEST_AUTH_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      if (!options.issueGuestSession) {
        metrics.recordGuestAuth('rejected');
        return reply.code(503).send({ message: 'Guest authentication is not configured.' });
      }
      const displayName = request.body?.displayName;
      if (typeof displayName !== 'string') {
        metrics.recordGuestAuth('rejected');
        return reply.code(400).send({ message: 'Display name is required.' });
      }
      try {
        const session = await options.issueGuestSession(displayName);
        metrics.recordGuestAuth('accepted');
        return session;
      } catch (error) {
        metrics.recordGuestAuth('rejected');
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Display name is required.',
        });
      }
    },
  );
  if (options.staticRoot || options.browserConfig) {
    if (!options.staticRoot || !options.browserConfig) {
      throw new Error('staticRoot and browserConfig must be configured together.');
    }
    const siteOrigin = canonicalOrigin(
      options.browserConfig.siteUrl ?? options.browserConfig.serverUrl,
    );
    fastify.get('/config.js', async (_request, reply) => {
      const config = JSON.stringify(options.browserConfig).replaceAll('<', '\\u003c');
      return reply
        .header('cache-control', 'no-store')
        .type('application/javascript')
        .send(`window.MATH_WAR_CONFIG = ${config};\n`);
    });
    fastify.get('/robots.txt', async (_request, reply) => {
      return reply
        .header('cache-control', 'public, max-age=3600')
        .type('text/plain')
        .send(createRobotsTxt(siteOrigin));
    });
    fastify.get('/sitemap.xml', async (_request, reply) => {
      return reply
        .header('cache-control', 'public, max-age=3600')
        .type('application/xml')
        .send(createSitemapXml(siteOrigin));
    });
    await fastify.register(fastifyStatic, {
      root: options.staticRoot,
      wildcard: false,
      globIgnore: ['config.js'],
    });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ message: 'Route not found.' });
      }
      if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.code(404).send({ message: 'Route not found.' });
    });
  }
}

async function syncLeaderboardProgress(
  accountId: string,
  progress: AccountProgress,
  leaderboardRepository: LeaderboardRepository,
  progressRepository: AccountProgressRepository,
): Promise<boolean> {
  const entries = await leaderboardRepository.listAccountEntries({
    gameId: 'formula-frenzy',
    accountId,
  });
  const missingEntries = entries.filter((entry) =>
    leaderboardEntryIsAheadOfProgress(entry, progress),
  );
  await Promise.all(
    missingEntries.map((entry) =>
      progressRepository.saveFormulaFrenzyRun({
        accountId,
        runId: leaderboardProgressRunId(entry),
        difficulty: entry.difficulty,
        score: entry.score,
        level: entry.level,
        averageTimeMs: entry.averageTimeMs,
        bestStreak: entry.bestStreak,
        totalCorrect: entry.totalCorrect,
      }),
    ),
  );
  return missingEntries.length > 0;
}

function leaderboardProgressRunId(entry: LeaderboardEntry): string {
  const updatedAt = Date.parse(entry.updatedAt);
  const updatedAtToken = Number.isFinite(updatedAt) ? updatedAt.toString(36) : '0';
  return `leaderboard-${entry.id}-${updatedAtToken}`;
}

function leaderboardEntryIsAheadOfProgress(
  entry: LeaderboardEntry,
  progress: AccountProgress,
): boolean {
  const stats = progress.stats.find(
    (current) => current.gameId === entry.gameId && current.difficulty === entry.difficulty,
  );
  if (!stats) return true;
  const entryAverage = entry.averageTimeMs ?? Number.POSITIVE_INFINITY;
  const statsAverage = stats.bestAverageTimeMs ?? Number.POSITIVE_INFINITY;
  return (
    entry.score > stats.bestScore ||
    entry.level > stats.bestLevel ||
    entry.bestStreak > stats.bestStreak ||
    entry.totalCorrect > stats.totalCorrect ||
    entryAverage < statsAverage
  );
}
