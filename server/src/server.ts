import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  CommandAck,
  createMatchState,
  FireCommand,
  MatchEndedEvent,
  MatchState,
  resolveShot,
  RoomJoinCommand,
  VersionedCommand,
} from '@math-war/game-engine';
import { TokenVerifier } from './auth.js';
import { MatchRepository } from './repository.js';

interface AuthenticatedSocket extends Socket {
  data: { user: AuthenticatedUser; matchId?: string };
}

type Ack<T = undefined> = (response: CommandAck<T>) => void;

export interface MultiplayerServerOptions {
  readonly repository: MatchRepository;
  readonly verifyToken: TokenVerifier;
  readonly allowedOrigin: string;
  readonly reconnectWindowMs?: number;
  readonly sweepIntervalMs?: number;
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
function normalizeRoomCode(value: string): string {
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

export async function createMultiplayerServer(options: MultiplayerServerOptions) {
  const fastify = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });
  await fastify.register(cors, { origin: options.allowedOrigin });
  const healthHandler = async () => ({ status: 'ok' });
  fastify.get('/health', healthHandler);
  fastify.get('/healthz', healthHandler);
  fastify.post<{ Body?: { displayName?: unknown } }>('/api/auth/guest', async (request, reply) => {
    if (!options.issueGuestSession) {
      return reply.code(503).send({ message: 'Guest authentication is not configured.' });
    }
    const displayName = request.body?.displayName;
    if (typeof displayName !== 'string') {
      return reply.code(400).send({ message: 'Display name is required.' });
    }
    try {
      return await options.issueGuestSession(displayName);
    } catch (error) {
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
  const socketsByUser = new Map<string, Set<string>>();

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.['token'];
    if (typeof token !== 'string' || !token) return next(new Error('Authentication required.'));
    try {
      (socket as AuthenticatedSocket).data.user = await options.verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid access token.'));
    }
  });

  async function emitState(state: MatchState): Promise<void> {
    io.to(roomName(state.id)).emit('match:state', state);
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

  async function reconnect(socket: AuthenticatedSocket): Promise<void> {
    const match = await options.repository.findActiveByUser(socket.data.user.id);
    if (!match) return;
    socket.data.matchId = match.id;
    await socket.join(roomName(match.id));
    const player = match.players.find((candidate) => candidate.userId === socket.data.user.id);
    if (match.status === 'paused' && match.disconnectedUserId === socket.data.user.id && player) {
      const result = await options.repository.update(
        match.id,
        match.version,
        randomUUID(),
        (state) => ({
          ...state,
          version: state.version + 1,
          status: 'active',
          players: state.players.map((candidate) =>
            candidate.userId === socket.data.user.id
              ? { ...candidate, connected: true }
              : candidate,
          ),
          disconnectedUserId: null,
          reconnectDeadline: null,
          updatedAt: new Date().toISOString(),
        }),
      );
      if (result.ok) {
        socket.emit('room:state', result.state);
        await emitState(result.state);
        return;
      }
    }
    socket.emit('room:state', match);
  }

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userSockets = socketsByUser.get(socket.data.user.id) ?? new Set<string>();
    userSockets.add(socket.id);
    socketsByUser.set(socket.data.user.id, userSockets);
    void reconnect(socket);

    socket.on('room:create', async (command: VersionedCommand, ack: Ack<MatchState>) => {
      if (!isVersionedCommand(command) || command.expectedVersion !== 0)
        return ack({ ok: false, code: 'INVALID_COMMAND', error: 'Invalid create command.' });
      if (await options.repository.findActiveByUser(socket.data.user.id))
        return ack({
          ok: false,
          code: 'ALREADY_IN_MATCH',
          error: 'Leave the current match first.',
        });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const roomCode = randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
        const state = createMatchState(randomUUID(), roomCode, randomBytes(32).toString('hex'), {
          userId: socket.data.user.id,
          displayName: socket.data.user.displayName,
        });
        if (await options.repository.create(state, command.commandId)) {
          socket.data.matchId = state.id;
          await socket.join(roomName(state.id));
          socket.emit('room:state', state);
          return ack({ ok: true, data: state });
        }
      }
      ack({ ok: false, code: 'ROOM_CODE_EXHAUSTED', error: 'Could not allocate a room code.' });
    });

    socket.on('room:join', async (command: RoomJoinCommand, ack: Ack<MatchState>) => {
      if (!isVersionedCommand(command) || typeof command.roomCode !== 'string')
        return ack({ ok: false, code: 'INVALID_COMMAND', error: 'Invalid join command.' });
      if (await options.repository.findActiveByUser(socket.data.user.id))
        return ack({
          ok: false,
          code: 'ALREADY_IN_MATCH',
          error: 'Leave the current match first.',
        });
      const match = await options.repository.findByCode(normalizeRoomCode(command.roomCode));
      if (!match || match.status !== 'waiting')
        return ack({
          ok: false,
          code: 'ROOM_UNAVAILABLE',
          error: 'Room not found or already full.',
        });
      const result = await options.repository.update(
        match.id,
        command.expectedVersion,
        command.commandId,
        (current) => {
          const started = createMatchState(
            current.id,
            current.roomCode,
            current.seed,
            current.players[0],
            { userId: socket.data.user.id, displayName: socket.data.user.displayName },
            new Date(current.createdAt),
          );
          return { ...started, version: current.version + 1, updatedAt: new Date().toISOString() };
        },
      );
      if (!result.ok)
        return ack({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Join rejected: ${result.reason}.`,
        });
      socket.data.matchId = result.state.id;
      await socket.join(roomName(result.state.id));
      io.to(roomName(result.state.id)).emit('match:started', result.state);
      await emitState(result.state);
      ack({ ok: true, data: result.state });
    });

    socket.on('match:fire', async (command: FireCommand, ack: Ack<MatchState>) => {
      if (!isVersionedCommand(command) || typeof command.equation !== 'string')
        return ack({ ok: false, code: 'INVALID_COMMAND', error: 'Invalid fire command.' });
      const matchId = socket.data.matchId;
      if (!matchId) return ack({ ok: false, code: 'NOT_IN_MATCH', error: 'Join a match first.' });
      const match = await options.repository.findById(matchId);
      if (!match) return ack({ ok: false, code: 'MISSING', error: 'Match not found.' });
      if (match.status !== 'active')
        return ack({ ok: false, code: 'NOT_ACTIVE', error: 'The match is not active.' });
      if (match.turnUserId !== socket.data.user.id)
        return ack({ ok: false, code: 'OUT_OF_TURN', error: 'It is not your turn.' });
      let shot = resolveShot(match, socket.data.user.id, command.commandId, command.equation);
      const result = await options.repository.update(
        match.id,
        command.expectedVersion,
        command.commandId,
        () => shot.state,
      );
      if (!result.ok)
        return ack({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Shot rejected: ${result.reason}.`,
        });
      shot = { ...shot, state: result.state, version: result.state.version };
      io.to(roomName(match.id)).emit('shot:resolved', shot);
      await emitState(result.state);
      ack({ ok: true, data: result.state });
    });

    socket.on('match:leave', async (command: VersionedCommand, ack: Ack<MatchState>) => {
      if (!isVersionedCommand(command))
        return ack({ ok: false, code: 'INVALID_COMMAND', error: 'Invalid leave command.' });
      const matchId = socket.data.matchId;
      if (!matchId) return ack({ ok: false, code: 'NOT_IN_MATCH', error: 'No active match.' });
      const match = await options.repository.findById(matchId);
      if (!match) return ack({ ok: false, code: 'MISSING', error: 'Match not found.' });
      const result = await options.repository.update(
        matchId,
        command.expectedVersion,
        command.commandId,
        (state) => {
          const opponent = state.players.find((player) => player.userId !== socket.data.user.id);
          return {
            ...state,
            version: state.version + 1,
            status: 'ended',
            turnUserId: null,
            turnCharacterId: null,
            winnerUserId: opponent?.userId ?? null,
            endReason: 'left',
            updatedAt: new Date().toISOString(),
          };
        },
      );
      if (!result.ok)
        return ack({
          ok: false,
          code: result.reason.toUpperCase(),
          error: `Leave rejected: ${result.reason}.`,
        });
      socket.data.matchId = undefined;
      await socket.leave(roomName(matchId));
      await emitState(result.state);
      ack({ ok: true, data: result.state });
    });

    socket.on('disconnect', async () => {
      const sockets = socketsByUser.get(socket.data.user.id);
      sockets?.delete(socket.id);
      if (sockets?.size) return;
      socketsByUser.delete(socket.data.user.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (socketsByUser.has(socket.data.user.id)) return;
      const match = await options.repository.findActiveByUser(socket.data.user.id);
      if (!match || match.status !== 'active') return;
      const now = new Date();
      const result = await options.repository.update(
        match.id,
        match.version,
        randomUUID(),
        (state) =>
          socketsByUser.has(socket.data.user.id)
            ? state
            : {
                ...state,
                version: state.version + 1,
                status: 'paused',
                players: state.players.map((player) =>
                  player.userId === socket.data.user.id ? { ...player, connected: false } : player,
                ),
                disconnectedUserId: socket.data.user.id,
                reconnectDeadline: new Date(now.getTime() + reconnectWindowMs).toISOString(),
                updatedAt: now.toISOString(),
              },
      );
      if (result.ok) await emitState(result.state);
    });
  });

  await options.repository.initialize();
  const sweep = setInterval(async () => {
    const now = new Date();
    for (const match of await options.repository.listExpiredReconnects(now)) {
      const winner = match.players.find((player) => player.userId !== match.disconnectedUserId);
      const result = await options.repository.update(
        match.id,
        match.version,
        randomUUID(),
        (state) => ({
          ...state,
          version: state.version + 1,
          status: 'ended',
          turnUserId: null,
          turnCharacterId: null,
          winnerUserId: winner?.userId ?? null,
          endReason: 'abandonment',
          updatedAt: now.toISOString(),
        }),
      );
      if (result.ok) await emitState(result.state);
    }
    await options.repository.deleteFinishedBefore(new Date(now.getTime() - 24 * 60 * 60 * 1000));
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
      await options.repository.close();
    },
  };
}
