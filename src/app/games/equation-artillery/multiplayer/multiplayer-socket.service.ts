import { Injectable, NgZone, inject } from '@angular/core';
import {
  CommandAck,
  FireCommand,
  MatchEndedEvent,
  MatchState,
  RoomJoinCommand,
  ShotResolvedEvent,
  VersionedCommand,
} from '@math-war/game-engine';
import { io, Socket } from 'socket.io-client';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';

@Injectable({ providedIn: 'root' })
export class MultiplayerSocketService {
  private readonly config = inject(MULTIPLAYER_CONFIG);
  private readonly zone = inject(NgZone);
  private socket: Socket | null = null;

  connect(
    token: string,
    handlers: {
      state: (state: MatchState) => void;
      shot?: (event: ShotResolvedEvent) => void;
      ended?: (event: MatchEndedEvent) => void;
      error: (message: string) => void;
      connected?: () => void;
    },
  ): void {
    this.disconnect();
    this.socket = io(this.config.serverUrl, { auth: { token }, transports: ['websocket'] });
    const run =
      <T>(handler: (value: T) => void) =>
      (value: T) =>
        this.zone.run(() => handler(value));
    this.socket.on('room:state', run(handlers.state));
    this.socket.on('match:started', run(handlers.state));
    this.socket.on('match:state', run(handlers.state));
    if (handlers.shot) this.socket.on('shot:resolved', run(handlers.shot));
    if (handlers.ended) this.socket.on('match:ended', run(handlers.ended));
    this.socket.on('connect', () => this.zone.run(() => handlers.connected?.()));
    this.socket.on('connect_error', (error) => this.zone.run(() => handlers.error(error.message)));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  create(command: VersionedCommand): Promise<CommandAck<MatchState>> {
    return this.emit('room:create', command);
  }

  join(command: RoomJoinCommand): Promise<CommandAck<MatchState>> {
    return this.emit('room:join', command);
  }

  fire(command: FireCommand): Promise<CommandAck<MatchState>> {
    return this.emit('match:fire', command);
  }

  leave(command: VersionedCommand): Promise<CommandAck<MatchState>> {
    return this.emit('match:leave', command);
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
