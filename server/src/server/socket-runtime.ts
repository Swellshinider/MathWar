import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  CommandAck,
  expireFormulaFrenzyPlayer,
  expiredFormulaFrenzyPlayer,
  FormulaFrenzyMatchState,
  GameId,
  MatchEndedEvent,
  MatchState,
  MultiplayerMatchState,
} from '@math-war/game-engine';
import { TokenVerifier } from '../auth.js';
import { logCommand } from '../observability/logging.js';
import { MathWarMetrics, nowSeconds, SocketCommand } from '../observability/metrics.js';
import { MatchRepository } from '../repository.js';
import { SocketAdapterHandle } from '../redis-adapter.js';
import { createFixedWindowLimiter, socketAddress } from './http-utils.js';
import {
  publicState,
  roomName,
  setPlayerConnected,
  stateGameId,
  userRoomName,
} from './public-state.js';
import { registerSocketHandlers } from './socket-handlers.js';

interface AuthenticatedSocket extends Socket {
  data: { user: AuthenticatedUser; matchId?: string };
}

type Ack<T = undefined> = (response: CommandAck<T>) => void;

const SOCKET_CONNECT_LIMIT = 100;
const SOCKET_CONNECT_WINDOW_MS = 60_000;
const SOCKET_COMMAND_WINDOW_MS = 60_000;

interface CreateSocketRuntimeOptions {
  readonly fastify: FastifyInstance;
  readonly metrics: MathWarMetrics;
  readonly repository: MatchRepository;
  readonly options: {
    readonly verifyToken: TokenVerifier;
    readonly allowedOrigin: string;
    readonly reconnectWindowMs?: number;
    readonly sweepIntervalMs?: number;
    readonly idleCleanupMs?: number;
    readonly configureSocketAdapter?: (io: SocketServer) => Promise<SocketAdapterHandle | void>;
  };
}

export async function createSocketRuntime({
  fastify,
  metrics,
  repository,
  options,
}: CreateSocketRuntimeOptions): Promise<{
  readonly io: SocketServer;
  readonly startSweep: () => ReturnType<typeof setInterval>;
  readonly close: () => Promise<void>;
}> {
  const socketConnectLimiter = createFixedWindowLimiter(SOCKET_CONNECT_WINDOW_MS);
  const socketCommandLimiter = createFixedWindowLimiter(SOCKET_COMMAND_WINDOW_MS);

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

  registerSocketHandlers({
    io,
    logger: fastify.log,
    metrics,
    repository,
    reconnectWindowMs,
    socketCommandLimiter,
    observedAck,
    reconnect,
    emitState,
    trackActiveRoom,
    untrackActiveRoom,
    updateActiveGauges,
    trackFormulaMatch,
    clearRoomEmpty,
    isRoomEmpty,
    hasUserSockets,
    markRoomEmptyIfNeeded,
    deleteEndedMatchIfRoomEmpty,
  });

  function startSweep(): ReturnType<typeof setInterval> {
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

    return sweep;
  }

  return {
    io,
    startSweep,
    async close(): Promise<void> {
      for (const timer of formulaDeadlineTimers.values()) clearTimeout(timer);
      formulaDeadlineTimers.clear();
      await socketAdapterHandle?.close();
    },
  };
}
