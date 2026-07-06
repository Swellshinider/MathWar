import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  AuthenticatedUser,
  createFormulaProblem,
  formulaProgress,
  scoreFormulaAnswer,
  soloFormulaProblemRandom,
} from '@math-war/game-engine';
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
} from '../leaderboard-repository.js';
import { MathWarMetrics, nowSeconds, routeMetricLabel } from '../observability/metrics.js';
import {
  FormulaFrenzyCompletionProof,
  issueRunCompletionToken,
  leaderboardInputFromProof,
  verifyRunCompletionToken,
} from '../run-proof.js';
import {
  canonicalOrigin,
  createRobotsTxt,
  createSitemapXml,
  cspConnectSrc,
  isMetricsRequestAuthorized,
  isUniqueConstraintViolation,
} from './http-utils.js';
import { parseBoundedInteger, parsePositiveInteger } from './validation.js';

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
const SOLO_RUN_RATE_LIMIT_MAX = 120;
const SOLO_RUN_RATE_LIMIT_WINDOW = '1 minute';
const FORMULA_MAX_HEARTS = 3;
const FORMULA_INITIAL_HINTS = 3;

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

interface FormulaSoloRun {
  readonly id: string;
  readonly accountId: string | null;
  readonly difficulty: 'normal' | 'hardcore';
  readonly startedAt: string;
  readonly seed: string;
  readonly score: number;
  readonly experience: number;
  readonly level: number;
  readonly xp: number;
  readonly xpRequired: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly hearts: number;
  readonly hintsRemaining: number;
  readonly currentHint: string | null;
  readonly highestLevel: number;
  readonly totalCorrect: number;
  readonly totalSolveTimeMs: number;
  readonly currentProblem: ReturnType<typeof createFormulaProblem> & { readonly startedAt: string };
  readonly status: 'active' | 'ended';
  readonly completionToken?: string;
}

