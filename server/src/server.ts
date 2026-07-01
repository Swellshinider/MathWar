import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import { TokenVerifier } from './auth.js';
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

interface AuthenticatedSocket extends Socket {
  data: { user: AuthenticatedUser; matchId?: string };
}

type Ack<T = undefined> = (response: CommandAck<T>) => void;
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export interface MultiplayerServerOptions {
  readonly repository: MatchRepository;
  readonly verifyToken: TokenVerifier;
  readonly allowedOrigin: string;
  readonly reconnectWindowMs?: number;
  readonly sweepIntervalMs?: number;
  readonly idleCleanupMs?: number;
  readonly staticRoot?: string;
  readonly browserConfig?: {
    readonly serverUrl: string;
  };
  readonly issueGuestSession?: (
    displayName: string,
  ) => Promise<{ token: string; user: AuthenticatedUser }>;
}

function roomName(matchId: string): string {
  return `match:${matchId}`;
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

  await fastify.register(cors, { origin: options.allowedOrigin });
  const healthHandler = async () => {
    metrics.recordHealthCall();
    return { status: 'ok' };
  };
  fastify.get('/health', healthHandler);
  fastify.get('/healthz', healthHandler);
  if (metricsEnabled) {
    fastify.get('/metrics', async (_request, reply) =>
      reply.type(metrics.contentType).send(await metrics.metrics()),
    );
  }
  fastify.post<{ Body?: { displayName?: unknown } }>('/api/auth/guest', async (request, reply) => {
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
  });
  if (options.staticRoot || options.browserConfig) {
    if (!options.staticRoot || !options.browserConfig) {
      throw new Error('staticRoot and browserConfig must be configured together.');
    }
    fastify.get('/config.js', async (_request, reply) => {
      const config = JSON.stringify(options.browserConfig).replaceAll('<', '\\u003c');
      return reply
        .header('cache-control', 'no-store')
        .type('application/javascript')
        .send(`window.MATH_WAR_CONFIG = ${config};\n`);
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
  const reconnectWindowMs = options.reconnectWindowMs ?? 60_000;
  const idleCleanupMs = options.idleCleanupMs ?? 10 * 60_000;
  const socketsByUser = new Map<string, Set<string>>();

  function activeMatchRoomCount(): number {
    return [...io.sockets.adapter.rooms.keys()].filter((room) => room.startsWith('match:')).length;
  }

  function updateActiveGauges(): void {
    metrics.setActiveSockets(io.engine.clientsCount);
    metrics.setActiveMatches(activeMatchRoomCount());
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
    if (stateGameId(state) === 'formula-frenzy') {
      io.to(roomName(state.id)).emit('formula:state', emittedState);
    }
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

  function isRoomEmpty(matchId: string): boolean {
    return !io.sockets.adapter.rooms.get(roomName(matchId))?.size;
  }

  async function clearRoomEmpty(matchId: string): Promise<void> {
    await repository.clearRoomEmpty(matchId);
  }

  async function markRoomEmptyIfNeeded(matchId: string, emptySince: Date): Promise<void> {
    if (isRoomEmpty(matchId)) await repository.markRoomEmpty(matchId, emptySince);
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
    const userSockets = socketsByUser.get(socket.data.user.id) ?? new Set<string>();
    userSockets.add(socket.id);
    socketsByUser.set(socket.data.user.id, userSockets);
    metrics.recordSocketConnection();
    updateActiveGauges();
    void reconnect(socket);

    socket.on('room:create', async (command: VersionedCommand, ack: Ack<MultiplayerMatchState>) => {
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
        match.status !== 'waiting' ||
        stateGameId(match) !== requestedGameId(command) ||
        match.players.length >= 2
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
      await clearRoomEmpty(result.state.id);
      updateActiveGauges();
      io.to(roomName(result.state.id)).emit('match:started', publicState(result.state));
      await emitState(result.state);
      acknowledge({ ok: true, data: publicState(result.state) });
    });

    socket.on('match:fire', async (command: FireCommand, ack: Ack<MatchState>) => {
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
          match.players[0].userId !== socket.data.user.id
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
        io.to(roomName(result.state.id)).emit('match:started', publicState(result.state));
        await emitState(result.state);
        acknowledge({ ok: true, data: publicState(result.state as FormulaFrenzyMatchState) });
      },
    );

    socket.on(
      'formula:answer',
      async (command: FormulaFrenzyAnswerCommand, ack: Ack<FormulaFrenzyMatchState>) => {
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
        await emitState(next.state);
        acknowledge({ ok: true, data: publicState(next.state as FormulaFrenzyMatchState) });
      },
    );

    socket.on(
      'formula:hint',
      async (command: FormulaFrenzyHintCommand, ack: Ack<FormulaFrenzyMatchState>) => {
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
      const input = command.input.slice(0, 24);
      socket.to(roomName(socket.data.matchId)).emit('formula:typing', {
        userId: socket.data.user.id,
        input,
      });
      metrics.recordSocketCommand('formula:typing', 'accepted', 'OK', nowSeconds() - start);
    });

    socket.on('match:leave', async (command: VersionedCommand, ack: Ack<MultiplayerMatchState>) => {
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
      await socket.leave(roomName(matchId));
      await markRoomEmptyIfNeeded(matchId, new Date());
      updateActiveGauges();
      await emitState(result.state);
      acknowledge({ ok: true, data: publicState(result.state) });
    });

    socket.on('disconnect', async (reason) => {
      const start = nowSeconds();
      metrics.recordSocketDisconnect(reason);
      const sockets = socketsByUser.get(socket.data.user.id);
      sockets?.delete(socket.id);
      updateActiveGauges();
      if (sockets?.size) {
        metrics.recordSocketCommand('disconnect', 'accepted', 'MULTI_SOCKET', nowSeconds() - start);
        return;
      }
      socketsByUser.delete(socket.data.user.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (socketsByUser.has(socket.data.user.id)) {
        metrics.recordSocketCommand('disconnect', 'accepted', 'RECONNECTED', nowSeconds() - start);
        return;
      }
      const now = new Date();
      const match = await repository.findActiveByUser(socket.data.user.id);
      if (!match) {
        if (socket.data.matchId) await markRoomEmptyIfNeeded(socket.data.matchId, now);
        updateActiveGauges();
        metrics.recordSocketCommand('disconnect', 'accepted', 'NO_MATCH', nowSeconds() - start);
        return;
      }
      if (match.status === 'active') {
        const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
          socketsByUser.has(socket.data.user.id)
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
      const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
        socketsByUser.has(socket.data.user.id)
          ? state
          : { ...state, version: state.version + 1, updatedAt: now.toISOString() },
      );
      if (result.ok) await emitState(result.state);
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
      if (result.ok) await emitState(result.state);
    }
    const formulaMatches = await Promise.all(
      [...io.sockets.adapter.rooms.keys()]
        .filter((room) => room.startsWith('match:'))
        .map((room) => repository.findById(room.slice('match:'.length))),
    );
    for (const match of formulaMatches) {
      if (!match || stateGameId(match) !== 'formula-frenzy') continue;
      const expiredUserId = expiredFormulaFrenzyPlayer(match as FormulaFrenzyMatchState, now);
      if (!expiredUserId) continue;
      const result = await repository.update(match.id, match.version, randomUUID(), (state) =>
        stateGameId(state) === 'formula-frenzy'
          ? expireFormulaFrenzyPlayer(state as FormulaFrenzyMatchState, expiredUserId, now)
          : state,
      );
      if (result.ok) await emitState(result.state);
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
      await fastify.close();
      await repository.close();
      metrics.shutdown();
    },
  };
}
