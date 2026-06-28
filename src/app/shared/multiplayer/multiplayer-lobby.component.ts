import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameId, MultiplayerMatchState } from '@math-war/game-engine';
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
  @ViewChild('activeMatchDialog') private activeMatchDialog?: ElementRef<HTMLDialogElement>;

  /** When true (default) the lobby owns the socket connection; when false the host owns it. */
  readonly manageSocket = input(true);
  readonly gameId = input<GameId>('equation-artillery');
  readonly roomJoined = output<MultiplayerMatchState>();

  readonly displayName = signal(this.auth.storedDisplayName());
  readonly roomCode = signal('');
  readonly error = signal<string | null>(null);
  readonly room = signal<MultiplayerMatchState | null>(null);
  readonly activeMatch = signal<MultiplayerMatchState | null>(null);

  private retryAfterLeave: (() => Promise<void>) | null = null;

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
        state: (state) => {
          if (this.stateGameId(state) === this.gameId()) this.room.set(state);
        },
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
    this.retryAfterLeave = () => this.createRoom();
    const response = await this.socket.create({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      gameId: this.gameId(),
    });
    this.applyResponse(response);
  }

  async joinRoom(): Promise<void> {
    this.error.set(null);
    this.roomCode.set(formatRoomCode(this.roomCode()));
    this.retryAfterLeave = () => this.joinRoom();
    const response = await this.socket.join({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      roomCode: this.roomCode(),
      gameId: this.gameId(),
    });
    this.applyResponse(response);
  }

  setRoomCode(value: string): void {
    this.roomCode.set(formatRoomCode(value));
  }

  activeMatchGameName(): string {
    return this.stateGameId(this.activeMatch()) === 'formula-frenzy'
      ? 'Formula Frenzy'
      : 'Equation Artillery';
  }

  async leaveActiveMatch(dialog: HTMLDialogElement): Promise<void> {
    const activeMatch = this.activeMatch();
    const retry = this.retryAfterLeave;
    if (!activeMatch || !retry) return;
    const response = await this.socket.leave({
      commandId: crypto.randomUUID(),
      expectedVersion: activeMatch.version,
    });
    if (!response.ok) {
      this.error.set(response.error ?? 'Could not leave the current match.');
      return;
    }
    dialog.close();
    this.activeMatch.set(null);
    this.retryAfterLeave = null;
    await retry();
  }

  cancelLeaveActiveMatch(dialog: HTMLDialogElement): void {
    dialog.close();
    this.activeMatch.set(null);
    this.retryAfterLeave = null;
  }

  ngOnDestroy(): void {
    if (this.manageSocket()) this.socket.disconnect();
  }

  private applyResponse(response: {
    ok: boolean;
    data?: MultiplayerMatchState;
    error?: string;
    code?: string;
  }): void {
    if (response.ok && response.data) {
      this.room.set(response.data);
      this.roomJoined.emit(response.data);
      this.error.set(null);
      this.retryAfterLeave = null;
      return;
    }
    if (response.code === 'ALREADY_IN_MATCH' && response.data) {
      this.activeMatch.set(response.data);
      this.error.set(null);
      this.activeMatchDialog?.nativeElement.showModal?.();
      return;
    }
    this.error.set(response.error ?? 'The command was rejected.');
  }

  private stateGameId(state: MultiplayerMatchState | null): GameId {
    return state?.gameId ?? 'equation-artillery';
  }
}
