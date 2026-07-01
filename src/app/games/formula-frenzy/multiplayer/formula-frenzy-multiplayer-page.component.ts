import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideHeart, LucideLightbulb } from '@lucide/angular';
import {
  FORMULA_LEVELS,
  FormulaFrenzyMatchState,
  FormulaFrenzyPlayerState,
  MultiplayerMatchState,
} from '@math-war/game-engine';
import { AudioSettingsService } from '../../../shared/audio/audio-settings.service';
import { preventBackspaceNavigation } from '../../../shared/dom/prevent-backspace-navigation';
import { GameFrameComponent } from '../../../shared/game-frame/game-frame.component';
import { MultiplayerAuthService } from '../../../shared/multiplayer/multiplayer-auth.service';
import { MultiplayerLobbyComponent } from '../../../shared/multiplayer/multiplayer-lobby.component';
import { MultiplayerSocketService } from '../../../shared/multiplayer/multiplayer-socket.service';
import { formatRoomCode } from '../../../shared/multiplayer/room-code';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-formula-frenzy-multiplayer-page',
  imports: [
    GameFrameComponent,
    MultiplayerLobbyComponent,
    ReactiveFormsModule,
    LucideHeart,
    LucideLightbulb,
  ],
  templateUrl: './formula-frenzy-multiplayer-page.component.html',
  styleUrl: './formula-frenzy-multiplayer-page.component.scss',
})
export class FormulaFrenzyMultiplayerPageComponent implements AfterViewChecked, OnDestroy {
  readonly auth = inject(MultiplayerAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly socket = inject(MultiplayerSocketService);
  private readonly toast = inject(ToastService);
  private readonly audio = inject(AudioSettingsService);
  @ViewChild('answerInput') private answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('resultDialog') private resultDialog?: ElementRef<HTMLDialogElement>;

  readonly state = signal<FormulaFrenzyMatchState | null>(null);
  readonly keypadKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'] as const;
  readonly error = signal<string | null>(null);
  readonly answerRejected = signal(false);
  readonly opponentTyping = signal('');
  readonly now = signal(Date.now());
  readonly heartSlots = [1, 2, 3] as const;
  readonly localScorePulsed = signal(false);
  readonly localMultiplierPulsed = signal(false);
  readonly opponentScorePulsed = signal(false);
  readonly opponentMultiplierPulsed = signal(false);
  readonly answerControl = new FormControl({ value: '', disabled: true }, { nonNullable: true });

  private tickId: ReturnType<typeof setInterval> | null = null;
  private typingId: ReturnType<typeof setTimeout> | null = null;
  private localScorePulseId: ReturnType<typeof setTimeout> | null = null;
  private localMultiplierPulseId: ReturnType<typeof setTimeout> | null = null;
  private opponentScorePulseId: ReturnType<typeof setTimeout> | null = null;
  private opponentMultiplierPulseId: ReturnType<typeof setTimeout> | null = null;
  private lastTypingValue = '';
  private inviteJoinPending = false;
  private inviteJoinInFlight = false;
  private inviteRoomCode: string | null = null;

  readonly userId = computed(() => this.auth.session()?.user.id ?? null);
  readonly me = computed(
    () => this.state()?.formulaPlayers.find((player) => player.userId === this.userId()) ?? null,
  );
  readonly opponent = computed(
    () => this.state()?.formulaPlayers.find((player) => player.userId !== this.userId()) ?? null,
  );
  readonly opponentName = computed(
    () =>
      this.opponent()?.displayName ??
      this.state()?.players.find((player) => player.userId !== this.userId())?.displayName ??
      'Waiting',
  );
  readonly status = computed(() => {
    const state = this.state();
    if (!state) return 'Create a private room or join with a code.';
    if (state.status === 'waiting' && state.players.length < 2)
      return `Room ${state.roomCode}: waiting for the second player.`;
    if (state.status === 'waiting') return 'Host can start the run.';
    if (state.status === 'paused') return 'Match paused while a player reconnects.';
    if (state.status === 'ended')
      return state.winnerUserId === this.userId() ? 'You won.' : 'You lost.';
    return 'Solve before your timer hits zero.';
  });
  readonly isHost = computed(() => this.state()?.players[0]?.userId === this.userId());
  readonly averageSolveTime = computed(() => {
    const me = this.me();
    if (!me || me.totalCorrect === 0) return '0.0s';
    return `${(me.totalSolveTimeMs / me.totalCorrect / 1000).toFixed(1)}s`;
  });
  readonly resultTitle = computed(() =>
    this.state()?.winnerUserId === this.userId() ? 'You won' : 'Game over',
  );
  readonly canRequestHint = computed(() => {
    const state = this.state();
    const me = this.me();
    return (
      state?.status === 'active' &&
      !!me &&
      me.hintsRemaining > 0 &&
      me.currentHint === null
    );
  });

  constructor() {
    const inviteRoomCode = this.route.snapshot.queryParamMap.get('room');
    if (inviteRoomCode) {
      this.inviteRoomCode = formatRoomCode(inviteRoomCode);
      this.inviteJoinPending = true;
    }
    this.tickId = setInterval(() => this.now.set(Date.now()), 100);
    effect(() => {
      const token = this.auth.session()?.token;
      if (!token) {
        this.socket.disconnect();
        this.state.set(null);
        return;
      }
      this.socket.connect(token, {
        state: (state) => {
          if (state.gameId === 'formula-frenzy') this.receiveState(state);
        },
        formulaState: (state) => this.receiveState(state),
        formulaTyping: (event) => {
          if (event.userId !== this.userId()) this.opponentTyping.set(event.input);
        },
        ended: (event) => {
          const state = this.state();
          if (state?.id !== event.matchId) return;
          this.receiveState({
            ...state,
            status: 'ended',
            winnerUserId: event.winnerUserId,
            endReason: event.reason,
          });
        },
        error: (message) => this.error.set(message),
        connected: () => {
          this.error.set(null);
          void this.joinInviteRoom();
        },
      });
    });
  }

  onRoomJoined(state: MultiplayerMatchState): void {
    if (state.gameId === 'formula-frenzy') this.receiveState(state);
  }

  @HostListener('document:keydown', ['$event'])
  preventBrowserBackspace(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'h' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      void this.requestHint(event);
      return;
    }
    preventBackspaceNavigation(event);
  }

