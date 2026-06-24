import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CharacterState, MatchState, PlayerState, ShotResolvedEvent } from '@math-war/game-engine';
import { GameFrameComponent } from '../../../shared/game-frame/game-frame.component';
import { BoardComponent } from '../board/board.component';
import { EquationHelpDialogComponent } from '../equation-help-dialog/equation-help-dialog.component';
import { EquationHistoryComponent } from '../equation-history/equation-history.component';
import { AnimationService } from '../game/animation.service';
import { BoardCharacter } from '../game/board-renderer.service';
import { Bullet } from '../models/bullet';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerSocketService } from './multiplayer-socket.service';

function formatRoomCode(value: string): string {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (compact.length <= 4) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

@Component({
  selector: 'app-multiplayer-page',
  imports: [
    BoardComponent,
    EquationHelpDialogComponent,
    EquationHistoryComponent,
    FormsModule,
    GameFrameComponent,
  ],
  providers: [AnimationService],
  templateUrl: './multiplayer-page.component.html',
  styleUrl: './multiplayer-page.component.scss',
})
export class MultiplayerPageComponent implements OnDestroy {
  readonly auth = inject(MultiplayerAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly socket = inject(MultiplayerSocketService);
  private readonly animation = inject(AnimationService);
  readonly state = signal<MatchState | null>(null);
  readonly displayName = signal(this.auth.storedDisplayName());
  readonly equation = signal('0');
  readonly roomCode = signal('');
  readonly error = signal<string | null>(null);
  readonly shareStatus = signal<string | null>(null);
  readonly activeShot = signal(false);
  readonly activeShotCharacterId = signal<number | null>(null);
  readonly activeShotEquation = signal<string | null>(null);
  readonly lastShotLabel = signal<{ characterId: number; equation: string } | null>(null);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  private pendingState: MatchState | null = null;
  private recalledTurnKey: string | null = null;
  private inviteJoinPending = false;
  private inviteJoinInFlight = false;
  readonly userId = computed(() => this.auth.session()?.user.id ?? null);
  readonly me = computed(
    () => this.state()?.players.find((player) => player.userId === this.userId()) ?? null,
  );
  readonly opponent = computed(
    () => this.state()?.players.find((player) => player.userId !== this.userId()) ?? null,
  );
  readonly opponentTarget = computed<readonly Target[]>(() => {
    if (this.state()?.characters?.length) return [];
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
  readonly boardCharacters = computed<readonly BoardCharacter[]>(() => {
    const state = this.state();
    if (!state) return [];
    const characters = this.charactersForState(state);
    const activeCharacterId = this.activeShot()
      ? this.activeShotCharacterId()
      : state.turnCharacterId;
    const activeShotEquation = this.activeShotEquation();
    const lastShotLabel = this.lastShotLabel();
    return characters
      .filter((character) => character.alive)
      .map((character) => ({
        id: character.id,
        displayName: character.displayName,
        position: character.position,
        radius: character.radius,
        active: character.id === activeCharacterId,
        functionLabel:
          this.activeShot() && character.id === this.activeShotCharacterId()
            ? activeShotEquation
            : character.id === lastShotLabel?.characterId
              ? lastShotLabel.equation
              : null,
      }));
  });
  readonly isMyTurn = computed(
    () => this.state()?.status === 'active' && this.state()?.turnUserId === this.userId(),
  );
  readonly equationHistory = computed(
    () => this.state()?.equationHistory?.map((entry) => entry.equation) ?? [],
  );
  readonly rememberedEquations = computed(() => {
    const state = this.state();
    const userId = this.userId();
    const remembered = new Map<number, string>();
    if (!state || !userId) return remembered;
    for (const entry of state.equationHistory ?? []) {
      const characterId = entry.shooterCharacterId;
      if (entry.shooterUserId === userId && typeof characterId === 'number') {
        remembered.set(characterId, entry.equation);
      }
    }
    return remembered;
  });
  readonly status = computed(() => {
    const state = this.state();
    if (!state) return 'Create a private room or join with a code.';
    const shareStatus = this.shareStatus();
    if (shareStatus) return shareStatus;
    if (this.activeShot()) return 'Shot in flight.';
    if (state.status === 'waiting') return `Room ${state.roomCode}: waiting for the second player.`;
    if (state.status === 'paused') return 'Match paused while a player reconnects.';
    if (state.status === 'ended')
      return state.winnerUserId === this.userId() ? 'You won.' : 'You lost.';
    return this.isMyTurn()
      ? 'Your turn.'
      : `${this.opponent()?.displayName ?? 'Opponent'} is aiming.`;
  });

  constructor() {
    const inviteRoomCode = this.route.snapshot.queryParamMap.get('room');
    if (inviteRoomCode) {
      this.setRoomCode(inviteRoomCode);
      this.inviteJoinPending = true;
    }
    effect(() => {
      const token = this.auth.session()?.token;
      if (!token) {
        this.socket.disconnect();
        this.state.set(null);
        return;
      }
      this.socket.connect(token, {
        state: (state) => this.receiveState(state),
        shot: (event) => this.animateShot(event),
        ended: () => undefined,
        error: (message) => this.error.set(message),
        connected: () => void this.joinInviteRoom(),
      });
    });
    effect(() => {
      const state = this.state();
      const userId = this.userId();
      const turnCharacterId = state?.turnCharacterId;
      if (
        !state ||
        state.status !== 'active' ||
        state.turnUserId !== userId ||
        turnCharacterId === null ||
        turnCharacterId === undefined
      ) {
        this.recalledTurnKey = null;
        return;
      }
      const turnKey = `${state.id}:${state.turnUserId}:${turnCharacterId}`;
      if (this.recalledTurnKey === turnKey) return;
      this.recalledTurnKey = turnKey;
      this.equation.set(this.rememberedEquations().get(turnCharacterId) ?? '0');
    });
  }

  async signIn(): Promise<void> {
    await this.auth.signIn(this.displayName());
  }

  async createRoom(): Promise<void> {
    const response = await this.socket.create({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
    });
    this.applyResponse(response);
  }

  async joinRoom(): Promise<boolean> {
    this.roomCode.set(formatRoomCode(this.roomCode()));
    const response = await this.socket.join({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      roomCode: this.roomCode(),
    });
    return this.applyResponse(response);
  }

  setRoomCode(value: string): void {
    this.roomCode.set(formatRoomCode(value));
  }

  async shareRoomLink(): Promise<void> {
    const roomCode = this.state()?.roomCode;
    if (!roomCode) return;
    const url = new URL('/games/equation-artillery/multiplayer', location.origin);
    url.searchParams.set('room', roomCode);
    try {
      await navigator.clipboard.writeText(url.toString());
      this.shareStatus.set('Share link copied.');
      this.error.set(null);
    } catch {
      this.shareStatus.set(null);
      this.error.set('Could not copy the share link.');
    }
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
    if (!state || this.activeShot()) return;
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

  private applyResponse(response: { ok: boolean; data?: MatchState; error?: string }): boolean {
    if (response.ok && response.data) {
      this.pendingState = null;
      this.state.set(response.data);
      this.error.set(null);
      return true;
    }
    this.error.set(response.error ?? 'The command was rejected.');
    return false;
  }

  private async joinInviteRoom(): Promise<void> {
    if (
      !this.inviteJoinPending ||
      this.inviteJoinInFlight ||
      this.state() ||
      !this.auth.session() ||
      !this.roomCode()
    ) {
      return;
    }
    this.inviteJoinInFlight = true;
    await this.joinRoom();
    this.inviteJoinPending = false;
    this.inviteJoinInFlight = false;
  }

  private animateShot(event: ShotResolvedEvent): void {
    if (event.error) {
      this.receiveState(event.state);
      this.error.set(event.error);
      return;
    }
    const firstPoint = event.trail[0];
    if (!firstPoint) {
      this.finishShot(event.state);
      return;
    }
    let index = 0;
    this.activeShot.set(true);
    this.activeShotCharacterId.set(event.shooterCharacterId);
    this.activeShotEquation.set(event.equation);
    this.lastShotLabel.set(
      event.shooterCharacterId === null
        ? null
        : { characterId: event.shooterCharacterId, equation: event.equation },
    );
    this.trail.set([firstPoint]);
    this.bullet.set({ position: firstPoint, radius: 0.18 });
    this.animation.start(() => {
      index += 1;
      const point = event.trail[index];
      if (!point) {
        this.finishShot(event.state);
        return false;
      }
      this.trail.set(event.trail.slice(0, index + 1));
      this.bullet.set({ position: point, radius: 0.18 });
      return true;
    });
  }

  private receiveState(state: MatchState): void {
    if (!this.activeShot()) {
      this.state.set(state);
      return;
    }
    if (!this.pendingState || state.version >= this.pendingState.version) this.pendingState = state;
  }

  private finishShot(resolvedState: MatchState): void {
    const nextState =
      this.pendingState && this.pendingState.version >= resolvedState.version
        ? this.pendingState
        : resolvedState;
    this.pendingState = null;
    this.state.set(nextState);
    this.bullet.set(null);
    this.trail.set([]);
    this.activeShot.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
  }

  private charactersForState(state: MatchState | null | undefined): readonly CharacterState[] {
    if (!state) return [];
    if (state.characters?.length) return state.characters;
    return state.players.map((player, index) => ({
      id: index === 0 ? 0 : 3,
      ownerUserId: player.userId,
      displayName: player.displayName,
      position: player.position,
      radius: player.radius,
      direction: player.direction,
      alive: true,
    }));
  }
}
