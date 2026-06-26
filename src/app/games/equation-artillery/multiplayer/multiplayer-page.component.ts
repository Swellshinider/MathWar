import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideCircleHelp, LucideVolume2 } from '@lucide/angular';
import {
  CharacterState,
  MatchEndedEvent,
  MatchState,
  PlayerState,
  ShotResolvedEvent,
} from '@math-war/game-engine';
import { GameFrameComponent } from '../../../shared/game-frame/game-frame.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { BoardComponent } from '../board/board.component';
import { EquationHelpDialogComponent } from '../equation-help-dialog/equation-help-dialog.component';
import {
  EquationHistoryComponent,
  EquationHistoryMessage,
} from '../equation-history/equation-history.component';
import { mapEquationHistoryMessages } from '../equation-history/equation-history-message';
import { AnimationService } from '../game/animation.service';
import { EquationArtilleryAudioService } from '../game/audio.service';
import { BoardCharacter } from '../game/board-renderer.service';
import { Bullet } from '../models/bullet';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { SoundSettingsDialogComponent } from '../sound-settings-dialog/sound-settings-dialog.component';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerLobbyComponent } from './multiplayer-lobby.component';
import { MultiplayerSocketService } from './multiplayer-socket.service';
import { formatRoomCode } from './room-code';

const ATTACK_ANIMATION_DURATION_MS = 3000;

