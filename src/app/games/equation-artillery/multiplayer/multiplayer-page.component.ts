import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchState, PlayerState, ShotResolvedEvent } from '@math-war/game-engine';
import { GameFrameComponent } from '../../../shared/game-frame/game-frame.component';
import { BoardComponent } from '../board/board.component';
import { AnimationService } from '../game/animation.service';
import { Bullet } from '../models/bullet';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerSocketService } from './multiplayer-socket.service';

@Component({
  selector: 'app-multiplayer-page',
  imports: [BoardComponent, FormsModule, GameFrameComponent],
  providers: [AnimationService],
  templateUrl: './multiplayer-page.component.html',
  styleUrl: './multiplayer-page.component.scss',
})
export class MultiplayerPageComponent implements OnDestroy {
  readonly auth = inject(MultiplayerAuthService);
  private readonly socket = inject(MultiplayerSocketService);
  private readonly animation = inject(AnimationService);
  readonly state = signal<MatchState | null>(null);
  readonly equation = signal('0');
  readonly roomCode = signal('');
  readonly error = signal<string | null>(null);
  readonly activeShot = signal(false);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  readonly userId = computed(() => this.auth.session()?.user.id ?? null);
  readonly me = computed(
    () => this.state()?.players.find((player) => player.userId === this.userId()) ?? null,
  );
  readonly opponent = computed(
    () => this.state()?.players.find((player) => player.userId !== this.userId()) ?? null,
  );
  readonly opponentTarget = computed<readonly Target[]>(() => {
    const opponent = this.opponent();
    return opponent
      ? [
          {
            id: 1,
            center: opponent.position,
            width: opponent.radius * 2,
            height: opponent.radius * 2,
          },
        ]
      : [];
  });
  readonly isMyTurn = computed(
    () => this.state()?.status === 'active' && this.state()?.turnUserId === this.userId(),
  );
  readonly status = computed(() => {
    const state = this.state();
    if (!state) return 'Create a private room or join with a code.';
    if (state.status === 'waiting') return `Room ${state.roomCode}: waiting for the second player.`;
    if (state.status === 'paused') return 'Match paused while a player reconnects.';
    if (state.status === 'ended')
      return state.winnerUserId === this.userId() ? 'You won.' : 'You lost.';
    return this.isMyTurn()
      ? 'Your turn.'
      : `${this.opponent()?.displayName ?? 'Opponent'} is aiming.`;
  });

  constructor() {
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (!token) {
        this.socket.disconnect();
        this.state.set(null);
        return;
      }
      this.socket.connect(token, {
        state: (state) => this.state.set(state),
        shot: (event) => this.animateShot(event),
        ended: () => undefined,
        error: (message) => this.error.set(message),
      });
    });
  }

  async createRoom(): Promise<void> {
    const response = await this.socket.create({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
    });
    this.applyResponse(response);
  }

  async joinRoom(): Promise<void> {
    const response = await this.socket.join({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      roomCode: this.roomCode(),
    });
    this.applyResponse(response);
  }

  async fire(): Promise<void> {
    const state = this.state();
    if (!state || !this.isMyTurn() || this.activeShot()) return;
    this.error.set(null);
    const response = await this.socket.fire({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
      equation: this.equation(),
    });
    if (!response.ok) this.error.set(response.error ?? 'The shot was rejected.');
  }

  async leave(): Promise<void> {
    const state = this.state();
    if (!state) return;
    const response = await this.socket.leave({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
    });
    if (response.ok) this.state.set(null);
    else this.error.set(response.error ?? 'Could not leave the match.');
  }

  playerForBoard(): PlayerState {
    return (
      this.me() ?? {
        userId: '',
        displayName: '',
        position: { x: -9, y: 0 },
        radius: 0.32,
        direction: 1,
        connected: true,
      }
    );
  }

  ngOnDestroy(): void {
    this.animation.cancel();
    this.socket.disconnect();
  }

  private applyResponse(response: { ok: boolean; data?: MatchState; error?: string }): void {
    if (response.ok && response.data) {
      this.state.set(response.data);
      this.error.set(null);
    } else this.error.set(response.error ?? 'The command was rejected.');
  }

  private animateShot(event: ShotResolvedEvent): void {
    this.state.set(event.state);
    if (event.error) {
      this.error.set(event.error);
      return;
    }
    let index = 0;
    this.activeShot.set(true);
    this.trail.set(event.trail.slice(0, 1));
    this.bullet.set({ position: event.trail[0], radius: 0.18 });
    this.animation.start(() => {
      index += 1;
      const point = event.trail[index];
      if (!point) {
        this.activeShot.set(false);
        this.bullet.set(null);
        return false;
      }
      this.trail.set(event.trail.slice(0, index + 1));
      this.bullet.set({ position: point, radius: 0.18 });
      return true;
    });
  }
}
