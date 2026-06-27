import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import { createFormulaProblem, FormulaProblem } from './game/problem-generator';

@Component({
  selector: 'app-formula-frenzy-page',
  imports: [GameFrameComponent, ReactiveFormsModule],
  templateUrl: './formula-frenzy-page.component.html',
  styleUrl: './formula-frenzy-page.component.scss',
})
export class FormulaFrenzyPageComponent implements OnInit, OnDestroy {
  readonly problem = signal<FormulaProblem>(createFormulaProblem(0));
  readonly score = signal(0);
  readonly gameOver = signal(false);
  readonly error = signal<string | null>(null);
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

  ngOnInit(): void {
    this.startProblemTimer();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  submitAnswer(event?: SubmitEvent): void {
    event?.preventDefault();
    if (this.gameOver()) return;

    const answer = Number(this.answerControl.value);
    if (Number.isNaN(answer)) {
      this.error.set('Enter a number.');
      return;
    }

    if (answer !== this.problem().answer) {
      this.error.set('Try again.');
      return;
    }

    this.totalSolveTimeMs.update((total) => total + (Date.now() - this.problemStartedAt));
    this.score.update((score) => score + 1);
    this.error.set(null);
    this.answerControl.setValue('');
    this.problem.set(createFormulaProblem(this.score()));
    this.startProblemTimer();
  }

  restart(): void {
    this.score.set(0);
    this.totalSolveTimeMs.set(0);
    this.gameOver.set(false);
    this.error.set(null);
    this.answerControl.setValue('');
    this.problem.set(createFormulaProblem(0));
    this.startProblemTimer();
  }

  private lose(): void {
    this.gameOver.set(true);
    this.clearTimers();
  }

  private startProblemTimer(): void {
    this.clearTimers();
    this.problemStartedAt = Date.now();
    this.timeRemainingMs.set(this.problem().deadlineMs);
    this.timeoutId = setTimeout(() => this.lose(), this.problem().deadlineMs);
    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - this.problemStartedAt;
      this.timeRemainingMs.set(Math.max(0, this.problem().deadlineMs - elapsed));
    }, 100);
  }

  private clearTimers(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.intervalId) clearInterval(this.intervalId);
    this.timeoutId = null;
    this.intervalId = null;
  }
}