@Component({
  selector: 'app-multiplayer-page',
  imports: [
    BoardComponent,
    EquationHelpDialogComponent,
    EquationHistoryComponent,
    FormsModule,
    GameFrameComponent,
    LucideCircleHelp,
    LucideVolume2,
    MultiplayerLobbyComponent,
    SoundSettingsDialogComponent,
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
  private readonly audio = inject(EquationArtilleryAudioService);
  private readonly toast = inject(ToastService);
  readonly state = signal<MatchState | null>(null);
  readonly equation = signal('0');
  readonly error = signal<string | null>(null);
  readonly activeShot = signal(false);
  readonly activeShotCharacterId = signal<number | null>(null);
  readonly activeShotEquation = signal<string | null>(null);
  readonly lastShotLabel = signal<{ characterId: number; equation: string } | null>(null);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  private pendingState: MatchState | null = null;
  private readonly pendingLocalShotCommandIds = new Set<string>();
  private lastEndedSoundKey: string | null = null;
  private recalledTurnKey: string | null = null;
  private inviteJoinPending = false;
  private inviteJoinInFlight = false;
  private inviteRoomCode: string | null = null;
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
  readonly equationHistory = computed<readonly EquationHistoryMessage[]>(() => {
    const state = this.state();
    const userId = this.userId();
    if (!state) return [];
    return mapEquationHistoryMessages({
      entries: state.equationHistory ?? [],
      players: state.players,
      characters: this.charactersForState(state),
      currentUserId: userId,
      fallbackIdPrefix: 'history',
      fallbackSenderName: 'Opponent',
    });
  });
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
      this.inviteRoomCode = formatRoomCode(inviteRoomCode);
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
        ended: (event) => this.playMatchResult(event),
        error: (message) => this.error.set(message),
        connected: () => {
          this.error.set(null);
          void this.joinInviteRoom();
        },
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

  onRoomJoined(state: MatchState): void {
    this.setState(state);
  }

  async shareRoomLink(): Promise<void> {
    const roomCode = this.state()?.roomCode;
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

  async fire(): Promise<void> {
    const state = this.state();
    if (!state || !this.isMyTurn() || this.activeShot()) return;
    this.error.set(null);
    const commandId = crypto.randomUUID();
    this.pendingLocalShotCommandIds.add(commandId);
    this.audio.playFire();
    const response = await this.socket.fire({
      commandId,
      expectedVersion: state.version,
      equation: this.equation(),
    });
    if (!response.ok) {
      this.pendingLocalShotCommandIds.delete(commandId);
      this.error.set(response.error ?? 'The shot was rejected.');
    }
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

  requestLeave(dialog: HTMLDialogElement): void {
    if (this.opponent()?.connected) dialog.showModal();
    else void this.leave();
  }

  confirmLeave(dialog: HTMLDialogElement): void {
    dialog.close();
    void this.leave();
  }

  cancelLeave(dialog: HTMLDialogElement): void {
    dialog.close();
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
    this.audio.stopEquationSound();
    this.socket.disconnect();
  }

  private applyResponse(response: { ok: boolean; data?: MatchState; error?: string }): boolean {
    if (response.ok && response.data) {
      this.pendingState = null;
      this.setState(response.data);
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
      !this.inviteRoomCode
    ) {
      return;
    }
    this.inviteJoinInFlight = true;
    const response = await this.socket.join({
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
      roomCode: this.inviteRoomCode,
    });
    this.applyResponse(response);
    this.inviteJoinPending = false;
    this.inviteJoinInFlight = false;
  }

  private animateShot(event: ShotResolvedEvent): void {
    const isLocalShot = event.shooterUserId === this.userId();
    const alreadyPlayedLocalFire = this.pendingLocalShotCommandIds.delete(event.commandId);
    if (event.error) {
      this.receiveState(event.state);
      this.error.set(event.error);
      return;
    }
    const firstPoint = event.trail[0];
    if (!firstPoint) {
      this.finishShot(event);
      return;
    }
    if (!isLocalShot || !alreadyPlayedLocalFire) this.audio.playFire();
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
    this.audio.startEquationSound(firstPoint);
    this.animation.startTimeline((progress) => {
      const nextIndex = Math.min(
        Math.floor(progress * (event.trail.length - 1)),
        event.trail.length - 1,
      );
      if (nextIndex === index && progress < 1) return true;
      index = nextIndex;
      const point = event.trail[index];
      if (!point) {
        this.finishShot(event);
        return false;
      }
      this.trail.set(event.trail.slice(0, index + 1));
      this.bullet.set({ position: point, radius: 0.18 });
      this.audio.updateEquationSound(point);
      if (progress >= 1) {
        this.finishShot(event);
        return false;
      }
      return true;
    }, ATTACK_ANIMATION_DURATION_MS);
  }

  private receiveState(state: MatchState): void {
    if (!this.activeShot()) {
      this.setState(state);
      return;
    }
    if (!this.pendingState || state.version >= this.pendingState.version) this.pendingState = state;
  }

  private finishShot(event: ShotResolvedEvent): void {
    const nextState =
      this.pendingState && this.pendingState.version >= event.state.version
        ? this.pendingState
        : event.state;
    this.pendingState = null;
    this.setState(nextState);
    this.bullet.set(null);
    this.trail.set([]);
    this.activeShot.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
    this.audio.stopEquationSound();
    if (event.impact === 'wall') this.audio.playWallHit();
    if (event.impact === 'opponent') this.audio.playEnemyHit();
  }

  private setState(state: MatchState): void {
    this.state.set(state);
    if (state.status === 'ended') this.playMatchResult(state);
  }

  private playMatchResult(event: MatchState | MatchEndedEvent): void {
    const matchId = 'matchId' in event ? event.matchId : event.id;
    const key = `${matchId}:${event.version}:${event.winnerUserId ?? 'none'}`;
    if (this.lastEndedSoundKey === key) return;
    this.lastEndedSoundKey = key;
    if (event.winnerUserId === this.userId()) this.audio.playWin();
    else this.audio.playLose();
  }

  private charactersForState(state: MatchState | null | undefined): readonly CharacterState[] {
    if (!state) return [];
    const characters = state.characters?.length
      ? state.characters
      : state.players.map((player, index) => ({
          id: index === 0 ? 0 : 3,
          ownerUserId: player.userId,
          displayName: player.displayName,
          position: player.position,
          radius: player.radius,
          direction: player.direction,
          alive: true,
        }));
    return state.players.flatMap((player) =>
      characters
        .filter((character) => character.ownerUserId === player.userId)
        .sort((first, second) => first.id - second.id)
        .map((character, index) => ({
          ...character,
          displayName: `${player.displayName}-${index + 1}`,
        })),
    );
  }
}
