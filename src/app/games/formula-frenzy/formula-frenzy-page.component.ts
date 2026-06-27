import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import {
  FORMULA_OPERATION_OPTIONS,
  createFormulaPracticeProblem,
  createFormulaProblem,
  FormulaOperation,
  FormulaProblem,
} from './game/problem-generator';

type FormulaFrenzyMode = 'sprint' | 'free-practice';

@Component({
  selector: 'app-formula-frenzy-page',
  imports: [GameFrameComponent, ReactiveFormsModule],
  templateUrl: './formula-frenzy-page.component.html',
  styleUrl: './formula-frenzy-page.component.scss',
})
export class FormulaFrenzyPageComponent implements OnInit, OnDestroy {
  private readonly audio = inject(AudioSettingsService);

  readonly problem = signal<FormulaProblem>(createFormulaProblem(0));
  readonly gameMode = signal<FormulaFrenzyMode>('sprint');
  readonly operationOptions = FORMULA_OPERATION_OPTIONS;
  readonly practiceOperations = signal<readonly FormulaOperation[]>(
    FORMULA_OPERATION_OPTIONS.map((option) => option.operation),
  );
  readonly practicePaused = computed(
    () => this.gameMode() === 'free-practice' && this.practiceOperations().length === 0,
  );
  readonly score = signal(0);
  readonly gameOver = signal(false);
  readonly answerRejected = signal(false);
  readonly answerRejectionCount = signal(0);
  readonly timeRemainingMs = signal(this.problem().deadlineMs);
  readonly answerControl = new FormControl('', { nonNullable: true });
  readonly averageSolveTime = computed(() => {
    if (this.score() === 0) return '0.0s';
    return `${(this.totalSolveTimeMs() / this.score() / 1000).toFixed(1)}s`;
  });
  readonly timeRemaining = computed(() => `${(this.timeRemainingMs() / 1000).toFixed(1)}s`);

  private readonly totalSolveTimeMs = signal(0);
  private problemStartedAt = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private nextTickAtMs = 0;

  ngOnInit(): void {
    this.startProblemTimer();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  submitAnswer(event?: SubmitEvent): void {
    event?.preventDefault();
    if (this.gameOver() || this.practicePaused()) return;

    const answer = Number(this.answerControl.value);
    if (Number.isNaN(answer)) {
      this.rejectAnswer();
      return;
    }

    if (answer !== this.problem().answer) {
      this.rejectAnswer();
      return;
    }

    const previousLevel = this.problem().level;
    this.totalSolveTimeMs.update((total) => total + (Date.now() - this.problemStartedAt));
    this.score.update((score) => score + 1);
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    if (this.gameMode() === 'sprint') this.startProblemTimer();
    this.playSound('right-answer.wav');
    if (this.gameMode() === 'sprint' && this.problem().level > previousLevel) {
      this.playSound('level-up.wav');
    }
  }

  restart(): void {
    this.score.set(0);
    this.totalSolveTimeMs.set(0);
    this.gameOver.set(false);
    this.answerRejected.set(false);
    this.answerRejectionCount.set(0);
    this.answerControl.setValue('');
    this.problem.set(this.nextProblem());
    if (this.gameMode() === 'sprint') {
      this.startProblemTimer();
    } else {
      this.clearTimers();
      this.timeRemainingMs.set(0);
    }
    this.syncAnswerControl();
  }

  selectSprint(): void {
    this.gameMode.set('sprint');
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

  private lose(): void {
    this.gameOver.set(true);
    this.clearTimers();
    this.syncAnswerControl();
    this.playSound('game-over.wav');
  }

  private rejectAnswer(): void {
    this.answerRejected.set(true);
    this.answerRejectionCount.update((count) => count + 1);
    this.playSound('wrong-answer.wav');
  }

  private startProblemTimer(): void {
    this.clearTimers();
    this.problemStartedAt = Date.now();
    this.timeRemainingMs.set(this.problem().deadlineMs);
    this.nextTickAtMs = this.computeNextTick(this.problem().deadlineMs);
    this.timeoutId = setTimeout(() => this.lose(), this.problem().deadlineMs);
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
    return createFormulaProblem(this.score());
  }

  private syncAnswerControl(): void {
    if (this.gameOver() || this.practicePaused()) {
      this.answerControl.disable({ emitEvent: false });
    } else {
      this.answerControl.enable({ emitEvent: false });
    }
  }
}
