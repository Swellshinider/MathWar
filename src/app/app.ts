import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { BoardComponent } from './board/board.component';
import { EquationControlsComponent } from './equation-controls/equation-controls.component';
import { AnimationService } from './game/animation.service';
import { compileExpression, ExpressionError } from './game/expression';
import { spawnRound } from './game/spawning';
import { advanceShot, createShot } from './game/trajectory';
import { Bullet } from './models/bullet';
import { Player } from './models/player';
import { Point } from './models/point';
import { Target } from './models/target';
import { WORLD_BOUNDS } from './models/world-bounds';

@Component({
  selector: 'app-root',
  imports: [BoardComponent, EquationControlsComponent],
  providers: [AnimationService],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly animation = inject(AnimationService);
  private readonly initialRound = spawnRound();
  readonly player = signal<Player>(this.initialRound.player);
  readonly targets = signal<readonly Target[]>(this.initialRound.targets);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  readonly active = signal(false);
  readonly error = signal<string | null>(null);
  readonly roundComplete = computed(() => this.targets().length === 0);
  readonly status = computed(() => {
    if (this.roundComplete()) return 'All targets destroyed.';
    if (this.active())
      return `${this.targets().length} target${this.targets().length === 1 ? '' : 's'} remaining. Shot in flight.`;
    return `${this.targets().length} targets remaining. Ready to fire.`;
  });

  fire(equation: string): void {
    if (this.active() || this.roundComplete()) return;
    this.error.set(null);
    let expression;
    try {
      expression = compileExpression(equation);
    } catch (error) {
      this.error.set(
        error instanceof ExpressionError ? error.message : 'The equation could not be compiled.',
      );
      return;
    }
    let shot = createShot(this.player(), this.targets());
    this.active.set(true);
    this.bullet.set(shot.bullet);
    this.trail.set(shot.trail);
    this.animation.start((step) => {
      shot = advanceShot(shot, this.player(), expression, WORLD_BOUNDS, step);
      this.bullet.set(shot.bullet);
      this.trail.set(shot.trail);
      this.targets.set(shot.targets);
      this.error.set(shot.error);
      this.active.set(shot.active);
      return shot.active;
    });
  }

  newRound(): void {
    this.animation.cancel();
    const round = spawnRound();
    this.player.set(round.player);
    this.targets.set(round.targets);
    this.bullet.set(null);
    this.trail.set([]);
    this.active.set(false);
    this.error.set(null);
  }

  ngOnDestroy(): void {
    this.animation.cancel();
  }
}
