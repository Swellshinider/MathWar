import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { LucideCircleHelp, LucideVolume2 } from '@lucide/angular';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import { BoardComponent } from './board/board.component';
import { EquationControlsComponent } from './equation-controls/equation-controls.component';
import { AnimationService } from './game/animation.service';
import { EquationArtilleryAudioService } from './game/audio.service';
import { compileExpression, ExpressionError } from './game/expression';
import { spawnRound } from './game/spawning';
import { advanceShot, createShot } from './game/trajectory';
import { Bullet } from './models/bullet';
import { Player } from './models/player';
import { Point } from './models/point';
import { Target } from './models/target';
import { Wall } from './models/wall';
import { WORLD_BOUNDS } from './models/world-bounds';
import { EquationHelpDialogComponent } from './equation-help-dialog/equation-help-dialog.component';
import {
  EquationHistoryComponent,
  EquationHistoryMessage,
} from './equation-history/equation-history.component';
import { SoundSettingsDialogComponent } from './sound-settings-dialog/sound-settings-dialog.component';

@Component({
  selector: 'app-equation-artillery-page',
  imports: [
    BoardComponent,
    EquationControlsComponent,
    EquationHelpDialogComponent,
    EquationHistoryComponent,
    GameFrameComponent,
    LucideCircleHelp,
    LucideVolume2,
    SoundSettingsDialogComponent,
  ],
  providers: [AnimationService],
  templateUrl: './equation-artillery-page.component.html',
  styleUrl: './equation-artillery-page.component.scss',
})
export class EquationArtilleryPageComponent implements OnDestroy {
  private readonly animation = inject(AnimationService);
  private readonly audio = inject(EquationArtilleryAudioService);
  private readonly initialRound = spawnRound();
  private wonRound = false;
  readonly player = signal<Player>(this.initialRound.player);
  readonly targets = signal<readonly Target[]>(this.initialRound.targets);
  readonly walls = signal<readonly Wall[]>(this.initialRound.walls);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  readonly active = signal(false);
  readonly error = signal<string | null>(null);
  readonly equation = signal('0.35x');
  readonly equationHistory = signal<readonly EquationHistoryMessage[]>([]);
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
    this.equationHistory.update((history) => [
      ...history,
      {
        id: `local-${history.length}`,
        equation,
        senderName: 'You',
        soldierName: null,
        mine: true,
      },
    ]);
    let shot = createShot(this.player(), this.targets(), this.walls());
    this.audio.playFire();
    this.audio.startEquationSound(shot.bullet.position);
    this.active.set(true);
    this.bullet.set(shot.bullet);
    this.trail.set(shot.trail);
    this.animation.start((step) => {
      const previousTargetCount = shot.targets.length;
      shot = advanceShot(shot, this.player(), expression, WORLD_BOUNDS, step);
      this.bullet.set(shot.bullet);
      this.trail.set(shot.trail);
      this.targets.set(shot.targets);
      this.walls.set(shot.walls);
      this.error.set(shot.error);
      this.active.set(shot.active);
      this.audio.updateEquationSound(shot.bullet.position);
      if (shot.targets.length < previousTargetCount) this.audio.playEnemyHit();
      if (shot.targets.length === 0 && !this.wonRound) {
        this.wonRound = true;
        this.audio.playWin();
      }
      if (!shot.active) {
        this.audio.stopEquationSound();
        if (shot.impact === 'wall') this.audio.playWallHit();
      }
      return shot.active;
    });
  }

  newRound(): void {
    this.animation.cancel();
    this.audio.stopEquationSound();
    const round = spawnRound();
    this.player.set(round.player);
    this.targets.set(round.targets);
    this.walls.set(round.walls);
    this.bullet.set(null);
    this.trail.set([]);
    this.active.set(false);
    this.error.set(null);
    this.wonRound = false;
  }

  ngOnDestroy(): void {
    this.animation.cancel();
    this.audio.stopEquationSound();
  }
}
