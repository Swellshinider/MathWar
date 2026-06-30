import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideBrickWall,
  LucideCircle,
  LucideCircleHelp,
  LucideMove,
  LucideSquare,
  LucideTarget,
  LucideTrash2,
  LucideTriangle,
} from '@lucide/angular';
import {
  CharacterState,
  createMatchState,
  MatchState,
  resolveShot,
  ShotResolvedEvent,
} from '@math-war/game-engine';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import { BoardComponent } from './board/board.component';
import { EquationControlsComponent } from './equation-controls/equation-controls.component';
import { AnimationService } from './game/animation.service';
import { EquationArtilleryAudioService } from './game/audio.service';
import { BoardCharacter } from './game/board-renderer.service';
import {
  chooseCpuMove,
  createCpuOpponentMemory,
  CpuOpponentMemory,
  recordCpuShotOutcome,
} from './game/cpu-opponent';
import { compileExpression, ExpressionError } from './game/expression';
import {
  buildFreePracticePreviewTrail,
  deleteNearestSandboxObject,
  placeSandboxTarget,
  placeSandboxWall,
  SandboxTool,
  SandboxWallSize,
} from './game/free-practice-sandbox';
import { shotAnimationDuration } from './game/shot-animation';
import { spawnRound } from './game/spawning';
import { advanceShot, createShot, ShotState } from './game/trajectory';
import { Bullet } from './models/bullet';
import { Player } from './models/player';
import { Point } from './models/point';
import { Target } from './models/target';
import { Wall } from './models/wall';
import { WallShape } from './models/wall';
import { WORLD_BOUNDS } from './models/world-bounds';
import { EquationHelpDialogComponent } from './equation-help-dialog/equation-help-dialog.component';
import {
  EquationHistoryComponent,
  EquationHistoryMessage,
} from './equation-history/equation-history.component';
import { mapEquationHistoryMessages } from './equation-history/equation-history-message';
import { MultiplayerLobbyComponent } from '../../shared/multiplayer/multiplayer-lobby.component';

type GameMode = 'target-practice' | 'free-practice' | 'single-player';

const HUMAN_USER_ID = 'human';
const CPU_USER_ID = 'cpu';
const CPU_THINK_DELAY_MS = 500;
const BULLET_RADIUS = 0.18;
const LOCAL_SHOT_STEP = 0.08;
const LOCAL_SHOT_MAX_FRAMES = 2000;