  ngAfterViewChecked(): void {
    this.syncResultDialog();
  }

  async submitAnswer(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    const state = this.state();
    if (!state || state.status !== 'active') return;
    const answer = Number(this.answerControl.value);
    if (Number.isNaN(answer)) {
      this.rejectAnswer();
      this.playSound('wrong-answer.wav');
      return;
    }
    const response = await this.socket.answerFormula({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
      answer,
    });
    if (!response.ok) {
      this.rejectAnswer();
      if (response.data) this.receiveState(response.data);
      this.error.set(response.error ?? 'The answer was rejected.');
      return;
    }
    if (!response.data) return;
    this.receiveState(response.data);
    this.answerControl.setValue('');
    this.sendTyping();
  }

  async startRun(): Promise<void> {
    const state = this.state();
    if (!state || (state.status !== 'waiting' && state.status !== 'ended')) return;
    if (!this.isHost()) return;
    const response = await this.socket.startFormula({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
    });
    if (!response.ok || !response.data) {
      this.error.set(response.error ?? 'Could not start the match.');
      return;
    }
    this.closeResultDialog();
    this.receiveState(response.data);
    this.answerInput?.nativeElement.focus();
  }

  async requestHint(event?: Event): Promise<void> {
    if (!this.canRequestHint()) return;
    event?.preventDefault();
    const state = this.state();
    if (!state) return;
    const response = await this.socket.requestFormulaHint({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
    });
    if (!response.ok || !response.data) {
      this.error.set(response.error ?? 'No hint is available right now.');
      return;
    }
    this.receiveState(response.data);
  }

  sendTyping(): void {
    if (this.typingId) clearTimeout(this.typingId);
    this.typingId = setTimeout(() => {
      const input = this.answerControl.value;
      if (input === this.lastTypingValue) return;
      this.lastTypingValue = input;
      this.socket.sendFormulaTyping({ input });
    }, 100);
  }

  async shareRoomLink(): Promise<void> {
    const roomCode = this.state()?.roomCode;
    if (!roomCode) return;
    const url = new URL('/games/formula-frenzy/multiplayer', location.origin);
    url.searchParams.set('room', roomCode);
    try {
      await navigator.clipboard.writeText(url.toString());
      this.toast.show('Link copied to clipboard!');
      this.error.set(null);
    } catch {
      this.error.set('Could not copy the share link.');
    }
  }

  async leave(): Promise<void> {
    const state = this.state();
    if (!state) return;
    const response = await this.socket.leave({
      commandId: crypto.randomUUID(),
      expectedVersion: state.version,
    });
    if (!response.ok) {
      this.error.set(response.error ?? 'Could not leave the match.');
      return;
    }
    this.closeResultDialog();
    this.state.set(null);
    void this.router.navigate(['/games/formula-frenzy']);
  }

