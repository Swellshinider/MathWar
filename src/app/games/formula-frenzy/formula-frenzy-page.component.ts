import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideHeart, LucideLightbulb } from '@lucide/angular';
import { MultiplayerMatchState } from '@math-war/game-engine';
import { AccountAuthService } from '../../account/account-auth.service';
import {
  LeaderboardDifficulty,
  LeaderboardRun,
  LeaderboardService,
} from '../../leaderboard/leaderboard.service';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { preventBackspaceNavigation } from '../../shared/dom/prevent-backspace-navigation';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import { MultiplayerLobbyComponent } from '../../shared/multiplayer/multiplayer-lobby.component';
import { ToastService } from '../../shared/toast/toast.service';
import {
  FORMULA_OPERATION_OPTIONS,
  FORMULA_LEVELS,
  createFormulaPracticeProblem,
  createFormulaProblem,
  createFormulaProblemForLevel,
  FormulaOperation,
  FormulaProblem,
  formulaProgress,
  scoreFormulaAnswer,
} from './game/problem-generator';

type FormulaFrenzyMode = 'progression' | 'hardcore' | 'free-practice';

@Component({
  selector: 'app-formula-frenzy-page',
  imports: [
    GameFrameComponent,
    MultiplayerLobbyComponent,
    ReactiveFormsModule,
    RouterLink,
    LucideHeart,
    LucideLightbulb,
  ],
  templateUrl: './formula-frenzy-page.component.html',
  styleUrl: './formula-frenzy-page.component.scss',
})
export class FormulaFrenzyPageComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly auth = inject(AccountAuthService);
  private readonly audio = inject(AudioSettingsService);
  private readonly leaderboard = inject(LeaderboardService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  @ViewChild('answerInput') private answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('resultDialog') private resultDialog?: ElementRef<HTMLDialogElement>;

  readonly problem = signal<FormulaProblem>(createFormulaProblemForLevel(1));
  readonly keypadKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'] as const;
  readonly gameMode = signal<FormulaFrenzyMode>('progression');
  readonly timedMode = computed(() => this.gameMode() !== 'free-practice');
  readonly hardcoreMode = computed(() => this.gameMode() === 'hardcore');
  readonly runStarted = signal(false);
  readonly heartSlots = [1, 2, 3] as const;
  readonly hintsRemaining = signal(3);
  readonly currentHint = signal<string | null>(null);
  readonly canRequestHint = computed(
    () =>
      this.gameMode() === 'progression' &&
      this.runStarted() &&
      !this.gameOver() &&
      this.hintsRemaining() > 0 &&
      this.currentHint() === null,
  );
  readonly operationOptions = FORMULA_OPERATION_OPTIONS;
  readonly practiceOperations = signal<readonly FormulaOperation[]>(
    FORMULA_OPERATION_OPTIONS.map((option) => option.operation),
  );
  readonly practicePaused = computed(
    () => this.gameMode() === 'free-practice' && this.practiceOperations().length === 0,
  );
  readonly score = signal(0);
  readonly experience = signal(0);
  readonly level = signal(1);
  readonly levelName = computed(() => FORMULA_LEVELS[this.level() - 1].name);
  readonly xp = signal(0);
  readonly xpRequired = signal(FORMULA_LEVELS[0].xpRequired);
  readonly xpProgress = computed(() => {
    if (this.level() === 25) return 100;
    return Math.min(100, Math.round((this.xp() / this.xpRequired()) * 100));
  });
  readonly streak = signal(0);
  readonly bestStreak = signal(0);
  readonly hearts = signal(3);
  readonly highestLevel = signal(1);
  readonly highestLevelName = computed(() => FORMULA_LEVELS[this.highestLevel() - 1].name);
  readonly totalCorrect = signal(0);
  readonly gameOver = signal(false);
  readonly leaderboardAuthPrompt = signal(false);
  readonly savingLeaderboard = signal(false);
  readonly answerRejected = signal(false);
  readonly answerRejectionCount = signal(0);
  readonly scorePulsed = signal(false);
  readonly multiplierPulsed = signal(false);
  readonly timeRemainingMs = signal(this.problem().deadlineMs);
  readonly answerControl = new FormControl('', { nonNullable: true });
  readonly averageSolveTime = computed(() => {
    if (this.totalCorrect() === 0) return '0.0s';
    return `${(this.totalSolveTimeMs() / this.totalCorrect() / 1000).toFixed(1)}s`;
  });
  readonly leaderboardReturnUrl = computed(
    () =>
      `/games/formula-frenzy?saveLeaderboard=1${this.hardcoreMode() ? '&difficulty=hardcore' : ''}`,
  );
  readonly timeRemaining = computed(() => `${(this.timeRemainingMs() / 1000).toFixed(1)}s`);
  readonly multiplier = computed(() =>
    Math.min(3, 1 + Math.max(0, this.streak() - 1) * 0.1).toFixed(1),
  );

  private readonly totalSolveTimeMs = signal(0);
  private problemStartedAt = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private scorePulseId: ReturnType<typeof setTimeout> | null = null;
  private multiplierPulseId: ReturnType<typeof setTimeout> | null = null;
  private nextTickAtMs = 0;
  private pendingAutoSaveHandled = false;

  constructor() {
    effect(() => {
      if (this.auth.ready()) void this.savePendingLeaderboardRun();
    });
  }

  ngOnInit(): void {
    this.syncAnswerControl();
  }

  ngAfterViewChecked(): void {
    this.syncResultDialog();
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.clearPulseTimers();
  }

  @HostListener('document:keydown', ['$event'])
  preventBrowserBackspace(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'h' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (this.requestHint()) event.preventDefault();
      return;
    }
    preventBackspaceNavigation(event);
  }

  submitAnswer(event?: SubmitEvent): void {
    event?.preventDefault();
    if (this.gameOver() || this.practicePaused() || this.timedModePaused()) return;

    const answer = Number(this.answerControl.value);
    if (Number.isNaN(answer)) {
      this.missAnswer();
      return;
    }

    if (answer !== this.problem().answer) {
      this.missAnswer();
      return;
    }

    const solveTimeMs = Date.now() - this.problemStartedAt;
    if (this.gameMode() === 'free-practice') {
      const nextStreak = this.streak() + 1;
      this.totalSolveTimeMs.update((total) => total + solveTimeMs);
      this.totalCorrect.update((total) => total + 1);
      this.score.update((score) => score + 1);
      this.pulseScore();
      this.streak.set(nextStreak);
      this.pulseMultiplier();
      this.bestStreak.update((best) => Math.max(best, nextStreak));
      this.answerRejected.set(false);
      this.answerRejectionCount.set(0);
      this.answerControl.setValue('');
      this.problem.set(this.nextProblem());
      this.playSound('right-answer.wav');
      return;
    }

    const previousLevel = this.level();
    const nextStreak = this.streak() + 1;
    const nextExperience = this.experience() + 1;
    const progress = formulaProgress(nextExperience);
    this.totalSolveTimeMs.update((total) => total + solveTimeMs);
    this.totalCorrect.update((total) => total + 1);
    this.score.update(
      (score) =>
        score +
        scoreFormulaAnswer(
          nextStreak,
          solveTimeMs,
          this.problem().deadlineMs,
          this.problem().level,
          this.currentHint() !== null,
        ),
    );
    this.pulseScore();
    this.experience.set(nextExperience);
    this.level.set(progress.level);
    this.xp.set(progress.xp);
    this.xpRequired.set(progress.xpRequired);
    this.streak.set(nextStreak);
    this.pulseMultiplier();
    this.bestStreak.update((best) => Math.max(best, nextStreak));
    const previousHearts = this.hearts();
    if (this.gameMode() === 'progression' && nextStreak % 5 === 0) {
      this.hearts.update((hearts) => Math.min(3, hearts + 1));
    }
    if (this.gameMode() === 'progression' && nextStreak % 10 === 0) {
      this.hintsRemaining.update((hints) => Math.min(3, hints + 1));
    }
    this.highestLevel.update((highest) => Math.max(highest, progress.level));
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.currentHint.set(null);
    this.problem.set(this.nextProblem());
    if (this.timedMode()) this.startProblemTimer();
    this.playSound('right-answer.wav');
    if (this.hearts() > previousHearts) this.playSound('heart-up.wav');
    if (this.timedMode() && this.level() > previousLevel) {
      this.playSound('level-up.wav');
    }
  }

  restart(): void {
    this.closeResultDialog();
    this.score.set(0);
    this.scorePulsed.set(false);
    this.experience.set(0);
    this.level.set(1);
    this.xp.set(0);
    this.xpRequired.set(FORMULA_LEVELS[0].xpRequired);
    this.streak.set(0);
    this.multiplierPulsed.set(false);
    this.bestStreak.set(0);
    this.hearts.set(this.hardcoreMode() ? 0 : 3);
    this.hintsRemaining.set(this.hardcoreMode() ? 0 : 3);
    this.currentHint.set(null);
    this.highestLevel.set(1);
    this.totalCorrect.set(0);
    this.totalSolveTimeMs.set(0);
    this.gameOver.set(false);
    this.leaderboardAuthPrompt.set(false);
    this.savingLeaderboard.set(false);
    this.runStarted.set(!this.timedMode());
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    this.clearTimers();
    this.clearPulseTimers();
    this.timeRemainingMs.set(this.timedMode() ? this.problem().deadlineMs : 0);
    this.syncAnswerControl();
  }

  startRun(): void {
    if (!this.timedMode() || this.runStarted()) return;
    this.runStarted.set(true);
    this.syncAnswerControl();
    this.startProblemTimer();
    this.answerInput?.nativeElement.focus();
  }

  selectSprint(): void {
    this.selectProgression();
  }

  selectProgression(): void {
    this.gameMode.set('progression');
    this.restart();
  }

  selectHardcore(): void {
    this.gameMode.set('hardcore');
    this.restart();
  }

  selectFreePractice(): void {
    this.gameMode.set('free-practice');
    this.restart();
  }

  setPracticeOperation(operation: FormulaOperation, enabled: boolean): void {
    const operations = this.practiceOperations();
    const nextOperations = enabled
      ? [...operations, operation]
      : operations.filter((current) => current !== operation);
    this.practiceOperations.set([...new Set(nextOperations)]);
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    if (this.gameMode() === 'free-practice' && nextOperations.length > 0) {
      this.problem.set(this.nextProblem());
    }
    this.syncAnswerControl();
  }

  enterMultiplayer(state: MultiplayerMatchState): void {
    if (state.gameId === 'formula-frenzy') {
      void this.router.navigate(['/games/formula-frenzy/multiplayer']);
    }
  }

  pressKeypadDigit(digit: string): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue(`${this.answerControl.value}${digit}`);
  }

  toggleKeypadSign(): void {
    if (this.answerControl.disabled) return;
    const value = this.answerControl.value;
    this.answerControl.setValue(value.startsWith('-') ? value.slice(1) : `-${value}`);
  }

  backspaceKeypad(): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue(this.answerControl.value.slice(0, -1));
  }

  clearKeypad(): void {
    if (this.answerControl.disabled) return;
    this.answerControl.setValue('');
  }

  requestHint(): boolean {
    if (!this.canRequestHint()) return false;
    const hint = this.problem().hint;
    if (!hint) return false;
    this.hintsRemaining.update((remaining) => remaining - 1);
    this.currentHint.set(hint);
    return true;
  }

  async saveCurrentRunToLeaderboard(): Promise<void> {
    if (!this.gameOver() || this.savingLeaderboard()) return;
    const run = this.currentLeaderboardRun();
    if (!this.auth.user()) {
      this.leaderboard.storePendingRun('formula-frenzy', run);
      this.leaderboardAuthPrompt.set(true);
      return;
    }
    await this.saveRunToLeaderboard(run);
  }

  private lose(): void {
    this.gameOver.set(true);
    this.leaderboardAuthPrompt.set(false);
    this.runStarted.set(false);
    this.clearTimers();
    this.syncAnswerControl();
    this.syncResultDialog();
    this.playSound('game-over.wav');
  }

  private rejectAnswer(): void {
    this.answerRejected.set(true);
    this.answerRejectionCount.update((count) => count + 1);
    this.playSound('wrong-answer.wav');
  }

  private missAnswer(): void {
    this.rejectAnswer();
    this.streak.set(0);
    this.pulseMultiplier();
    if (this.gameMode() === 'free-practice') return;
    if (this.hardcoreMode()) {
      this.lose();
      return;
    }
    this.hearts.update((hearts) => Math.max(0, hearts - 1));
    if (this.hearts() === 0) this.lose();
  }

  private timeoutProblem(): void {
    this.lose();
  }

  private startProblemTimer(): void {
    this.clearTimers();
    this.problemStartedAt = Date.now();
    this.timeRemainingMs.set(this.problem().deadlineMs);
    this.nextTickAtMs = this.computeNextTick(this.problem().deadlineMs);
    this.timeoutId = setTimeout(() => this.timeoutProblem(), this.problem().deadlineMs);
    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - this.problemStartedAt;
      const remaining = Math.max(0, this.problem().deadlineMs - elapsed);
      this.timeRemainingMs.set(remaining);
      while (this.nextTickAtMs > 0 && remaining <= this.nextTickAtMs) {
        this.playSound('time-tick.wav');
        this.nextTickAtMs = this.computeNextTick(this.nextTickAtMs);
      }
    }, 100);
  }

  // Below 10s the tick fires once per second; below 3s the gap shrinks so it
  // accelerates into zero. Returns the next remaining-time threshold to tick at.
  private computeNextTick(remainingMs: number): number {
    if (remainingMs > 3000) {
      return Math.max(3000, Math.floor((remainingMs - 1) / 1000) * 1000);
    }
    return Math.max(0, remainingMs - Math.max(80, Math.floor(remainingMs / 8)));
  }

  private clearTimers(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.intervalId) clearInterval(this.intervalId);
    this.timeoutId = null;
    this.intervalId = null;
  }

  private clearPulseTimers(): void {
    if (this.scorePulseId) clearTimeout(this.scorePulseId);
    if (this.multiplierPulseId) clearTimeout(this.multiplierPulseId);
    this.scorePulseId = null;
    this.multiplierPulseId = null;
  }

  private pulseScore(): void {
    if (this.scorePulseId) clearTimeout(this.scorePulseId);
    this.scorePulsed.set(false);
    this.scorePulseId = setTimeout(() => {
      this.scorePulsed.set(true);
      this.scorePulseId = setTimeout(() => this.scorePulsed.set(false), 180);
    });
  }

  private pulseMultiplier(): void {
    if (this.multiplierPulseId) clearTimeout(this.multiplierPulseId);
    this.multiplierPulsed.set(false);
    this.multiplierPulseId = setTimeout(() => {
      this.multiplierPulsed.set(true);
      this.multiplierPulseId = setTimeout(() => this.multiplierPulsed.set(false), 180);
    });
  }

  private playSound(file: string): void {
    this.audio.playOneShot(`/sounds/formula-frenzy/${file}`);
  }

  private currentLeaderboardRun(): LeaderboardRun {
    const totalCorrect = this.totalCorrect();
    return {
      difficulty: this.leaderboardDifficulty(),
      score: this.score(),
      level: this.highestLevel(),
      averageTimeMs: totalCorrect === 0 ? null : Math.round(this.totalSolveTimeMs() / totalCorrect),
      bestStreak: this.bestStreak(),
      totalCorrect,
    };
  }

  private leaderboardDifficulty(): LeaderboardDifficulty {
    return this.hardcoreMode() ? 'hardcore' : 'normal';
  }

  private async saveRunToLeaderboard(run: LeaderboardRun): Promise<void> {
    this.savingLeaderboard.set(true);
    try {
      const result = await this.leaderboard.save('formula-frenzy', run);
      if (result.status === 'not_improved') {
        this.toast.show('That run is lower than your saved leaderboard score.');
      } else {
        this.toast.show('Score saved to leaderboard.');
      }
      this.leaderboardAuthPrompt.set(false);
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not save leaderboard score.');
    } finally {
      this.savingLeaderboard.set(false);
    }
  }

  private async savePendingLeaderboardRun(): Promise<void> {
    if (this.pendingAutoSaveHandled || !this.auth.ready()) return;
    if (this.route.snapshot.queryParamMap.get('saveLeaderboard') !== '1') return;
    if (!this.auth.user()) return;
    this.pendingAutoSaveHandled = true;
    const difficulty = this.pendingLeaderboardDifficulty();
    const run = this.leaderboard.takePendingRun('formula-frenzy', difficulty);
    await this.router.navigate([], {
      queryParams: { saveLeaderboard: null, difficulty: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (run) await this.saveRunToLeaderboard(run);
  }

  private pendingLeaderboardDifficulty(): LeaderboardDifficulty {
    return this.route.snapshot.queryParamMap.get('difficulty') === 'hardcore'
      ? 'hardcore'
      : 'normal';
  }

  private nextProblem(): FormulaProblem {
    if (this.gameMode() === 'free-practice' && this.practiceOperations().length > 0) {
      return createFormulaPracticeProblem(this.practiceOperations());
    }
    return createFormulaProblem(this.experience());
  }

  private syncAnswerControl(): void {
    if (this.gameOver() || this.practicePaused() || this.timedModePaused()) {
      this.answerControl.disable({ emitEvent: false });
    } else {
      this.answerControl.enable({ emitEvent: false });
    }
  }

  private timedModePaused(): boolean {
    return this.timedMode() && !this.runStarted();
  }

  private syncResultDialog(): void {
    const dialog = this.resultDialog?.nativeElement;
    if (!dialog) return;
    if (this.gameOver() && !dialog.open) {
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        if (!dialog.open) dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (!this.gameOver() && dialog.open) {
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
