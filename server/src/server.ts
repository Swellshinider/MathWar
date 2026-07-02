import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  CommandAck,
  createFormulaFrenzyMatchState,
  createMatchState,
  expireFormulaFrenzyPlayer,
  expiredFormulaFrenzyPlayer,
  FireCommand,
  FormulaFrenzyAnswerCommand,
  FormulaFrenzyHintCommand,
  FormulaFrenzyMatchState,
  FormulaFrenzyTypingCommand,
  GameId,
  MatchEndedEvent,
  MatchState,
  MultiplayerMatchState,
  requestFormulaFrenzyHint,
  resolveFormulaFrenzyAnswer,
  resolveShot,
  RoomJoinCommand,
  sanitizeFormulaFrenzyState,
  startFormulaFrenzyMatch,
  VersionedCommand,
} from '@math-war/game-engine';
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
} from './account-auth.js';
import { AccountRecord, AccountRepository } from './account-repository.js';
import { UsernameAvailabilityCache } from './account-username-cache.js';
import { canJoinWaitingRoom, canStartFormulaMatch, isMatchPlayer } from './authorization.js';
import { TokenVerifier } from './auth.js';
import {
  isLeaderboardGameId,
  isLeaderboardSort,
  LeaderboardRepository,
  LeaderboardScoreInput,
} from './leaderboard-repository.js';
import { logCommand } from './observability/logging.js';
import {
  createMathWarMetrics,
  MathWarMetrics,
  nowSeconds,
  routeMetricLabel,
  SocketCommand,
} from './observability/metrics.js';
import { InstrumentedMatchRepository } from './observability/repository.js';
import { MatchRepository } from './repository.js';
import { SocketAdapterHandle } from './redis-adapter.js';

interface AuthenticatedSocket extends Socket {
  data: { user: AuthenticatedUser; matchId?: string };
}

type Ack<T = undefined> = (response: CommandAck<T>) => void;
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HTTP_BODY_LIMIT_BYTES = 512 * 1024;
const GUEST_AUTH_RATE_LIMIT_MAX = 10;
const GUEST_AUTH_RATE_LIMIT_WINDOW = '1 minute';
const ACCOUNT_AUTH_RATE_LIMIT_MAX = 10;
const ACCOUNT_AUTH_RATE_LIMIT_WINDOW = '1 minute';
const ACCOUNT_USERNAME_CHECK_RATE_LIMIT_MAX = 60;
const ACCOUNT_USERNAME_CHECK_RATE_LIMIT_WINDOW = '1 minute';
const LEADERBOARD_SAVE_RATE_LIMIT_MAX = 30;
const LEADERBOARD_SAVE_RATE_LIMIT_WINDOW = '1 minute';
const SOCKET_CONNECT_LIMIT = 100;
const SOCKET_CONNECT_WINDOW_MS = 60_000;
const SOCKET_JOIN_CREATE_LIMIT = 20;
const SOCKET_COMMAND_LIMIT = 120;
const SOCKET_TYPING_LIMIT = 240;
const SOCKET_COMMAND_WINDOW_MS = 60_000;

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

interface RateBucket {
  count: number;
  resetAt: number;
}

function roomName(matchId: string): string {
  return `match:${matchId}`;
}
function userRoomName(userId: string): string {
  return `user:${userId}`;
}
function stateGameId(state: MultiplayerMatchState): GameId {
  return state.gameId ?? 'equation-artillery';
}
function publicState<T extends MultiplayerMatchState>(state: T): T {
  return (
    stateGameId(state) === 'formula-frenzy'
      ? sanitizeFormulaFrenzyState(state as FormulaFrenzyMatchState)
      : state
  ) as T;
}
function setPlayerConnected(
  state: MultiplayerMatchState,
  userId: string,
  connected: boolean,
): MultiplayerMatchState {
  const players = state.players.map((player) =>
    player.userId === userId ? { ...player, connected } : player,
  );
  if (stateGameId(state) !== 'formula-frenzy') return { ...state, players };
  return {
    ...(state as FormulaFrenzyMatchState),
    players,
    formulaPlayers: (state as FormulaFrenzyMatchState).formulaPlayers.map((player) =>
      player.userId === userId ? { ...player, connected } : player,
    ),
  };
}
function createRoomCode(): string {
  const bytes = randomBytes(8);
  const characters = [...bytes].map((byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]);
  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}