function publicFormulaRun(run: FormulaSoloRun) {
  return {
    runId: run.id,
    seed: run.seed,
    difficulty: run.difficulty,
    status: run.status,
    score: run.score,
    experience: run.experience,
    level: run.level,
    xp: run.xp,
    xpRequired: run.xpRequired,
    streak: run.streak,
    bestStreak: run.bestStreak,
    hearts: run.hearts,
    hintsRemaining: run.hintsRemaining,
    currentHint: run.currentHint,
    highestLevel: run.highestLevel,
    totalCorrect: run.totalCorrect,
    totalSolveTimeMs: run.totalSolveTimeMs,
    currentProblem: {
      prompt: run.currentProblem.prompt,
      level: run.currentProblem.level,
      levelName: run.currentProblem.levelName,
      deadlineMs: run.currentProblem.deadlineMs,
      startedAt: run.currentProblem.startedAt,
      hint: run.currentHint,
    },
    completionToken: run.completionToken,
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
  const formulaSoloRuns = new Map<string, FormulaSoloRun>();

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

  async function optionalAccount(request: {
    headers: { authorization?: string };
  }): Promise<AccountRecord | null> {
    if (!accountRepository || !accountTokenVerifier) return null;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return null;
    try {
      const user = await accountTokenVerifier(authorization.slice('Bearer '.length));
      return accountRepository.findAccountById(user.id);
    } catch {
      return null;
    }
  }

  function requireCompletionToken(body: unknown): string {
    if (
      !body ||
      typeof body !== 'object' ||
      !('completionToken' in body) ||
      typeof body.completionToken !== 'string'
    ) {
      throw new Error('Completion token is required.');
    }
    return body.completionToken;
  }

  function assertProofAccount(
    proof: { readonly accountId: string | null },
    account: AccountRecord,
  ): void {
    if (proof.accountId !== null && proof.accountId !== account.id) {
      throw new Error('Completion token does not belong to this account.');
    }
  }

  function createSoloRun(
    difficulty: 'normal' | 'hardcore',
    account: AccountRecord | null,
  ): FormulaSoloRun {
    const startedAt = new Date().toISOString();
    const seed = randomUUID();
    const problem = createFormulaProblem(0, soloFormulaProblemRandom(seed, 0));
    return {
      id: randomUUID(),
      accountId: account?.id ?? null,
      difficulty,
      seed,
      startedAt,
      score: 0,
      experience: 0,
      level: 1,
      xp: 0,
      xpRequired: 2,
      streak: 0,
      bestStreak: 0,
      hearts: difficulty === 'hardcore' ? 0 : FORMULA_MAX_HEARTS,
      hintsRemaining: difficulty === 'hardcore' ? 0 : FORMULA_INITIAL_HINTS,
      currentHint: null,
      highestLevel: 1,
      totalCorrect: 0,
      totalSolveTimeMs: 0,
      currentProblem: { ...problem, startedAt },
      status: 'active',
    };
  }

  async function finishSoloRun(run: FormulaSoloRun): Promise<FormulaSoloRun> {
    if (run.completionToken) return run;
    if (!accountOptions) throw new Error('Account system is not configured.');
    const proof: FormulaFrenzyCompletionProof = {
      kind: 'formula-frenzy',
      accountId: run.accountId,
      runId: run.id,
      difficulty: run.difficulty,
      score: run.score,
      level: run.highestLevel,
      averageTimeMs:
        run.totalCorrect === 0 ? null : Math.round(run.totalSolveTimeMs / run.totalCorrect),
      bestStreak: run.bestStreak,
      totalCorrect: run.totalCorrect,
    };
    const completed = {
      ...run,
      status: 'ended' as const,
      completionToken: await issueRunCompletionToken(accountOptions.refreshTokenSecret, proof),
    };
    formulaSoloRuns.set(run.id, completed);
    return completed;
  }

  function nextSoloProblem(
    seed: string,
    experience: number,
  ): FormulaSoloRun['currentProblem'] {
    return {
      ...createFormulaProblem(experience, soloFormulaProblemRandom(seed, experience)),
      startedAt: new Date().toISOString(),
    };
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
      const refresh = createRefreshToken(accountOptions.refreshTokenSecret);
      const rotation = await accountRepository.rotateRefreshToken({
        tokenHash,
        nextTokenHash: refresh.hash,
        nextExpiresAt: refresh.expiresAt,
      });
      if (rotation.status === 'missing') {
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token is invalid.' });
      }
      if (rotation.status === 'already_revoked') {
        await accountRepository.revokeAccountRefreshTokens(rotation.accountId);
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token was already used.' });
      }
      if (rotation.status === 'expired') {
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account refresh token expired.' });
      }
      const account = await accountRepository.findAccountById(rotation.token.accountId);
      if (!account) {
        reply.clearCookie(ACCOUNT_REFRESH_COOKIE, { path: '/api/account' });
        return reply.code(401).send({ message: 'Account no longer exists.' });
      }
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

    fastify.post<{ Body?: { difficulty?: unknown } }>(
      '/api/runs/formula-frenzy/start',
      {
        config: {
          rateLimit: {
            max: SOLO_RUN_RATE_LIMIT_MAX,
            timeWindow: SOLO_RUN_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        const difficulty =
          typeof request.body?.difficulty === 'string' ? request.body.difficulty : 'normal';
        if (!isLeaderboardDifficulty(difficulty)) {
          return reply.code(400).send({ message: 'Run difficulty is invalid.' });
        }
        const account = await optionalAccount(request);
        const run = createSoloRun(difficulty, account);
        formulaSoloRuns.set(run.id, run);
        return publicFormulaRun(run);
      },
    );

    fastify.post<{ Params: { runId: string }; Body?: { answer?: unknown } }>(
      '/api/runs/formula-frenzy/:runId/answers',
      {
        config: {
          rateLimit: {
            max: SOLO_RUN_RATE_LIMIT_MAX,
            timeWindow: SOLO_RUN_RATE_LIMIT_WINDOW,
          },
        },
      },
      async (request, reply) => {
        const run = formulaSoloRuns.get(request.params.runId);
        if (!run) return reply.code(404).send({ message: 'Run not found.' });
        if (run.status === 'ended') return publicFormulaRun(run);
        if (typeof request.body?.answer !== 'number' || !Number.isFinite(request.body.answer)) {
          return reply.code(400).send({ message: 'Answer is required.' });
        }
        if (
          Date.now() >
          new Date(run.currentProblem.startedAt).getTime() + run.currentProblem.deadlineMs
        ) {
          return publicFormulaRun(await finishSoloRun(run));
        }
        if (request.body.answer !== run.currentProblem.answer) {
          const hearts = run.difficulty === 'hardcore' ? 0 : Math.max(0, run.hearts - 1);
          const missed = { ...run, hearts, streak: 0, currentHint: null };
          const next = hearts === 0 ? await finishSoloRun(missed) : missed;
          formulaSoloRuns.set(run.id, next);
          return publicFormulaRun(next);
        }

        const solveTimeMs = Math.max(
          0,
          Date.now() - new Date(run.currentProblem.startedAt).getTime(),
        );
        const streak = run.streak + 1;
        const experience = run.experience + 1;
        const progress = formulaProgress(experience);
        const next = {
          ...run,
          score:
            run.score +
            scoreFormulaAnswer(
              streak,
              solveTimeMs,
              run.currentProblem.deadlineMs,
              run.currentProblem.level,
              run.currentHint !== null,
            ),
          experience,
          level: progress.level,
          xp: progress.xp,
          xpRequired: progress.xpRequired,
          streak,
          bestStreak: Math.max(run.bestStreak, streak),
          hearts:
            run.difficulty === 'normal' && streak % 5 === 0
              ? Math.min(FORMULA_MAX_HEARTS, run.hearts + 1)
              : run.hearts,
          hintsRemaining:
            run.difficulty === 'normal' && streak % 10 === 0
              ? Math.min(FORMULA_INITIAL_HINTS, run.hintsRemaining + 1)
              : run.hintsRemaining,
          currentHint: null,
          highestLevel: Math.max(run.highestLevel, progress.level),
          totalCorrect: run.totalCorrect + 1,
          totalSolveTimeMs: run.totalSolveTimeMs + solveTimeMs,
          currentProblem: nextSoloProblem(run.seed, experience),
        };
        formulaSoloRuns.set(run.id, next);
        return publicFormulaRun(next);
      },
    );

    fastify.post<{ Params: { runId: string } }>(
      '/api/runs/formula-frenzy/:runId/hints',
      async (request, reply) => {
        const run = formulaSoloRuns.get(request.params.runId);
        if (!run) return reply.code(404).send({ message: 'Run not found.' });
        if (
          run.status === 'ended' ||
          run.difficulty !== 'normal' ||
          run.hintsRemaining <= 0 ||
          run.currentHint !== null ||
          !run.currentProblem.hint
        ) {
          return reply.code(400).send({ message: 'Hint is not available.' });
        }
        const next = {
          ...run,
          hintsRemaining: run.hintsRemaining - 1,
          currentHint: run.currentProblem.hint,
        };
        formulaSoloRuns.set(run.id, next);
        return publicFormulaRun(next);
      },
    );

    fastify.post<{ Params: { runId: string } }>(
      '/api/runs/formula-frenzy/:runId/finish',
      async (request, reply) => {
        const run = formulaSoloRuns.get(request.params.runId);
        if (!run) return reply.code(404).send({ message: 'Run not found.' });
        return publicFormulaRun(await finishSoloRun(run));
      },
    );

    fastify.post<{ Body?: { cpuLevel?: unknown } }>(
      '/api/runs/equation-artillery/cpu-wins',
      async (request, reply) => {
        try {
          if (!accountOptions) throw new Error('Account system is not configured.');
          const account = await optionalAccount(request);
          const cpuLevel = parseBoundedInteger(request.body?.cpuLevel, 'CPU level', 0, 10);
          return {
            completionToken: await issueRunCompletionToken(accountOptions.refreshTokenSecret, {
              kind: 'equation-artillery-cpu-win',
              accountId: account?.id ?? null,
              runId: randomUUID(),
              cpuLevel,
            }),
          };
        } catch (error) {
          return reply.code(400).send({
            message: error instanceof Error ? error.message : 'Could not create completion token.',
          });
        }
      },
    );

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
          completionToken?: unknown;
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
            const token = requireCompletionToken(request.body);
            const proof = await verifyRunCompletionToken(accountOptions.refreshTokenSecret, token);
            if (proof.kind !== 'formula-frenzy') {
              return reply.code(400).send({ message: 'Completion token is invalid.' });
            }
            assertProofAccount(proof, account);
            const run: FormulaFrenzyRunInput = {
              accountId: account.id,
              runId: validateProgressRunId(proof.runId),
              difficulty: proof.difficulty,
              score: proof.score,
              level: proof.level,
              averageTimeMs: proof.averageTimeMs,
              bestStreak: proof.bestStreak,
              totalCorrect: proof.totalCorrect,
            };
            return progressRepository.saveFormulaFrenzyRun(run);
          } catch (error) {
            return reply.code(400).send({
              message: error instanceof Error ? error.message : 'Could not save progress.',
            });
          }
        },
      );

      fastify.post<{
        Body?: {
          completionToken?: unknown;
        };
      }>(
        '/api/account/progress/equation-artillery/cpu-wins',
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
            const proof = await verifyRunCompletionToken(
              accountOptions.refreshTokenSecret,
              requireCompletionToken(request.body),
            );
            if (proof.kind !== 'equation-artillery-cpu-win') {
              return reply.code(400).send({ message: 'Completion token is invalid.' });
            }
            assertProofAccount(proof, account);
            return progressRepository.saveEquationArtilleryCpuWin({
              accountId: account.id,
              cpuLevel: proof.cpuLevel,
            });
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
        completionToken?: unknown;
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
          const proof = await verifyRunCompletionToken(
            accountOptions!.refreshTokenSecret,
            requireCompletionToken(request.body),
          );
          if (proof.kind !== 'formula-frenzy') {
            return reply.code(400).send({ message: 'Completion token is invalid.' });
          }
          assertProofAccount(proof, account);
          return leaderboardRepository.saveBest(
            leaderboardInputFromProof(proof, account.id, account.username),
          );
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