@Component({
  selector: 'app-equation-artillery-page',
  imports: [
    BoardComponent,
    EquationControlsComponent,
    EquationHelpDialogComponent,
    EquationHistoryComponent,
    GameFrameComponent,
    LucideBrickWall,
    LucideCircle,
    LucideCircleHelp,
    LucideMove,
    LucideSquare,
    LucideTarget,
    LucideTrash2,
    LucideTriangle,
    MultiplayerLobbyComponent,
  ],
  providers: [AnimationService],
  templateUrl: './equation-artillery-page.component.html',
  styleUrl: './equation-artillery-page.component.scss',
})
export class EquationArtilleryPageComponent implements OnDestroy {
  private readonly animation = inject(AnimationService);
  private readonly audio = inject(EquationArtilleryAudioService);
  private readonly router = inject(Router);
  @ViewChild('boardAnchor') private boardAnchor?: ElementRef<HTMLElement>;
  private readonly initialRound = spawnRound();
  private pendingCpuTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSinglePlayerState: MatchState | null = null;
  private commandSequence = 0;
  private wonRound = false;
  readonly gameMode = signal<GameMode>('target-practice');
  readonly cpuDifficulty = signal(5);
  readonly singlePlayerState = signal<MatchState | null>(null);
  readonly player = signal<Player>(this.initialRound.player);
  readonly freePracticePlayer = signal<Player>(this.initialRound.player);
  readonly freePracticeTargets = signal<readonly Target[]>([]);
  readonly freePracticeWalls = signal<readonly Wall[]>([]);
  readonly selectedSandboxTool = signal<SandboxTool>('move');
  readonly selectedWallShape = signal<WallShape>('vertical');
  readonly selectedWallSize = signal<SandboxWallSize>('small');
  readonly targets = signal<readonly Target[]>(this.initialRound.targets);
  readonly walls = signal<readonly Wall[]>(this.initialRound.walls);
  readonly bullet = signal<Bullet | null>(null);
  readonly trail = signal<readonly Point[]>([]);
  readonly active = signal(false);
  readonly activeShot = signal(false);
  readonly cpuThinking = signal(false);
  readonly activeShotCharacterId = signal<number | null>(null);
  readonly activeShotEquation = signal<string | null>(null);
  readonly lastShotLabel = signal<{ characterId: number; equation: string } | null>(null);
  readonly cpuOpponentMemory = signal<CpuOpponentMemory | null>(null);
  readonly error = signal<string | null>(null);
  readonly equation = signal('0.35x');
  private readonly targetPracticeHistory = signal<readonly EquationHistoryMessage[]>([]);
  readonly boardCharacters = computed<readonly BoardCharacter[]>(() => {
    const state = this.singlePlayerState();
    if (!state || this.gameMode() !== 'single-player') return [];
    const activeCharacterId = this.activeShot()
      ? this.activeShotCharacterId()
      : state.turnCharacterId;
    const activeShotEquation = this.activeShotEquation();
    const lastShotLabel = this.lastShotLabel();
    return this.charactersForState(state)
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
  readonly targetsForBoard = computed<readonly Target[]>(() => {
    if (this.gameMode() === 'target-practice') return this.targets();
    if (this.gameMode() === 'free-practice') return this.freePracticeTargets();
    return [];
  });
  readonly wallsForBoard = computed<readonly Wall[]>(() => {
    if (this.gameMode() === 'single-player') return this.singlePlayerState()?.walls ?? [];
    if (this.gameMode() === 'free-practice') return this.freePracticeWalls();
    return this.walls();
  });
  readonly movementEnabled = computed(
    () =>
      this.gameMode() === 'free-practice' &&
      this.selectedSandboxTool() === 'move' &&
      !this.active() &&
      !this.activeShot(),
  );
  readonly pointSelectionEnabled = computed(
    () => this.gameMode() === 'free-practice' && !this.active() && !this.activeShot(),
  );
  readonly previewTrail = computed<readonly Point[]>(() => {
    if (this.gameMode() !== 'free-practice' || this.active() || this.activeShot()) return [];
    const shooter = this.freePracticePlayer();
    return buildFreePracticePreviewTrail({
      equation: this.equation(),
      player: shooter,
      direction: this.freePracticeDirection(shooter),
      targets: this.freePracticeTargets(),
      walls: this.freePracticeWalls(),
    });
  });
  readonly controlsActive = computed(
    () =>
      this.active() ||
      this.activeShot() ||
      this.cpuThinking() ||
      (this.gameMode() === 'single-player' && !this.isHumanTurn()),
  );
  readonly cpuDifficultyLocked = computed(() => {
    const state = this.singlePlayerState();
    return this.gameMode() === 'single-player' && state?.status === 'active';
  });
  readonly equationHistory = computed<readonly EquationHistoryMessage[]>(() => {
    const state = this.singlePlayerState();
    if (this.gameMode() !== 'single-player' || !state) return this.targetPracticeHistory();
    return mapEquationHistoryMessages({
      entries: state.equationHistory,
      players: state.players,
      characters: this.charactersForState(state),
      currentUserId: HUMAN_USER_ID,
      fallbackIdPrefix: 'local-cpu-history',
      fallbackSenderName: 'CPU',
    });
  });
  readonly roundComplete = computed(() => {
    const state = this.singlePlayerState();
    if (this.gameMode() === 'single-player') return state?.status === 'ended';
    if (this.gameMode() === 'free-practice') return false;
    return this.targets().length === 0;
  });
  readonly status = computed(() => {
    const state = this.singlePlayerState();
    if (this.gameMode() === 'single-player') {
      if (!state) return 'Choose a CPU difficulty and start a single player match.';
      if (this.activeShot()) return 'Shot in flight.';
      if (this.cpuThinking()) return 'CPU is aiming.';
      if (state.status === 'ended') {
        return state.winnerUserId === HUMAN_USER_ID ? 'You won.' : 'You lost.';
      }
      return this.isHumanTurn() ? 'Your turn.' : 'CPU is aiming.';
    }
    if (this.gameMode() === 'free-practice') {
      if (this.active()) return 'Shot in flight.';
      return 'Click the board to move or use sandbox tools. Fire any equation to test its path.';
    }
    if (this.roundComplete()) return 'All targets destroyed.';
    if (this.active())
      return `${this.targets().length} target${this.targets().length === 1 ? '' : 's'} remaining. Shot in flight.`;
    return `${this.targets().length} targets remaining. Ready to fire.`;
  });

  fire(equation: string): void {
    if (this.gameMode() === 'single-player') {
      this.fireSinglePlayer(equation);
      return;
    }
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
    this.targetPracticeHistory.update((history) => [
      ...history,
      {
        id: `local-${history.length}`,
        equation,
        senderName: 'You',
        soldierName: null,
        mine: true,
      },
    ]);
    const practiceMode = this.gameMode() === 'free-practice';
    const shooter = practiceMode ? this.freePracticePlayer() : this.player();
    const direction = practiceMode ? this.freePracticeDirection(shooter) : 1;
    let shot = createShot(
      shooter,
      practiceMode ? this.freePracticeTargets() : this.targets(),
      practiceMode ? this.freePracticeWalls() : this.walls(),
    );
    const shotFrames: ShotState[] = [shot];
    for (let index = 0; index < LOCAL_SHOT_MAX_FRAMES && shot.active; index += 1) {
      shot = advanceShot(shot, shooter, expression, WORLD_BOUNDS, LOCAL_SHOT_STEP, direction);
      shotFrames.push(shot);
    }
    this.audio.playFire();
    this.audio.startEquationSound(shotFrames[0].bullet.position);
    this.active.set(true);
    this.scrollBoardIntoView();
    this.bullet.set(shotFrames[0].bullet);
    this.trail.set(shotFrames[0].trail);
    let renderedIndex = 0;
    let previousTargetCount = shotFrames[0].targets.length;
    this.animation.startTimeline(
      (progress) => {
        const frameIndex = Math.min(
          Math.floor(progress * (shotFrames.length - 1)),
          shotFrames.length - 1,
        );
        if (frameIndex === renderedIndex && progress < 1) return true;
        renderedIndex = frameIndex;
        shot = shotFrames[frameIndex];
        this.bullet.set(shot.bullet);
        this.trail.set(shot.trail);
        if (practiceMode) {
          this.freePracticeTargets.set(shot.targets);
          this.freePracticeWalls.set(shot.walls);
        } else {
          this.targets.set(shot.targets);
          this.walls.set(shot.walls);
        }
        this.error.set(shot.error);
        this.active.set(shot.active);
        this.audio.updateEquationSound(shot.bullet.position);
        if (shot.targets.length < previousTargetCount) this.audio.playEnemyHit();
        previousTargetCount = shot.targets.length;
        if (!practiceMode && shot.targets.length === 0 && !this.wonRound) {
          this.wonRound = true;
          this.audio.playWin();
        }
        if (!shot.active || progress >= 1) {
          this.audio.stopEquationSound();
          if (shot.impact === 'wall') this.audio.playWallHit();
        }
        return shot.active && progress < 1;
      },
      shotAnimationDuration(shotFrames.map((frame) => frame.bullet.position)),
    );
  }

  newRound(): void {
    if (this.gameMode() === 'single-player') {
      this.startCpuMatch();
      return;
    }
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

  selectTargetPractice(): void {
    this.cancelCpuTurn();
    this.animation.cancel();
    this.audio.stopEquationSound();
    this.gameMode.set('target-practice');
    this.singlePlayerState.set(null);
    this.cpuOpponentMemory.set(null);
    this.pendingSinglePlayerState = null;
    this.activeShot.set(false);
    this.cpuThinking.set(false);
    this.bullet.set(null);
    this.trail.set([]);
    this.error.set(null);
  }

  selectFreePractice(): void {
    this.cancelCpuTurn();
    this.animation.cancel();
    this.audio.stopEquationSound();
    this.gameMode.set('free-practice');
    this.singlePlayerState.set(null);
    this.cpuOpponentMemory.set(null);
    this.pendingSinglePlayerState = null;
    this.active.set(false);
    this.activeShot.set(false);
    this.cpuThinking.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
    this.lastShotLabel.set(null);
    this.bullet.set(null);
    this.trail.set([]);
    this.error.set(null);
  }

  selectSinglePlayerMode(): void {
    this.cancelCpuTurn();
    this.animation.cancel();
    this.audio.stopEquationSound();
    this.gameMode.set('single-player');
    this.singlePlayerState.set(null);
    this.cpuOpponentMemory.set(null);
    this.pendingSinglePlayerState = null;
    this.active.set(false);
    this.activeShot.set(false);
    this.cpuThinking.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
    this.lastShotLabel.set(null);
    this.bullet.set(null);
    this.trail.set([]);
    this.error.set(null);
  }

  startCpuMatch(): void {
    this.cancelCpuTurn();
    this.animation.cancel();
    this.audio.stopEquationSound();
    const seed = `local-cpu-${Date.now()}-${Math.random()}`;
    const state = createMatchState(
      `local-cpu-${Date.now()}`,
      'LOCALCPU',
      seed,
      { userId: HUMAN_USER_ID, displayName: 'You' },
      { userId: CPU_USER_ID, displayName: 'CPU' },
    );
    this.gameMode.set('single-player');
    this.singlePlayerState.set(state);
    this.cpuOpponentMemory.set(createCpuOpponentMemory(state));
    this.pendingSinglePlayerState = null;
    this.active.set(false);
    this.activeShot.set(false);
    this.cpuThinking.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
    this.lastShotLabel.set(null);
    this.bullet.set(null);
    this.trail.set([]);
    this.error.set(null);
    this.wonRound = false;
  }

  playerForBoard(): Player {
    if (this.gameMode() === 'free-practice') return this.freePracticePlayer();
    if (this.gameMode() !== 'single-player') return this.player();
    const human = this.singlePlayerState()?.players.find(
      (player) => player.userId === HUMAN_USER_ID,
    );
    return human ?? this.player();
  }

  moveFreePracticePlayer(position: Point): void {
    if (this.gameMode() !== 'free-practice' || this.active() || this.activeShot()) return;
    this.freePracticePlayer.update((player) => ({ ...player, position }));
  }

  handleFreePracticeBoardPoint(position: Point): void {
    if (this.gameMode() !== 'free-practice' || this.active() || this.activeShot()) return;
    const tool = this.selectedSandboxTool();
    if (tool === 'move') {
      this.moveFreePracticePlayer(position);
      return;
    }
    if (tool === 'enemy') {
      const target = placeSandboxTarget({
        point: position,
        player: this.freePracticePlayer(),
        targets: this.freePracticeTargets(),
        walls: this.freePracticeWalls(),
      });
      if (target) this.freePracticeTargets.update((targets) => [...targets, target]);
      return;
    }
    if (tool === 'wall') {
      const wall = placeSandboxWall({
        point: position,
        shape: this.selectedWallShape(),
        size: this.selectedWallSize(),
        player: this.freePracticePlayer(),
        targets: this.freePracticeTargets(),
        walls: this.freePracticeWalls(),
      });
      if (wall) this.freePracticeWalls.update((walls) => [...walls, wall]);
      return;
    }
    const result = deleteNearestSandboxObject({
      point: position,
      targets: this.freePracticeTargets(),
      walls: this.freePracticeWalls(),
    });
    if (result.deleted) {
      this.freePracticeTargets.set(result.targets);
      this.freePracticeWalls.set(result.walls);
    }
  }

  enterMultiplayer(): void {
    void this.router.navigate(['/games/equation-artillery/multiplayer']);
  }

  ngOnDestroy(): void {
    this.cancelCpuTurn();
    this.animation.cancel();
    this.audio.stopEquationSound();
  }

  private fireSinglePlayer(equation: string): void {
    const state = this.singlePlayerState();
    if (!state || !this.isHumanTurn() || this.activeShot() || this.cpuThinking()) return;
    this.error.set(null);
    const event = resolveShot(state, HUMAN_USER_ID, this.nextCommandId('human'), equation);
    if (event.error) {
      this.error.set(event.error);
      return;
    }
    this.audio.playFire();
    this.scrollBoardIntoView();
    this.animateSinglePlayerShot(event);
  }

  private fireCpu(): void {
    const state = this.singlePlayerState();
    if (!state || state.status !== 'active' || state.turnUserId !== CPU_USER_ID) {
      this.cpuThinking.set(false);
      return;
    }
    const memory = this.cpuOpponentMemory() ?? createCpuOpponentMemory(state);
    const decision = chooseCpuMove(state, this.cpuDifficulty(), memory);
    this.cpuOpponentMemory.set(decision.memory);
    const equation = decision.equation;
    const event = resolveShot(state, CPU_USER_ID, this.nextCommandId('cpu'), equation);
    this.cpuOpponentMemory.update((currentMemory) =>
      recordCpuShotOutcome(currentMemory ?? decision.memory, {
        shooterCharacterId: event.shooterCharacterId,
        equation: event.equation,
        impact: event.impact,
      }),
    );
    this.cpuThinking.set(false);
    if (event.error) {
      this.error.set(event.error);
      this.singlePlayerState.set(event.state);
      return;
    }
    this.audio.playFire();
    this.animateSinglePlayerShot(event);
  }

  private animateSinglePlayerShot(event: ShotResolvedEvent): void {
    const firstPoint = event.trail[0];
    if (!firstPoint) {
      this.finishSinglePlayerShot(event);
      return;
    }
    this.pendingSinglePlayerState = event.state;
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
    this.bullet.set({ position: firstPoint, radius: BULLET_RADIUS });
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
        this.finishSinglePlayerShot(event);
        return false;
      }
      this.trail.set(event.trail.slice(0, index + 1));
      this.bullet.set({ position: point, radius: BULLET_RADIUS });
      this.audio.updateEquationSound(point);
      if (progress >= 1) {
        this.finishSinglePlayerShot(event);
        return false;
      }
      return true;
    }, shotAnimationDuration(event.trail));
  }