function normalizeRoomCode(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  if (/^[A-Z0-9]{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return value.trim().toUpperCase();
}
function socketAddress(socket: Socket): string {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
}
function createFixedWindowLimiter(windowMs: number) {
  const buckets = new Map<string, RateBucket>();
  return (key: string, limit: number): boolean => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > limit) return false;
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}
function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
function isMetricsRequestAuthorized(authorization: string | undefined): boolean {
  const token = process.env['METRICS_TOKEN'];
  const requiresToken = process.env['NODE_ENV'] === 'production' || !!token;
  if (!requiresToken) return true;
  if (!token || !authorization?.startsWith('Bearer ')) return false;
  return timingSafeStringEqual(authorization.slice('Bearer '.length), token);
}
function parsePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}.`);
  }
  return parsed;
}
function parseBoundedInteger(value: unknown, label: string, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}
function parseNullableBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null) return null;
  return parseBoundedInteger(value, label, min, max);
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
function cspConnectSrc(allowedOrigin: string): string[] {
  if (allowedOrigin === '*') return ["'self'", 'http:', 'https:', 'ws:', 'wss:'];
  const sources = new Set(["'self'", allowedOrigin]);
  try {
    const origin = new URL(allowedOrigin);
    sources.add(`${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`);
  } catch {}
  return [...sources];
}
function canonicalOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}
function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
function seoPublicPaths(): readonly string[] {
  return [
    '/',
    '/about',
    '/games/equation-artillery',
    '/games/formula-frenzy',
    '/leaderboard/formula-frenzy',
  ];
}
function createRobotsTxt(siteOrigin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /socket.io/',
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}
function createSitemapXml(siteOrigin: string): string {
  const urls = seoPublicPaths()
    .map((path) => {
      const loc = path === '/' ? siteOrigin : `${siteOrigin}${path}`;
      return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
function isVersionedCommand(value: unknown): value is VersionedCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<VersionedCommand>;
  return (
    typeof command.commandId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(command.commandId) &&
    Number.isInteger(command.expectedVersion) &&
    (command.expectedVersion ?? -1) >= 0
  );
}
function requestedGameId(command: Pick<VersionedCommand, 'gameId'>): GameId {
  return command.gameId ?? 'equation-artillery';
}
function isFormulaAnswerCommand(value: unknown): value is FormulaFrenzyAnswerCommand {
  if (!isVersionedCommand(value)) return false;
  return typeof (value as Partial<FormulaFrenzyAnswerCommand>).answer === 'number';
}
function isFormulaHintCommand(value: unknown): value is FormulaFrenzyHintCommand {
  return isVersionedCommand(value);
}
function isFormulaTypingCommand(value: unknown): value is FormulaFrenzyTypingCommand {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as FormulaFrenzyTypingCommand).input === 'string';
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
  const metricsEnabled = process.env['METRICS_ENABLED'] !== 'false';
  const repository = new InstrumentedMatchRepository(options.repository, metrics);
  const accountOptions = options.accounts;
  const accountRepository = accountOptions?.repository;
  const leaderboardRepository = options.leaderboardRepository;
  const usernameAvailabilityCache = accountOptions?.usernameAvailabilityCache;
  const accountTokenVerifier = accountOptions
    ? createAccountTokenVerifier(accountOptions.accessTokenSecret)
    : null;
  const refreshCookieSecure =
    accountOptions?.refreshCookieSecure ?? process.env['NODE_ENV'] === 'production';
  const requestStarts = new WeakMap<object, number>();
  const socketConnectLimiter = createFixedWindowLimiter(SOCKET_CONNECT_WINDOW_MS);
  const socketCommandLimiter = createFixedWindowLimiter(SOCKET_COMMAND_WINDOW_MS);

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
  }

  if (leaderboardRepository) {
    fastify.get<{
      Params: { gameId: string };
      Querystring: {
        page?: unknown;
        pageSize?: unknown;
        sort?: unknown;
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
        const username =
          typeof request.query.username === 'string' && request.query.username.trim()
            ? validateUsername(request.query.username)
            : undefined;
        reply.header('cache-control', 'no-store');
        return leaderboardRepository.list({
          gameId: request.params.gameId,
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
          const entry: LeaderboardScoreInput = {
            gameId: request.params.gameId,
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
  const io = new SocketServer(fastify.server, {
    cors: { origin: options.allowedOrigin, methods: ['GET', 'POST'] },
  });
  const socketAdapterHandle = await options.configureSocketAdapter?.(io);
  const reconnectWindowMs = options.reconnectWindowMs ?? 60_000;
  const idleCleanupMs = options.idleCleanupMs ?? 10 * 60_000;
  const activeFormulaMatchIds = new Set<string>();
  const activeMatchRoomIds = new Set<string>();
  const formulaDeadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function trackActiveRoom(matchId: string): void {
    activeMatchRoomIds.add(matchId);
  }

  function untrackActiveRoom(matchId: string): void {
    activeMatchRoomIds.delete(matchId);
  }

  function updateActiveGauges(): void {
    metrics.setActiveSockets(io.engine.clientsCount);
    metrics.setActiveMatches(activeMatchRoomIds.size);
  }

  function observedAck<T>(
    command: SocketCommand,
    start: number,
    ack: Ack<T>,
    gameId?: GameId,
    matchStatus?: MultiplayerMatchState['status'],
  ): Ack<T> {
    return (response) => {
      const outcome = response.ok ? 'accepted' : 'rejected';
      const code = response.ok ? 'OK' : (response.code ?? 'UNKNOWN');
      const durationSeconds = nowSeconds() - start;
      metrics.recordSocketCommand(command, outcome, code, durationSeconds);
      logCommand(fastify.log, {
        command,
        outcome,
        code,
        gameId,
        matchStatus,
        durationMs: durationSeconds * 1000,
      });
      ack(response);
    };
  }

  io.use(async (socket, next) => {
    if (!socketConnectLimiter(socketAddress(socket), SOCKET_CONNECT_LIMIT)) {
      metrics.recordSocketAuthFailure('rate_limited');
      return next(new Error('Too many connection attempts.'));
    }
    const token = socket.handshake.auth?.['token'];
    if (typeof token !== 'string' || !token) {
      metrics.recordSocketAuthFailure('missing_token');
      return next(new Error('Authentication required.'));
    }
    try {
      (socket as AuthenticatedSocket).data.user = await options.verifyToken(token);
      next();
    } catch {
      metrics.recordSocketAuthFailure('invalid_token');
      next(new Error('Invalid access token.'));
    }
  });

  async function emitState(state: MultiplayerMatchState): Promise<void> {
    const emittedState = publicState(state);
    io.to(roomName(state.id)).emit('match:state', emittedState);
    if (state.status === 'ended' && state.endReason) {
      const event: MatchEndedEvent = {
        matchId: state.id,
        version: state.version,
        winnerUserId: state.winnerUserId,
        reason: state.endReason,
      };
      io.to(roomName(state.id)).emit('match:ended', event);
    }
  }

  function trackFormulaMatch(state: MultiplayerMatchState): void {
    clearFormulaDeadlineTimer(state.id);
    if (stateGameId(state) === 'formula-frenzy' && state.status === 'active') {
      activeFormulaMatchIds.add(state.id);
      scheduleFormulaDeadline(state as FormulaFrenzyMatchState);
      return;
    }
    activeFormulaMatchIds.delete(state.id);
  }

  function clearFormulaDeadlineTimer(matchId: string): void {
    const timer = formulaDeadlineTimers.get(matchId);
    if (!timer) return;
    clearTimeout(timer);
    formulaDeadlineTimers.delete(matchId);
  }

  function nextFormulaDeadlineAt(state: FormulaFrenzyMatchState): number | null {
    let deadlineAt: number | null = null;
    for (const player of state.formulaPlayers) {
      const startedAt = new Date(player.currentProblem.startedAt).getTime();
      const candidate = startedAt + player.currentProblem.deadlineMs;
      if (!Number.isFinite(candidate)) continue;
      deadlineAt = deadlineAt === null ? candidate : Math.min(deadlineAt, candidate);
    }
    return deadlineAt;
  }

  function scheduleFormulaDeadline(state: FormulaFrenzyMatchState): void {
    const deadlineAt = nextFormulaDeadlineAt(state);
    if (deadlineAt === null) return;
    const timer = setTimeout(
      () => void expireFormulaDeadline(state.id),
      Math.max(0, deadlineAt - Date.now()),
    );
    timer.unref();
    formulaDeadlineTimers.set(state.id, timer);
  }

  async function expireFormulaDeadline(matchId: string): Promise<void> {
    formulaDeadlineTimers.delete(matchId);
    const now = new Date();
    const match = await repository.findById(matchId);
    if (!match || stateGameId(match) !== 'formula-frenzy' || match.status !== 'active') {
      activeFormulaMatchIds.delete(matchId);
      return;
    }
    const expiredUserId = expiredFormulaFrenzyPlayer(match as FormulaFrenzyMatchState, now);
    if (!expiredUserId) {
      trackFormulaMatch(match);
      return;
    }
    const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
      stateGameId(state) === 'formula-frenzy'
        ? expireFormulaFrenzyPlayer(state as FormulaFrenzyMatchState, expiredUserId, now)
        : state,
    );
    if (result.ok) {
      trackFormulaMatch(result.state);
      await emitState(result.state);
    }
  }

  async function isRoomEmpty(matchId: string): Promise<boolean> {
    return (await io.in(roomName(matchId)).allSockets()).size === 0;
  }

  async function hasUserSockets(userId: string): Promise<boolean> {
    return (await io.in(userRoomName(userId)).allSockets()).size > 0;
  }

  async function clearRoomEmpty(matchId: string): Promise<void> {
    await repository.clearRoomEmpty(matchId);
  }

  async function markRoomEmptyIfNeeded(matchId: string, emptySince: Date): Promise<void> {
    if (!(await isRoomEmpty(matchId))) return;
    untrackActiveRoom(matchId);
    await repository.markRoomEmpty(matchId, emptySince);
  }

  async function deleteEndedMatchIfRoomEmpty(
    matchId: string,
    knownState?: MultiplayerMatchState,
  ): Promise<boolean> {
    if (!(await isRoomEmpty(matchId))) return false;
    const state = knownState ?? (await repository.findById(matchId));
    if (!state || state.status !== 'ended') return false;
    activeFormulaMatchIds.delete(matchId);
    clearFormulaDeadlineTimer(matchId);
    untrackActiveRoom(matchId);
    const deleted = await repository.delete(matchId);
    metrics.recordCleanupDeleted('empty', deleted ? 1 : 0);
    updateActiveGauges();
    return deleted;
  }

  async function reconnect(socket: AuthenticatedSocket): Promise<void> {
    const start = nowSeconds();
    const match = await repository.findActiveByUser(socket.data.user.id);
    if (!match) {
      metrics.recordResumeCheck('miss');
      logCommand(fastify.log, {
        command: 'reconnect',
        outcome: 'miss',
        durationMs: (nowSeconds() - start) * 1000,
      });
      return;
    }
    metrics.recordResumeCheck('hit');
    socket.data.matchId = match.id;
    await socket.join(roomName(match.id));
    trackActiveRoom(match.id);
    await clearRoomEmpty(match.id);
    updateActiveGauges();
    const player = match.players.find((candidate) => candidate.userId === socket.data.user.id);
    if (match.status === 'paused' && match.disconnectedUserId === socket.data.user.id && player) {
      const result = await repository.update(match.id, match.version, randomUUID(), (state) => ({
        ...setPlayerConnected(state, socket.data.user.id, true),
        version: state.version + 1,
        status: 'active',
        disconnectedUserId: null,
        reconnectDeadline: null,
        updatedAt: new Date().toISOString(),
      }));
      if (result.ok) {
        metrics.recordReconnect('success');
        logCommand(fastify.log, {
          command: 'reconnect',
          outcome: 'success',
          gameId: stateGameId(result.state),
          matchStatus: result.state.status,
          durationMs: (nowSeconds() - start) * 1000,
        });
        trackFormulaMatch(result.state);
        socket.emit('room:state', publicState(result.state));
        await emitState(result.state);
        return;
      }
      metrics.recordReconnect('failure');
    }
    logCommand(fastify.log, {
      command: 'reconnect',
      outcome: 'success',
      gameId: stateGameId(match),
      matchStatus: match.status,
      durationMs: (nowSeconds() - start) * 1000,
    });
    socket.emit('room:state', publicState(match));
  }

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userRoomJoin = Promise.resolve(socket.join(userRoomName(socket.data.user.id)));
    metrics.recordSocketConnection();
    updateActiveGauges();
    void userRoomJoin
      .then(() => reconnect(socket))
      .catch((error: unknown) => {
        fastify.log.error({ error }, 'Failed to join user Socket.IO room');
      });

    function acceptSocketCommand(command: SocketCommand, limit = SOCKET_COMMAND_LIMIT): boolean {
      const userKey = `${socket.data.user.id}:${command}`;
      const addressKey = `${socketAddress(socket)}:${command}`;
      if (socketCommandLimiter(userKey, limit) && socketCommandLimiter(addressKey, limit * 2)) {
        return true;
      }
      metrics.recordSocketCommand(command, 'rejected', 'RATE_LIMITED', 0);
      return false;
    }

    socket.on('room:create', async (command: VersionedCommand, ack: Ack<MultiplayerMatchState>) => {
      if (!acceptSocketCommand('room:create', SOCKET_JOIN_CREATE_LIMIT)) {
        return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many room requests.' });
      }
      const acknowledge = observedAck(
        'room:create',
        nowSeconds(),
        ack,
        isVersionedCommand(command) ? requestedGameId(command) : undefined,
      );
      if (!isVersionedCommand(command) || command.expectedVersion !== 0)
        return acknowledge({
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'Invalid create command.',
        });
      const activeMatch = await repository.findActiveByUser(socket.data.user.id);
      if (activeMatch)
        return acknowledge({
          ok: false,
          code: 'ALREADY_IN_MATCH',
          error: 'Leave the current match first.',
          data: publicState(activeMatch),
        });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const roomCode = createRoomCode();
        const seed = randomBytes(32).toString('hex');
        const player = { userId: socket.data.user.id, displayName: socket.data.user.displayName };
        const state =
          requestedGameId(command) === 'formula-frenzy'
            ? createFormulaFrenzyMatchState(randomUUID(), roomCode, seed, player)
            : createMatchState(randomUUID(), roomCode, seed, player);
        if (await repository.create(state, command.commandId)) {
          socket.data.matchId = state.id;
          await socket.join(roomName(state.id));
          trackActiveRoom(state.id);
          await clearRoomEmpty(state.id);
          updateActiveGauges();
          socket.emit('room:state', publicState(state));
          return acknowledge({ ok: true, data: publicState(state) });
        }
      }
      acknowledge({
        ok: false,
        code: 'ROOM_CODE_EXHAUSTED',
        error: 'Could not allocate a room code.',
      });
    });

    socket.on('room:join', async (command: RoomJoinCommand, ack: Ack<MultiplayerMatchState>) => {
      if (!acceptSocketCommand('room:join', SOCKET_JOIN_CREATE_LIMIT)) {
        return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many room requests.' });
      }
      const acknowledge = observedAck(
        'room:join',
        nowSeconds(),
        ack,
        isVersionedCommand(command) ? requestedGameId(command) : undefined,
      );
      if (!isVersionedCommand(command) || typeof command.roomCode !== 'string')
        return acknowledge({ ok: false, code: 'INVALID_COMMAND', error: 'Invalid join command.' });
      const activeMatch = await repository.findActiveByUser(socket.data.user.id);
      if (activeMatch)
        return acknowledge({
          ok: false,
          code: 'ALREADY_IN_MATCH',
          error: 'Leave the current match first.',
          data: publicState(activeMatch),
        });
      const match = await repository.findByCode(normalizeRoomCode(command.roomCode));
      if (
        !match ||
        !canJoinWaitingRoom(match, socket.data.user.id) ||
        stateGameId(match) !== requestedGameId(command)
      )
        return acknowledge({
          ok: false,
          code: 'ROOM_UNAVAILABLE',
          error: 'Room not found or already full.',
        });
      const result = await repository.update(
        match.id,
        match.version,
        command.commandId,
        (current) => {
          const opponent = {
            userId: socket.data.user.id,
            displayName: socket.data.user.displayName,
          };
          const started =
            stateGameId(current) === 'formula-frenzy'
              ? createFormulaFrenzyMatchState(
                  current.id,
                  current.roomCode,
                  current.seed,
                  current.players[0],
                  opponent,
                  new Date(current.createdAt),
                )
              : createMatchState(
                  current.id,
                  current.roomCode,
                  current.seed,
                  current.players[0],
                  opponent,
                  new Date(current.createdAt),
                );
          return { ...started, version: current.version + 1, updatedAt: new Date().toISOString() };
        },
      );
      if (!result.ok)
        return acknowledge({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Join rejected: ${result.reason}.`,
        });
      socket.data.matchId = result.state.id;
      await socket.join(roomName(result.state.id));
      trackActiveRoom(result.state.id);
      await clearRoomEmpty(result.state.id);
      updateActiveGauges();
      io.to(roomName(result.state.id)).emit('match:started', publicState(result.state));
      await emitState(result.state);
      acknowledge({ ok: true, data: publicState(result.state) });
    });

    socket.on('match:fire', async (command: FireCommand, ack: Ack<MatchState>) => {
      if (!acceptSocketCommand('match:fire')) {
        return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many match commands.' });
      }
      const acknowledge = observedAck('match:fire', nowSeconds(), ack, 'equation-artillery');
      if (!isVersionedCommand(command) || typeof command.equation !== 'string')
        return acknowledge({
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'Invalid fire command.',
        });
      const matchId = socket.data.matchId;
      if (!matchId)
        return acknowledge({ ok: false, code: 'NOT_IN_MATCH', error: 'Join a match first.' });
      const match = await repository.findById(matchId);
      if (!match) return acknowledge({ ok: false, code: 'MISSING', error: 'Match not found.' });
      if (!isMatchPlayer(match, socket.data.user.id))
        return acknowledge({ ok: false, code: 'FORBIDDEN', error: 'Not a match player.' });
      if (stateGameId(match) !== 'equation-artillery')
        return acknowledge({
          ok: false,
          code: 'WRONG_GAME',
          error: 'This room is not Equation Artillery.',
        });
      const artilleryMatch = match as MatchState;
      if (artilleryMatch.status !== 'active')
        return acknowledge({
          ok: false,
          code: 'NOT_ACTIVE',
          error: 'The match is not active.',
        });
      if (artilleryMatch.turnUserId !== socket.data.user.id)
        return acknowledge({ ok: false, code: 'OUT_OF_TURN', error: 'It is not your turn.' });
      const shotStart = nowSeconds();
      let shot = resolveShot(
        artilleryMatch,
        socket.data.user.id,
        command.commandId,
        command.equation,
        new Date(),
        {
          expressionCompiled: (durationMs, outcome) => {
            metrics.observeGameOperation(
              'equation-artillery',
              'expression_compile',
              outcome,
              durationMs / 1000,
            );
          },
        },
      );
      metrics.observeGameOperation(
        'equation-artillery',
        'resolve_shot',
        shot.impact === 'invalid' ? 'invalid' : 'ok',
        nowSeconds() - shotStart,
      );
      metrics.recordShot(shot.impact, shot.trail.length);
      const result = await repository.update(
        match.id,
        command.expectedVersion,
        command.commandId,
        () => shot.state,
      );
      if (!result.ok)
        return acknowledge({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Shot rejected: ${result.reason}.`,
        });
      shot = { ...shot, state: result.state as MatchState, version: result.state.version };
      io.to(roomName(match.id)).emit('shot:resolved', shot);
      await emitState(result.state);
      acknowledge({ ok: true, data: result.state as MatchState });
    });

    socket.on(
      'formula:start',
      async (command: VersionedCommand, ack: Ack<FormulaFrenzyMatchState>) => {
        if (!acceptSocketCommand('formula:start')) {
          return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many match commands.' });
        }
        const acknowledge = observedAck('formula:start', nowSeconds(), ack, 'formula-frenzy');
        if (!isVersionedCommand(command))
          return acknowledge({
            ok: false,
            code: 'INVALID_COMMAND',
            error: 'Invalid start command.',
          });
        const matchId = socket.data.matchId;
        if (!matchId)
          return acknowledge({ ok: false, code: 'NOT_IN_MATCH', error: 'Join a match first.' });
        const match = await repository.findById(matchId);
        if (!match) return acknowledge({ ok: false, code: 'MISSING', error: 'Match not found.' });
        if (!isMatchPlayer(match, socket.data.user.id))
          return acknowledge({ ok: false, code: 'FORBIDDEN', error: 'Not a match player.' });
        if (stateGameId(match) !== 'formula-frenzy')
          return acknowledge({
            ok: false,
            code: 'WRONG_GAME',
            error: 'This room is not Formula Frenzy.',
          });
        if (match.players.length < 2)
          return acknowledge({
            ok: false,
            code: 'WAITING',
            error: 'Waiting for the second player.',
          });
        if (
          (match.status === 'waiting' || match.status === 'ended') &&
          !canStartFormulaMatch(match, socket.data.user.id)
        )
          return acknowledge({
            ok: false,
            code: 'OUT_OF_TURN',
            error: 'Only the host can start.',
          });
        if (match.status !== 'waiting' && match.status !== 'ended')
          return acknowledge({
            ok: false,
            code: 'NOT_READY',
            error: 'The match is already active.',
          });
        const formulaStart = nowSeconds();
        const result = await repository.update(
          match.id,
          command.expectedVersion,
          command.commandId,
          (state) => {
            const next =
              stateGameId(state) === 'formula-frenzy'
                ? startFormulaFrenzyMatch(state as FormulaFrenzyMatchState)
                : state;
            metrics.observeGameOperation(
              'formula-frenzy',
              'formula_start',
              'ok',
              nowSeconds() - formulaStart,
            );
            return next;
          },
        );
        if (!result.ok)
          return acknowledge({
            ok: false,
            code: result.reason.toUpperCase(),
            error: `Start rejected: ${result.reason}.`,
          });
        trackFormulaMatch(result.state);
        io.to(roomName(result.state.id)).emit('match:started', publicState(result.state));
        await emitState(result.state);
        acknowledge({ ok: true, data: publicState(result.state as FormulaFrenzyMatchState) });
      },
    );

    socket.on(
      'formula:answer',
      async (command: FormulaFrenzyAnswerCommand, ack: Ack<FormulaFrenzyMatchState>) => {
        if (!acceptSocketCommand('formula:answer')) {
          return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many match commands.' });
        }
        const acknowledge = observedAck('formula:answer', nowSeconds(), ack, 'formula-frenzy');
        if (!isFormulaAnswerCommand(command))
          return acknowledge({
            ok: false,
            code: 'INVALID_COMMAND',
            error: 'Invalid answer command.',
          });
        const matchId = socket.data.matchId;
        if (!matchId)
          return acknowledge({ ok: false, code: 'NOT_IN_MATCH', error: 'Join a match first.' });
        const match = await repository.findById(matchId);
        if (!match) return acknowledge({ ok: false, code: 'MISSING', error: 'Match not found.' });
        if (!isMatchPlayer(match, socket.data.user.id))
          return acknowledge({ ok: false, code: 'FORBIDDEN', error: 'Not a match player.' });
        if (stateGameId(match) !== 'formula-frenzy')
          return acknowledge({
            ok: false,
            code: 'WRONG_GAME',
            error: 'This room is not Formula Frenzy.',
          });
        if (match.status !== 'active')
          return acknowledge({
            ok: false,
            code: 'NOT_ACTIVE',
            error: 'The match is not active.',
          });
        const answerStart = nowSeconds();
        const resolved = resolveFormulaFrenzyAnswer(
          match as FormulaFrenzyMatchState,
          socket.data.user.id,
          command.answer,
        );
        metrics.observeGameOperation(
          'formula-frenzy',
          'formula_answer',
          resolved.ok ? 'ok' : resolved.state === match ? 'invalid' : 'ok',
          nowSeconds() - answerStart,
        );
        if (!resolved.ok) {
          metrics.recordFormulaAnswer('wrong');
          if (resolved.state === match)
            return acknowledge({
              ok: false,
              code: 'WRONG_ANSWER',
              error: 'The answer is not correct.',
            });
          const missed = await repository.update(
            match.id,
            command.expectedVersion,
            command.commandId,
            () => resolved.state,
          );
          if (!missed.ok)
            return acknowledge({
              ok: false,
              code: missed.reason.toUpperCase(),
              error: `Answer rejected: ${missed.reason}.`,
            });
          trackFormulaMatch(missed.state);
          await emitState(missed.state);
          return acknowledge({
            ok: false,
            code: 'WRONG_ANSWER',
            error: 'The answer is not correct.',
            data: publicState(missed.state as FormulaFrenzyMatchState),
          });
        }
        metrics.recordFormulaAnswer('correct');
        const next = await repository.update(
          match.id,
          command.expectedVersion,
          command.commandId,
          () => resolved.state,
        );
        if (!next.ok)
          return acknowledge({
            ok: false,
            code: next.reason.toUpperCase(),
            error: `Answer rejected: ${next.reason}.`,
          });
        trackFormulaMatch(next.state);
        await emitState(next.state);
        acknowledge({ ok: true, data: publicState(next.state as FormulaFrenzyMatchState) });
      },
    );

    socket.on(
      'formula:hint',
      async (command: FormulaFrenzyHintCommand, ack: Ack<FormulaFrenzyMatchState>) => {
        if (!acceptSocketCommand('formula:hint')) {
          return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many match commands.' });
        }
        const acknowledge = observedAck('formula:hint', nowSeconds(), ack, 'formula-frenzy');
        if (!isFormulaHintCommand(command))
          return acknowledge({
            ok: false,
            code: 'INVALID_COMMAND',
            error: 'Invalid hint command.',
          });
        const matchId = socket.data.matchId;
        if (!matchId)
          return acknowledge({ ok: false, code: 'NOT_IN_MATCH', error: 'Join a match first.' });
        const match = await repository.findById(matchId);
        if (!match) return acknowledge({ ok: false, code: 'MISSING', error: 'Match not found.' });
        if (!isMatchPlayer(match, socket.data.user.id))
          return acknowledge({ ok: false, code: 'FORBIDDEN', error: 'Not a match player.' });
        if (stateGameId(match) !== 'formula-frenzy')
          return acknowledge({
            ok: false,
            code: 'WRONG_GAME',
            error: 'This room is not Formula Frenzy.',
          });
        if (match.status !== 'active')
          return acknowledge({
            ok: false,
            code: 'NOT_ACTIVE',
            error: 'The match is not active.',
          });
        const hintStart = nowSeconds();
        const now = new Date();
        const expiredUserId = expiredFormulaFrenzyPlayer(match as FormulaFrenzyMatchState, now);
        if (expiredUserId) {
          const expired = await repository.update(
            match.id,
            command.expectedVersion,
            command.commandId,
            (state) =>
              stateGameId(state) === 'formula-frenzy'
                ? expireFormulaFrenzyPlayer(state as FormulaFrenzyMatchState, expiredUserId, now)
                : state,
          );
          if (expired.ok) {
            trackFormulaMatch(expired.state);
            await emitState(expired.state);
            return acknowledge({
              ok: false,
              code: 'NOT_ACTIVE',
              error: 'The match timer expired.',
              data: publicState(expired.state as FormulaFrenzyMatchState),
            });
          }
          return acknowledge({
            ok: false,
            code: expired.reason.toUpperCase(),
            error: `Hint rejected: ${expired.reason}.`,
          });
        }
        const requested = requestFormulaFrenzyHint(
          match as FormulaFrenzyMatchState,
          socket.data.user.id,
        );
        metrics.observeGameOperation(
          'formula-frenzy',
          'formula_hint',
          requested.ok ? 'ok' : 'invalid',
          nowSeconds() - hintStart,
        );
        if (!requested.ok)
          return acknowledge({
            ok: false,
            code: 'HINT_UNAVAILABLE',
            error: 'No hint is available right now.',
          });
        const next = await repository.update(
          match.id,
          command.expectedVersion,
          command.commandId,
          () => requested.state,
        );
        if (!next.ok)
          return acknowledge({
            ok: false,
            code: next.reason.toUpperCase(),
            error: `Hint rejected: ${next.reason}.`,
          });
        trackFormulaMatch(next.state);
        await emitState(next.state);
        acknowledge({ ok: true, data: publicState(next.state as FormulaFrenzyMatchState) });
      },
    );

    socket.on('formula:typing', (command: FormulaFrenzyTypingCommand) => {
      const start = nowSeconds();
      if (!isFormulaTypingCommand(command) || !socket.data.matchId) {
        metrics.recordSocketCommand(
          'formula:typing',
          'rejected',
          'INVALID_COMMAND',
          nowSeconds() - start,
        );
        return;
      }
      if (!acceptSocketCommand('formula:typing', SOCKET_TYPING_LIMIT)) return;
      const input = command.input.slice(0, 24);
      socket.to(roomName(socket.data.matchId)).emit('formula:typing', {
        userId: socket.data.user.id,
        input,
      });
      metrics.recordSocketCommand('formula:typing', 'accepted', 'OK', nowSeconds() - start);
    });

    socket.on('match:leave', async (command: VersionedCommand, ack: Ack<MultiplayerMatchState>) => {
      if (!acceptSocketCommand('match:leave')) {
        return ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many match commands.' });
      }
      const acknowledge = observedAck('match:leave', nowSeconds(), ack);
      if (!isVersionedCommand(command))
        return acknowledge({
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'Invalid leave command.',
        });
      let matchId = socket.data.matchId;
      if (!matchId) matchId = (await repository.findActiveByUser(socket.data.user.id))?.id;
      if (!matchId)
        return acknowledge({ ok: false, code: 'NOT_IN_MATCH', error: 'No active match.' });
      const match = await repository.findById(matchId);
      if (!match) return acknowledge({ ok: false, code: 'MISSING', error: 'Match not found.' });
      if (match.status === 'ended') {
        socket.data.matchId = undefined;
        await socket.leave(roomName(matchId));
        if (await isRoomEmpty(matchId)) untrackActiveRoom(matchId);
        await deleteEndedMatchIfRoomEmpty(matchId, match);
        return acknowledge({ ok: true, data: publicState(match) });
      }
      const result = await repository.update(
        matchId,
        command.expectedVersion,
        command.commandId,
        (state) => {
          const opponent = state.players.find((player) => player.userId !== socket.data.user.id);
          const ended = {
            version: state.version + 1,
            status: 'ended' as const,
            winnerUserId: opponent?.userId ?? null,
            endReason: 'left' as const,
            updatedAt: new Date().toISOString(),
          };
          if (stateGameId(state) === 'formula-frenzy') {
            return { ...(state as FormulaFrenzyMatchState), ...ended };
          }
          return { ...(state as MatchState), ...ended, turnUserId: null, turnCharacterId: null };
        },
      );
      if (!result.ok)
        return acknowledge({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Leave rejected: ${result.reason}.`,
        });
      socket.data.matchId = undefined;
      trackFormulaMatch(result.state);
      await emitState(result.state);
      await socket.leave(roomName(matchId));
      if (await isRoomEmpty(matchId)) untrackActiveRoom(matchId);
      if (!(await deleteEndedMatchIfRoomEmpty(matchId, result.state))) {
        await markRoomEmptyIfNeeded(matchId, new Date());
        updateActiveGauges();
      }
      acknowledge({ ok: true, data: publicState(result.state) });
    });

    socket.on('disconnect', async (reason) => {
      const start = nowSeconds();
      metrics.recordSocketDisconnect(reason);
      updateActiveGauges();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (await hasUserSockets(socket.data.user.id)) {
        metrics.recordSocketCommand('disconnect', 'accepted', 'RECONNECTED', nowSeconds() - start);
        return;
      }
      const now = new Date();
      const match = await repository.findActiveByUser(socket.data.user.id);
      if (!match) {
        if (socket.data.matchId && !(await deleteEndedMatchIfRoomEmpty(socket.data.matchId))) {
          await markRoomEmptyIfNeeded(socket.data.matchId, now);
        }
        updateActiveGauges();
        metrics.recordSocketCommand('disconnect', 'accepted', 'NO_MATCH', nowSeconds() - start);
        return;
      }
      if (match.status === 'active') {
        const userStillConnected = await hasUserSockets(socket.data.user.id);
        const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
          userStillConnected
            ? state
            : {
                ...setPlayerConnected(state, socket.data.user.id, false),
                version: state.version + 1,
                status: 'paused',
                disconnectedUserId: socket.data.user.id,
                reconnectDeadline: new Date(now.getTime() + reconnectWindowMs).toISOString(),
                updatedAt: now.toISOString(),
              },
        );
        if (result.ok) {
          trackFormulaMatch(result.state);
          await emitState(result.state);
          await markRoomEmptyIfNeeded(result.state.id, now);
        }
        updateActiveGauges();
        metrics.recordSocketCommand(
          'disconnect',
          result.ok ? 'accepted' : 'rejected',
          result.ok ? 'PAUSED' : result.reason.toUpperCase(),
          nowSeconds() - start,
        );
        return;
      }
      // waiting or paused: no opponent transition is needed, but refresh the
      // idle clock so an abandoned room is reaped once it has been empty long enough.
      const userStillConnected = await hasUserSockets(socket.data.user.id);
      const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
        userStillConnected
          ? state
          : { ...state, version: state.version + 1, updatedAt: now.toISOString() },
      );
      if (result.ok) {
        trackFormulaMatch(result.state);
        await emitState(result.state);
      }
      await markRoomEmptyIfNeeded(match.id, now);
      updateActiveGauges();
      metrics.recordSocketCommand(
        'disconnect',
        result.ok ? 'accepted' : 'rejected',
        result.ok ? 'EMPTY' : result.reason.toUpperCase(),
        nowSeconds() - start,
      );
    });
  });

  await repository.initialize();
  await accountRepository?.initialize();
  await leaderboardRepository?.initialize();
  await usernameAvailabilityCache?.initialize();
  const sweep = setInterval(async () => {
    const sweepStart = nowSeconds();
    const now = new Date();
    for (const match of await repository.listExpiredReconnects(now)) {
      const winner = match.players.find((player) => player.userId !== match.disconnectedUserId);
      const result = await repository.update(match.id, match.version, randomUUID(), (state) => {
        const ended = {
          version: state.version + 1,
          status: 'ended' as const,
          winnerUserId: winner?.userId ?? null,
          endReason: 'abandonment' as const,
          updatedAt: now.toISOString(),
        };
        if (stateGameId(state) === 'formula-frenzy') {
          return { ...(state as FormulaFrenzyMatchState), ...ended };
        }
        return { ...(state as MatchState), ...ended, turnUserId: null, turnCharacterId: null };
      });
      if (result.ok) {
        trackFormulaMatch(result.state);
        await emitState(result.state);
      }
    }
    const deletedFinished = await repository.deleteFinishedBefore(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    const deletedEmpty = await repository.deleteEmptyBefore(
      new Date(now.getTime() - idleCleanupMs),
    );
    metrics.recordCleanupDeleted('finished', deletedFinished);
    metrics.recordCleanupDeleted('empty', deletedEmpty);
    metrics.observeCleanup(nowSeconds() - sweepStart);
    updateActiveGauges();
  }, options.sweepIntervalMs ?? 1_000);
  sweep.unref();

  return {
    fastify,
    io,
    async listen(port: number, host = '0.0.0.0'): Promise<string> {
      return fastify.listen({ port, host });
    },
    async close(): Promise<void> {
      clearInterval(sweep);
      for (const timer of formulaDeadlineTimers.values()) clearTimeout(timer);
      formulaDeadlineTimers.clear();
      await fastify.close();
      await socketAdapterHandle?.close();
      await usernameAvailabilityCache?.close();
      await leaderboardRepository?.close();
      await accountRepository?.close();
      await repository.close();
      metrics.shutdown();
    },
  };
}
