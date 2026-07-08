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
import { AccountProgressService } from '../../account/account-progress.service';
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
import { FormulaPromptComponent } from './formula-prompt/formula-prompt.component';
import {
  FORMULA_LEVELS,
  createFormulaProblem,
  createFormulaProblemForLevel,
  FormulaProblem,
  formulaProgress,
  scoreFormulaAnswer,
  soloFormulaProblemRandom,
} from './game/problem-generator';
import { FormulaFrenzyRunService, FormulaRunState } from './formula-frenzy-run.service';

type FormulaFrenzyMode = 'progression' | 'hardcore' | 'free-practice';

const HARDCORE_WARNING_STORAGE_KEY = 'math-war.formula-frenzy.hide-hardcore-warning';

@Component({
  selector: 'app-formula-frenzy-page',
  imports: [
    GameFrameComponent,
    MultiplayerLobbyComponent,
    ReactiveFormsModule,
    RouterLink,
    LucideHeart,
    LucideLightbulb,
    FormulaPromptComponent,
  ],
  templateUrl: './formula-frenzy-page.component.html',
  styleUrl: './formula-frenzy-page.component.scss',
})
export class FormulaFrenzyPageComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly auth = inject(AccountAuthService);
  private readonly audio = inject(AudioSettingsService);
  private readonly leaderboard = inject(LeaderboardService);
  private readonly progress = inject(AccountProgressService);
  private readonly runService = inject(FormulaFrenzyRunService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  @ViewChild('answerInput') private answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('resultDialog') private resultDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('hardcoreWarningDialog') private hardcoreWarningDialog?: ElementRef<HTMLDialogElement>;

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
  readonly resultDialogDismissed = signal(false);
  readonly leaderboardAuthPrompt = signal(false);
  readonly savingLeaderboard = signal(false);
  readonly hideHardcoreWarning = signal(false);
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
  private currentRunId = createProgressRunId();
  private savedProgressRunId: string | null = null;
  private currentCompletionToken: string | null = null;
  private runSeed: string | null = null;

  constructor() {
    effect(() => {
      if (this.auth.ready()) {
        void this.savePendingRuns();
      }
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

  async submitAnswer(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    if (this.gameOver() || this.timedModePaused()) return;

    const answer = Number(this.answerControl.value);
    if (Number.isNaN(answer)) {
      this.missAnswer();
      return;
    }

    if (answer !== this.problem().answer) {
      this.missAnswer();
      return;
    }

    if (this.timedMode()) void this.syncServerAnswer(answer);

    const solveTimeMs = Date.now() - this.problemStartedAt;
    const previousLevel = this.level();
    const nextStreak = this.streak() + 1;
    const nextExperience = this.experience() + 1;
    const progress = formulaProgress(nextExperience);
    this.totalSolveTimeMs.update((total) => total + solveTimeMs);
    this.totalCorrect.update((total) => total + 1);
    if (this.gameMode() === 'free-practice') {
      this.score.update((score) => score + 1);
    } else {
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
    }
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
    else this.problemStartedAt = Date.now();
    this.playSound('right-answer.wav');
    if (this.hearts() > previousHearts) this.playSound('heart-up.wav');
    if (this.level() > previousLevel) {
      this.playSound('level-up.wav');
    }
  }

  restart(): void {
    this.closeHardcoreWarningDialog();
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
    this.resultDialogDismissed.set(false);
    this.leaderboardAuthPrompt.set(false);
    this.savingLeaderboard.set(false);
    this.hideHardcoreWarning.set(false);
    this.runStarted.set(!this.timedMode());
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    this.currentRunId = createProgressRunId();
    this.savedProgressRunId = null;
    this.currentCompletionToken = null;
    this.runSeed = null;
    this.clearTimers();
    this.clearPulseTimers();
    this.timeRemainingMs.set(this.timedMode() ? this.problem().deadlineMs : 0);
    this.problemStartedAt = Date.now();
    this.syncAnswerControl();
  }

  async startRun(): Promise<void> {
    if (!this.timedMode() || this.runStarted()) return;
    if (this.hardcoreMode() && !this.hardcoreWarningDismissed()) {
      this.openHardcoreWarningDialog();
      return;
    }
    await this.beginRun();
  }

  async continueHardcoreRun(): Promise<void> {
    if (!this.hardcoreMode() || this.runStarted()) return;
    if (this.hideHardcoreWarning()) this.dismissHardcoreWarning();
    this.closeHardcoreWarningDialog();
    await this.beginRun();
  }

  setHideHardcoreWarning(value: boolean): void {
    this.hideHardcoreWarning.set(value);
  }

  private async beginRun(): Promise<void> {
    this.runStarted.set(true);
    this.syncAnswerControl();
    this.startProblemTimer();
    this.answerInput?.nativeElement.focus();
    try {
      const state = await this.runService.start(this.leaderboardDifficulty());
      this.currentRunId = state.runId;
      this.currentCompletionToken = state.completionToken ?? null;
      // Re-derive problems from the server seed so client and server agree on
      // every answer; otherwise the server credits none and the run saves as 0.
      this.runSeed = state.seed ?? null;
      this.problem.set(this.nextProblem());
      this.startProblemTimer();
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not start run.');
    }
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

  sanitizeAnswerInput(): void {
    const sanitized = sanitizeFormulaAnswerInput(this.answerControl.value);
    if (sanitized !== this.answerControl.value) {
      this.answerControl.setValue(sanitized, { emitEvent: false });
    }
  }

  requestHint(): boolean {
    if (!this.canRequestHint()) return false;
    const hint = this.problem().hint;
    if (!hint) return false;
    if (this.timedMode()) {
      void this.runService.hint(this.currentRunId).catch(() => undefined);
    }
    this.hintsRemaining.update((remaining) => remaining - 1);
    this.currentHint.set(hint);
    return true;
  }

  async saveCurrentRunToLeaderboard(): Promise<void> {
    if (!this.gameOver() || this.savingLeaderboard()) return;
    const run = this.currentLeaderboardRun();
    const completionToken = await this.ensureCompletionToken();
    if (!completionToken) {
      this.toast.show('Could not save this run.');
      return;
    }
    if (!this.auth.user()) {
      this.leaderboard.storePendingRun('formula-frenzy', run.difficulty, completionToken);
      this.progress.storePendingFormulaFrenzyRun(run.difficulty, completionToken);
      this.leaderboardAuthPrompt.set(true);
      return;
    }
    const saved = await this.saveRunToLeaderboard(completionToken);
    if (saved) {
      await this.saveCurrentRunProgress();
      this.closeResultDialog(true);
    }
  }

  private lose(): void {
    this.gameOver.set(true);
    this.resultDialogDismissed.set(false);
    this.leaderboardAuthPrompt.set(false);
    this.runStarted.set(false);
    this.clearTimers();
    this.syncAnswerControl();
    this.syncResultDialog();
    this.playSound('game-over.wav');
    if (this.timedMode())
      void this.finishCurrentServerRun().then(() => this.saveCurrentRunProgress());
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
    this.answerControl.setValue('');
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

  private async saveRunToLeaderboard(completionToken: string): Promise<boolean> {
    this.savingLeaderboard.set(true);
    try {
      const result = await this.leaderboard.save('formula-frenzy', completionToken);
      if (result.status === 'not_improved') {
        this.toast.show('That run is lower than your saved leaderboard score.');
      } else {
        this.toast.show('Score saved to leaderboard.');
      }
      this.leaderboardAuthPrompt.set(false);
      return true;
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not save leaderboard score.');
      return false;
    } finally {
      this.savingLeaderboard.set(false);
    }
  }

  private async saveCurrentRunProgress(): Promise<void> {
    if (!this.auth.user() || this.gameMode() === 'free-practice') return;
    const completionToken = await this.ensureCompletionToken();
    if (!completionToken || this.savedProgressRunId === this.currentRunId) return;
    try {
      const result = await this.progress.saveFormulaFrenzyRun(completionToken);
      this.savedProgressRunId = this.currentRunId;
      for (const achievement of result.newlyUnlocked) {
        this.toast.show(`Achievement unlocked: ${achievementTitle(achievement.id)}`);
      }
    } catch {}
  }

  private async savePendingRuns(): Promise<void> {
    if (this.pendingAutoSaveHandled || !this.auth.ready()) return;
    if (this.route.snapshot.queryParamMap.get('saveLeaderboard') !== '1') return;
    if (!this.auth.user()) return;
    this.pendingAutoSaveHandled = true;
    const difficulty = this.pendingLeaderboardDifficulty();
    const leaderboardRun = this.leaderboard.takePendingRun('formula-frenzy', difficulty);
    const progressRun = this.progress.takePendingFormulaFrenzyRun(difficulty);
    await this.router.navigate([], {
      queryParams: { saveLeaderboard: null, difficulty: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (leaderboardRun) await this.saveRunToLeaderboard(leaderboardRun);
    if (!progressRun) return;
    try {
      const result = await this.progress.saveFormulaFrenzyRun(progressRun);
      for (const achievement of result.newlyUnlocked) {
        this.toast.show(`Achievement unlocked: ${achievementTitle(achievement.id)}`);
      }
    } catch {}
  }

  private async requestServerHint(): Promise<void> {
    try {
      this.applyServerRun(await this.runService.hint(this.currentRunId));
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not request hint.');
    }
  }

  private async syncServerAnswer(answer: number): Promise<void> {
    try {
      const state = await this.runService.answer(this.currentRunId, answer);
      this.currentRunId = state.runId;
      this.currentCompletionToken = state.completionToken ?? null;
    } catch {}
  }

  private async finishCurrentServerRun(): Promise<void> {
    if (!this.timedMode() || this.currentCompletionToken) return;
    try {
      this.applyServerRun(await this.runService.finish(this.currentRunId));
    } catch {}
  }

  private async ensureCompletionToken(): Promise<string | null> {
    if (this.currentCompletionToken) return this.currentCompletionToken;
    await this.finishCurrentServerRun();
    return this.currentCompletionToken;
  }

  private applyServerRun(state: FormulaRunState): void {
    this.currentRunId = state.runId;
    this.currentCompletionToken = state.completionToken ?? null;
    this.score.set(state.score);
    this.experience.set(state.experience);
    this.level.set(state.level);
    this.xp.set(state.xp);
    this.xpRequired.set(state.xpRequired);
    this.streak.set(state.streak);
    this.bestStreak.set(state.bestStreak);
    this.hearts.set(state.hearts);
    this.hintsRemaining.set(state.hintsRemaining);
    this.currentHint.set(state.currentHint);
    this.highestLevel.set(state.highestLevel);
    this.totalCorrect.set(state.totalCorrect);
    this.totalSolveTimeMs.set(state.totalSolveTimeMs);
    this.problem.set({
      prompt: state.currentProblem.prompt,
      level: state.currentProblem.level,
      levelName: state.currentProblem.levelName,
      deadlineMs: state.currentProblem.deadlineMs,
      hint: state.currentProblem.hint ?? undefined,
      // ponytail: server strips the answer from the run payload (anti-cheat),
      // so keep the answer the client derived locally from the run seed.
      answer: this.problem().answer,
    });
    this.problemStartedAt = Date.parse(state.currentProblem.startedAt);
    this.gameOver.set(state.status === 'ended');
    this.runStarted.set(state.status === 'active');
    this.syncAnswerControl();
    if (state.status === 'ended') {
      this.clearTimers();
      this.syncResultDialog();
    }
  }

  private pendingLeaderboardDifficulty(): LeaderboardDifficulty {
    return this.route.snapshot.queryParamMap.get('difficulty') === 'hardcore'
      ? 'hardcore'
      : 'normal';
  }

  private nextProblem(): FormulaProblem {
    const experience = this.experience();
    return this.runSeed
      ? createFormulaProblem(experience, soloFormulaProblemRandom(this.runSeed, experience))
      : createFormulaProblem(experience);
  }

  private syncAnswerControl(): void {
    if (this.gameOver() || this.timedModePaused()) {
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
    if (this.gameOver() && !this.resultDialogDismissed() && !dialog.open) {
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        if (!dialog.open) dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if ((!this.gameOver() || this.resultDialogDismissed()) && dialog.open) {
      dialog.close?.();
      dialog.removeAttribute('open');
    }
  }

  private closeResultDialog(dismiss = false): void {
    if (dismiss) this.resultDialogDismissed.set(true);
    const dialog = this.resultDialog?.nativeElement;
    if (!dialog?.open) return;
    dialog.close?.();
    dialog.removeAttribute('open');
  }

  private openHardcoreWarningDialog(): void {
    const dialog = this.hardcoreWarningDialog?.nativeElement;
    if (!dialog || dialog.open) return;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      if (!dialog.open) dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
  }

  private closeHardcoreWarningDialog(): void {
    const dialog = this.hardcoreWarningDialog?.nativeElement;
    if (!dialog?.open) return;
    dialog.close?.();
    dialog.removeAttribute('open');
  }

  private hardcoreWarningDismissed(): boolean {
    try {
      return localStorage.getItem(HARDCORE_WARNING_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private dismissHardcoreWarning(): void {
    try {
      localStorage.setItem(HARDCORE_WARNING_STORAGE_KEY, '1');
    } catch {
      // Storage can be unavailable in tests, SSR, or privacy modes.
    }
  }
}

function sanitizeFormulaAnswerInput(value: string): string {
  const negative = value.trimStart().startsWith('-');
  const digits = value.replace(/\D/g, '');
  return `${negative ? '-' : ''}${digits}`;
}

function createProgressRunId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function achievementTitle(id: string): string {
  return id
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
