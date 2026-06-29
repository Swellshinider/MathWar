import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideHeart } from '@lucide/angular';
import { MultiplayerMatchState } from '@math-war/game-engine';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { preventBackspaceNavigation } from '../../shared/dom/prevent-backspace-navigation';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import { MultiplayerLobbyComponent } from '../../shared/multiplayer/multiplayer-lobby.component';
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

type FormulaFrenzyMode = 'progression' | 'free-practice';

@Component({
  selector: 'app-formula-frenzy-page',
  imports: [GameFrameComponent, MultiplayerLobbyComponent, ReactiveFormsModule, LucideHeart],
  templateUrl: './formula-frenzy-page.component.html',
  styleUrl: './formula-frenzy-page.component.scss',
})
export class FormulaFrenzyPageComponent implements OnInit, OnDestroy {
  private readonly audio = inject(AudioSettingsService);
  private readonly router = inject(Router);
  @ViewChild('answerInput') private answerInput?: ElementRef<HTMLInputElement>;

  readonly problem = signal<FormulaProblem>(createFormulaProblemForLevel(1));
  readonly gameMode = signal<FormulaFrenzyMode>('progression');
  readonly runStarted = signal(false);
  readonly heartSlots = [1, 2, 3] as const;
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
  readonly answerRejected = signal(false);
  readonly answerRejectionCount = signal(0);
  readonly timeRemainingMs = signal(this.problem().deadlineMs);
  readonly answerControl = new FormControl('', { nonNullable: true });
  readonly averageSolveTime = computed(() => {
    if (this.totalCorrect() === 0) return '0.0s';
    return `${(this.totalSolveTimeMs() / this.totalCorrect() / 1000).toFixed(1)}s`;
  });
  readonly timeRemaining = computed(() => `${(this.timeRemainingMs() / 1000).toFixed(1)}s`);
  readonly multiplier = computed(() =>
    Math.min(3, 1 + Math.max(0, this.streak() - 1) * 0.1).toFixed(1),
  );

  private readonly totalSolveTimeMs = signal(0);
  private problemStartedAt = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private nextTickAtMs = 0;

  ngOnInit(): void {
    this.syncAnswerControl();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  @HostListener('document:keydown', ['$event'])
  preventBrowserBackspace(event: KeyboardEvent): void {
    preventBackspaceNavigation(event);
  }

  submitAnswer(event?: SubmitEvent): void {
    event?.preventDefault();
    if (this.gameOver() || this.practicePaused() || this.progressionPaused()) return;

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
      this.totalSolveTimeMs.update((total) => total + solveTimeMs);
      this.totalCorrect.update((total) => total + 1);
      this.score.update((score) => score + 1);
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
        ),
    );
    this.experience.set(nextExperience);
    this.level.set(progress.level);
    this.xp.set(progress.xp);
    this.xpRequired.set(progress.xpRequired);
    this.streak.set(nextStreak);
    this.bestStreak.update((best) => Math.max(best, nextStreak));
    if (nextStreak % 5 === 0) this.hearts.update((hearts) => Math.min(3, hearts + 1));
    this.highestLevel.update((highest) => Math.max(highest, progress.level));
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    if (this.gameMode() === 'progression') this.startProblemTimer();
    this.playSound('right-answer.wav');
    if (this.gameMode() === 'progression' && this.level() > previousLevel) {
      this.playSound('level-up.wav');
    }
  }

  restart(): void {
    this.score.set(0);
    this.experience.set(0);
    this.level.set(1);
    this.xp.set(0);
    this.xpRequired.set(FORMULA_LEVELS[0].xpRequired);
    this.streak.set(0);
    this.bestStreak.set(0);
    this.hearts.set(3);
    this.highestLevel.set(1);
    this.totalCorrect.set(0);
    this.totalSolveTimeMs.set(0);
    this.gameOver.set(false);
    this.runStarted.set(this.gameMode() !== 'progression');
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    this.clearTimers();
    this.timeRemainingMs.set(this.gameMode() === 'progression' ? this.problem().deadlineMs : 0);
    this.syncAnswerControl();
  }

  startRun(): void {
    if (this.gameMode() !== 'progression' || this.runStarted()) return;
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

  private lose(): void {
    this.gameOver.set(true);
    this.runStarted.set(false);
    this.clearTimers();
    this.syncAnswerControl();
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
    if (this.gameMode() !== 'progression') return;
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

  private playSound(file: string): void {
    this.audio.playOneShot(`/sounds/formula-frenzy/${file}`);
  }

  private nextProblem(): FormulaProblem {
    if (this.gameMode() === 'free-practice' && this.practiceOperations().length > 0) {
      return createFormulaPracticeProblem(this.practiceOperations());
    }
    return createFormulaProblem(this.experience());
  }

  private syncAnswerControl(): void {
    if (this.gameOver() || this.practicePaused() || this.progressionPaused()) {
      this.answerControl.disable({ emitEvent: false });
    } else {
      this.answerControl.enable({ emitEvent: false });
    }
  }

  private progressionPaused(): boolean {
    return this.gameMode() === 'progression' && !this.runStarted();
  }
}
