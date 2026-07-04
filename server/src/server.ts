import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
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
  startFormulaFrenzyMatch,
  VersionedCommand,
} from '@math-war/game-engine';
import { AccountRepository } from './account-repository.js';
import { UsernameAvailabilityCache } from './account-username-cache.js';
import { canJoinWaitingRoom, canStartFormulaMatch, isMatchPlayer } from './authorization.js';
import { TokenVerifier } from './auth.js';
import { LeaderboardRepository } from './leaderboard-repository.js';
import { logCommand } from './observability/logging.js';
import { createMathWarMetrics, MathWarMetrics, nowSeconds, SocketCommand } from './observability/metrics.js';
import { InstrumentedMatchRepository } from './observability/repository.js';
import { MatchRepository } from './repository.js';
import { SocketAdapterHandle } from './redis-adapter.js';
import { createFixedWindowLimiter, socketAddress } from './server/http-utils.js';
import { registerHttpRoutes } from './server/http-routes.js';
import {
  publicState,
  roomName,
  setPlayerConnected,
  stateGameId,
  userRoomName,
} from './server/public-state.js';
import {
  createRoomCode,
  isFormulaAnswerCommand,
  isFormulaHintCommand,
  isFormulaTypingCommand,
  isVersionedCommand,
  normalizeRoomCode,
  requestedGameId,
} from './server/validation.js';

interface AuthenticatedSocket extends Socket {
  data: { user: AuthenticatedUser; matchId?: string };
}

type Ack<T = undefined> = (response: CommandAck<T>) => void;
const HTTP_BODY_LIMIT_BYTES = 512 * 1024;
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
  const usernameAvailabilityCache = options.accounts?.usernameAvailabilityCache;
  const socketConnectLimiter = createFixedWindowLimiter(SOCKET_CONNECT_WINDOW_MS);
  const socketCommandLimiter = createFixedWindowLimiter(SOCKET_COMMAND_WINDOW_MS);

  await registerHttpRoutes({ fastify, metrics, options });

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