  private finishSinglePlayerShot(event: ShotResolvedEvent): void {
    const nextState = this.pendingSinglePlayerState ?? event.state;
    this.pendingSinglePlayerState = null;
    this.singlePlayerState.set(nextState);
    this.bullet.set(null);
    this.trail.set([]);
    this.activeShot.set(false);
    this.activeShotCharacterId.set(null);
    this.activeShotEquation.set(null);
    this.audio.stopEquationSound();
    if (event.impact === 'wall') this.audio.playWallHit();
    if (event.impact === 'opponent') this.audio.playEnemyHit();
    if (nextState.status === 'ended') {
      if (nextState.winnerUserId === HUMAN_USER_ID) this.audio.playWin();
      else this.audio.playLose();
      return;
    }
    if (nextState.turnUserId === CPU_USER_ID) this.scheduleCpuTurn();
  }

  private scheduleCpuTurn(): void {
    this.cancelCpuTurn();
    this.cpuThinking.set(true);
    this.pendingCpuTimer = setTimeout(() => {
      this.pendingCpuTimer = null;
      this.fireCpu();
    }, CPU_THINK_DELAY_MS);
  }

  private cancelCpuTurn(): void {
    if (!this.pendingCpuTimer) return;
    clearTimeout(this.pendingCpuTimer);
    this.pendingCpuTimer = null;
  }

  private isHumanTurn(): boolean {
    const state = this.singlePlayerState();
    return state?.status === 'active' && state.turnUserId === HUMAN_USER_ID;
  }

  private freePracticeDirection(player: Player): 1 | -1 {
    return player.position.x >= 0 ? -1 : 1;
  }

  private nextCommandId(prefix: string): string {
    this.commandSequence += 1;
    return `${prefix}-${this.commandSequence}`;
  }

  private scrollBoardIntoView(): void {
    this.boardAnchor?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  private charactersForState(state: MatchState): readonly CharacterState[] {
    return state.players.flatMap((player) =>
      state.characters
        .filter((character) => character.ownerUserId === player.userId)
        .sort((first, second) => first.id - second.id)
        .map((character, index) => ({
          ...character,
          displayName: `${player.displayName}-${index + 1}`,
        })),
    );
  }
}
