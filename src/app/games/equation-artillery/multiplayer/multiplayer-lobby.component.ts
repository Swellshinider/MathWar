import { Component, OnDestroy, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchState } from '@math-war/game-engine';
import { ToastService } from '../../../shared/toast/toast.service';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerSocketService } from './multiplayer-socket.service';
import { formatRoomCode } from './room-code';

@Component({
  selector: 'app-multiplayer-lobby',
  imports: [FormsModule],
  templateUrl: './multiplayer-lobby.component.html',
  styleUrl: './multiplayer-lobby.component.scss',
})
export class MultiplayerLobbyComponent implements OnDestroy {
  readonly auth = inject(MultiplayerAuthService);
  private readonly socket = inject(MultiplayerSocketService);
  private readonly toast = inject(ToastService);

  /** When true (default) the lobby owns the socket connection; when false the host owns it. */
  readonly manageSocket = input(true);
  readonly roomJoined = output<MatchState>();
  readonly play = output<MatchState>();

  readonly displayName = signal(this.auth.storedDisplayName());
  readonly roomCode = signal('');
  readonly error = signal<string | null>(null);
  readonly room = signal<MatchState | null>(null);

  constructor() {
    effect(() => {
      if (!this.manageSocket()) return;
      const token = this.auth.session()?.token;
      if (!token) {
        this.socket.disconnect();
        this.room.set(null);
        return;
      }
      this.socket.connect(token, {
        state: (state) => this.room.set(state),
        error: (message) => this.error.set(message),
        connected: () => this.error.set(null),
      });
    });
  }

  async signIn(): Promise<void> {
    await this.auth.signIn(this.displayName());
  }

  async createRoom(): Promise<void> {
    this.error.set(null);
    const response = await this.socket.create({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
    });
    this.applyResponse(response);
  }

  async joinRoom(): Promise<void> {
    this.error.set(null);
    this.roomCode.set(formatRoomCode(this.roomCode()));
    const response = await this.socket.join({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      roomCode: this.roomCode(),
    });
    this.applyResponse(response);
  }

  setRoomCode(value: string): void {
    this.roomCode.set(formatRoomCode(value));
  }

  async shareRoomLink(): Promise<void> {
    const roomCode = this.room()?.roomCode;
    if (!roomCode) return;
    const url = new URL('/games/equation-artillery/multiplayer', location.origin);
    url.searchParams.set('room', roomCode);
    try {
      await navigator.clipboard.writeText(url.toString());
      this.toast.show('Link copied to clipboard!');
      this.error.set(null);
    } catch {
      this.error.set('Could not copy the share link.');
    }
  }

  enterPlay(): void {
    const room = this.room();
    if (room) this.play.emit(room);
  }

  ngOnDestroy(): void {
    if (this.manageSocket()) this.socket.disconnect();
  }

  private applyResponse(response: { ok: boolean; data?: MatchState; error?: string }): void {
    if (response.ok && response.data) {
      this.room.set(response.data);
      this.roomJoined.emit(response.data);
      this.error.set(null);
      return;
    }
    this.error.set(response.error ?? 'The command was rejected.');
  }
}
