import { Injectable, InjectionToken, NgZone, inject } from '@angular/core';
import {
  CommandAck,
  FireCommand,
  FormulaFrenzyAnswerCommand,
  FormulaFrenzyHintCommand,
  FormulaFrenzyMatchState,
  FormulaFrenzyTypingCommand,
  MatchEndedEvent,
  MatchState,
  MultiplayerMatchState,
  RoomJoinCommand,
  ShotResolvedEvent,
  VersionedCommand,
} from '@math-war/game-engine';
import { io, Socket } from 'socket.io-client';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';

const CONNECTION_ERROR_MESSAGE = 'Connection interrupted. Trying to reconnect...';
const SESSION_EXPIRED_MESSAGE = 'Your multiplayer session expired. Please enter again.';
const AUTHENTICATION_ERROR_MESSAGES = new Set([
  'Invalid access token.',
  'Authentication required.',
]);

type MultiplayerSocketFactory = (serverUrl: string, token: string) => Socket;

export const MULTIPLAYER_SOCKET_FACTORY = new InjectionToken<MultiplayerSocketFactory>(
  'MULTIPLAYER_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (serverUrl, token) =>
      io(serverUrl, { auth: { token }, transports: ['websocket'] }),
  },
);

@Injectable({ providedIn: 'root' })
export class MultiplayerSocketService {
  private readonly auth = inject(MultiplayerAuthService);
  private readonly config = inject(MULTIPLAYER_CONFIG);
  private readonly createSocket = inject(MULTIPLAYER_SOCKET_FACTORY);
  private readonly zone = inject(NgZone);
  private socket: Socket | null = null;

  connect(
    token: string,
    handlers: {
      state: (state: MultiplayerMatchState) => void;
      formulaTyping?: (event: { userId: string; input: string }) => void;
      shot?: (event: ShotResolvedEvent) => void;
      ended?: (event: MatchEndedEvent) => void;
      error: (message: string) => void;
      connected?: () => void;
    },
  ): void {
    this.disconnect();
    this.socket = this.createSocket(this.config.serverUrl, token);
    const run =
      <T>(handler: (value: T) => void) =>
      (value: T) =>
        this.zone.run(() => handler(value));
    this.socket.on('room:state', run(handlers.state));
    this.socket.on('match:started', run(handlers.state));
    this.socket.on('match:state', run(handlers.state));
    if (handlers.formulaTyping) this.socket.on('formula:typing', run(handlers.formulaTyping));
    if (handlers.shot) this.socket.on('shot:resolved', run(handlers.shot));
    if (handlers.ended) this.socket.on('match:ended', run(handlers.ended));
    this.socket.on('connect', () => this.zone.run(() => handlers.connected?.()));
    this.socket.on('connect_error', (error: Error) =>
      this.zone.run(() => {
        if (isAuthenticationError(error)) {
          this.auth.clearInvalidSession();
          this.disconnect();
          handlers.error(SESSION_EXPIRED_MESSAGE);
          return;
        }
        handlers.error(CONNECTION_ERROR_MESSAGE);
      }),
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  create(command: VersionedCommand): Promise<CommandAck<MultiplayerMatchState>> {
    return this.emit('room:create', command);
  }

  join(command: RoomJoinCommand): Promise<CommandAck<MultiplayerMatchState>> {
    return this.emit('room:join', command);
  }

  fire(command: FireCommand): Promise<CommandAck<MatchState>> {
    return this.emit('match:fire', command);
  }

  leave(command: VersionedCommand): Promise<CommandAck<MultiplayerMatchState>> {
    return this.emit('match:leave', command);
  }

  answerFormula(command: FormulaFrenzyAnswerCommand): Promise<CommandAck<FormulaFrenzyMatchState>> {
    return this.emit('formula:answer', command);
  }

  requestFormulaHint(
    command: FormulaFrenzyHintCommand,
  ): Promise<CommandAck<FormulaFrenzyMatchState>> {
    return this.emit('formula:hint', command);
  }

  startFormula(command: VersionedCommand): Promise<CommandAck<FormulaFrenzyMatchState>> {
    return this.emit('formula:start', command);
  }

  sendFormulaTyping(command: FormulaFrenzyTypingCommand): void {
    this.socket?.emit('formula:typing', command);
  }

  private emit<T>(event: string, command: unknown): Promise<CommandAck<T>> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          ok: false,
          code: 'DISCONNECTED',
          error: 'The multiplayer server is disconnected.',
        });
        return;
      }
      this.socket
        .timeout(10_000)
        .emit(event, command, (error: Error | null, response: CommandAck<T>) => {
          this.zone.run(() =>
            resolve(error ? { ok: false, code: 'TIMEOUT', error: error.message } : response),
          );
        });
    });
  }
}

function isAuthenticationError(error: Error): boolean {
  return AUTHENTICATION_ERROR_MESSAGES.has(error.message) || isAuthenticationErrorData(error);
}

function isAuthenticationErrorData(error: Error): boolean {
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' && AUTHENTICATION_ERROR_MESSAGES.has(message);
}