  pressKeypadDigit(digit: string): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue(`${this.answerControl.value}${digit}`);
    this.sendTyping();
  }

  toggleKeypadSign(): void {
    if (this.answerControl.disabled) return;
    const value = this.answerControl.value;
    this.answerControl.setValue(value.startsWith('-') ? value.slice(1) : `-${value}`);
    this.sendTyping();
  }

  backspaceKeypad(): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue(this.answerControl.value.slice(0, -1));
    this.sendTyping();
  }

  clearKeypad(): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue('');
    this.sendTyping();
  }

  timeRemaining(player = this.me()): string {
    if (!player) return '0.0s';
    const startedAt = new Date(player.currentProblem.startedAt).getTime();
    const remaining = Math.max(0, player.currentProblem.deadlineMs - (this.now() - startedAt));
    return `${(remaining / 1000).toFixed(1)}s`;
  }

  xpProgress(player = this.me()): number {
    if (!player || player.level === 25) return 100;
    return Math.min(100, Math.round((player.xp / player.xpRequired) * 100));
  }

  levelName(level = 1): string {
    return FORMULA_LEVELS[level - 1]?.name ?? FORMULA_LEVELS[0].name;
  }

  multiplier(player = this.me()): string {
    const streak = player?.streak ?? 0;
    return Math.min(3, 1 + Math.max(0, streak - 1) * 0.1).toFixed(1);
  }

  playerHearts(player: FormulaFrenzyPlayerState | null): number {
    return player?.hearts ?? 0;
  }

  ngOnDestroy(): void {
    if (this.tickId) clearInterval(this.tickId);
    if (this.typingId) clearTimeout(this.typingId);
    this.clearPulseTimers();
    this.socket.disconnect();
  }

  private receiveState(state: FormulaFrenzyMatchState): void {
    const previousMe = this.me();
    const previousOpponent = this.opponent();
    const nextMe = state.formulaPlayers.find((player) => player.userId === this.userId()) ?? null;
    const nextOpponent =
      state.formulaPlayers.find((player) => player.userId !== this.userId()) ?? null;
    if (previousMe && nextMe?.score !== previousMe.score) {
      this.pulse(this.localScorePulsed, 'localScorePulseId');
      this.playSound('right-answer.wav');
    }
    if (previousMe && nextMe?.streak !== previousMe.streak) {
      this.pulse(this.localMultiplierPulsed, 'localMultiplierPulseId');
    }
    if (previousMe && nextMe && nextMe.hearts > previousMe.hearts) {
      this.playSound('heart-up.wav');
    }
    if (previousMe && nextMe && nextMe.hearts < previousMe.hearts) {
      this.playSound('wrong-answer.wav');
    }
    if (previousMe && nextMe && nextMe.level > previousMe.level) {
      this.playSound('level-up.wav');
    }
    if (previousMe && state.status === 'ended' && this.state()?.status !== 'ended') {
      this.playSound('game-over.wav');
    }
    if (previousOpponent && nextOpponent?.score !== previousOpponent.score) {
      this.pulse(this.opponentScorePulsed, 'opponentScorePulseId');
    }
    if (previousOpponent && nextOpponent?.streak !== previousOpponent.streak) {
      this.pulse(this.opponentMultiplierPulsed, 'opponentMultiplierPulseId');
    }
    this.state.set(state);
    this.answerRejected.set(false);
    this.error.set(null);
    if (state.status === 'active') {
      this.answerControl.enable({ emitEvent: false });
    } else {
      this.answerControl.disable({ emitEvent: false });
    }
    this.syncResultDialog();
  }

  private rejectAnswer(): void {
    this.answerRejected.set(true);
  }

  private playSound(file: string): void {
    this.audio.playOneShot(`/sounds/formula-frenzy/${file}`);
  }

  private pulse(
    pulsed: WritableSignal<boolean>,
    timer:
      | 'localScorePulseId'
      | 'localMultiplierPulseId'
      | 'opponentScorePulseId'
      | 'opponentMultiplierPulseId',
  ): void {
    if (this[timer]) clearTimeout(this[timer]);
    pulsed.set(false);
    this[timer] = setTimeout(() => {
      pulsed.set(true);
      this[timer] = setTimeout(() => pulsed.set(false), 180);
    });
  }

  private clearPulseTimers(): void {
    for (const timer of [
      'localScorePulseId',
      'localMultiplierPulseId',
      'opponentScorePulseId',
      'opponentMultiplierPulseId',
    ] as const) {
      if (this[timer]) clearTimeout(this[timer]);
      this[timer] = null;
    }
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
      gameId: 'formula-frenzy',
    });
    if (response.ok && response.data?.gameId === 'formula-frenzy') this.receiveState(response.data);
    else this.error.set(response.error ?? 'Could not join the room.');
    this.inviteJoinPending = false;
    this.inviteJoinInFlight = false;
  }

  private syncResultDialog(): void {
    const dialog = this.resultDialog?.nativeElement;
    if (!dialog) return;
    if (this.state()?.status === 'ended' && !dialog.open) {
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        if (!dialog.open) dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (this.state()?.status !== 'ended' && dialog.open) {
      dialog.close?.();
      dialog.removeAttribute('open');
    }
  }

  private closeResultDialog(): void {
    const dialog = this.resultDialog?.nativeElement;
    if (!dialog?.open) return;
    dialog.close?.();
    dialog.removeAttribute('open');
  }
}
