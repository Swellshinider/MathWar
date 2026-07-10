import { TestBed } from '@angular/core/testing';
import { AccountAuthService } from '../../account/account-auth.service';
import { AccountProgressService } from '../../account/account-progress.service';
import { ToastService } from '../../shared/toast/toast.service';
import { EquationArtilleryPageComponent } from './equation-artillery-page.component';
import { AnimationService } from './game/animation.service';
import { EquationArtilleryAudioService } from './game/audio.service';

describe('EquationArtilleryPageComponent', () => {
  let advanceShot: ((step: number) => boolean) | undefined;
  let renderTimeline: ((progress: number) => boolean) | undefined;
  const animation = {
    start: vi.fn((advance: (step: number) => boolean) => {
      advanceShot = advance;
    }),
    startTimeline: vi.fn((render: (progress: number) => boolean, _duration?: number) => {
      renderTimeline = render;
      advanceShot = () => render(1);
    }),
    cancel: vi.fn(),
  };
  const audio = {
    muted: vi.fn(() => false),
    volume: vi.fn(() => 1),
    playFire: vi.fn(),
    playWallHit: vi.fn(),
    playEnemyHit: vi.fn(),
    playWin: vi.fn(),
    playLose: vi.fn(),
    startEquationSound: vi.fn(),
    updateEquationSound: vi.fn(),
    stopEquationSound: vi.fn(),
    resume: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
  };
  const account = {
    token: vi.fn(() => null),
    user: vi.fn((): { id: string; displayName: string } | null => null),
  };
  const progress = {
    createEquationArtilleryCpuWinProof: vi.fn(),
    saveEquationArtilleryCpuWin: vi.fn(),
  };
  const toast = {
    show: vi.fn(),
  };
  const scrollIntoView = vi.fn();

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    account.token.mockReturnValue(null);
    account.user.mockReturnValue(null);
    progress.createEquationArtilleryCpuWinProof.mockResolvedValue({
      completionToken: 'completion-token',
    });
    progress.saveEquationArtilleryCpuWin.mockResolvedValue({
      stats: [],
      recentRuns: [],
      achievements: [],
      newlyUnlocked: [],
    });
    advanceShot = undefined;
    renderTimeline = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    TestBed.overrideComponent(EquationArtilleryPageComponent, {
      set: {
        providers: [{ provide: AnimationService, useValue: animation }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [EquationArtilleryPageComponent],
      providers: [
        { provide: AccountAuthService, useValue: account },
        { provide: AccountProgressService, useValue: progress },
        { provide: EquationArtilleryAudioService, useValue: audio },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('records only equations that successfully start a shot', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.fire('sin(x)');
    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['sin(x)']);
    expect(component.equationHistory()[0]).toMatchObject({
      senderName: 'You',
      soldierName: null,
      mine: true,
    });

    component.active.set(false);
    component.fire('x+(');
    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['sin(x)']);
    expect(component.error()).not.toBeNull();
  });

  it('orders mobile play content as board, controls, then history', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();
    const playLayout = fixture.nativeElement.querySelector('.play-layout') as HTMLElement;

    expect(Array.from(playLayout.children).map((child) => child.tagName.toLowerCase())).toEqual([
      'div',
      'div',
      'app-equation-history',
    ]);
  });

  it('scrolls to the board only after a valid local shot starts', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.fire('x+(');
    expect(scrollIntoView).not.toHaveBeenCalled();

    component.fire('0');

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('keeps only help controls on the board', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();

    const introActions = fixture.nativeElement.querySelector('.intro-actions');
    const board = fixture.nativeElement.querySelector('app-board');

    expect(introActions.textContent).not.toContain('Sound');
    expect(introActions.textContent).not.toContain('Help');
    expect(board.querySelector('[aria-label="Open sound settings"]')).toBeNull();
    expect(board.querySelector('[aria-label="Open equation help"]')).not.toBeNull();
  });

  it('retains history across new rounds', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.fire('x^2');
    component.newRound();

    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['x^2']);
    expect(component.active()).toBe(false);
    expect(audio.stopEquationSound).toHaveBeenCalled();
  });

  it('plays fire and starts generated audio for a valid shot', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.fire('0');

    expect(audio.playFire).toHaveBeenCalledOnce();
    expect(audio.startEquationSound).toHaveBeenCalledWith(component.playerForBoard().position);
  });

  it('shows CPU setup by default without starting a match', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.gameMode()).toBe('single-player');
    expect(component.singlePlayerState()).toBeNull();
    expect(fixture.nativeElement.querySelector('.difficulty-control')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Single Player');
    expect(fixture.nativeElement.textContent).toContain('Start CPU vs.');

    const startButton = fixture.nativeElement.querySelector(
      '.difficulty-control .btn',
    ) as HTMLButtonElement;
    startButton.click();
    fixture.detectChanges();

    expect(component.singlePlayerState()).not.toBeNull();
    expect(component.status()).toBe('Your turn.');
    expect(fixture.nativeElement.querySelector('app-game-frame article').classList).toContain(
      'game-frame--focused',
    );
  });

  it('orders offline modes as CPU vs. then Free Practice without the removed mode', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();

    const modeTabs = Array.from(
      fixture.nativeElement.querySelectorAll('.mode-tab'),
    ) as HTMLButtonElement[];

    expect(modeTabs.map((button) => button.textContent?.trim())).toEqual([
      'CPU vs.',
      'Free Practice',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Target' + ' Practice');
  });

  it('shows a selectable free practice mode without targets, walls, or CPU setup', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const modeTabs = Array.from(
      fixture.nativeElement.querySelectorAll('.mode-tab'),
    ) as HTMLButtonElement[];
    const freePracticeTab = modeTabs.find((button) =>
      button.textContent?.includes('Free Practice'),
    )!;
    freePracticeTab.click();
    fixture.detectChanges();

    expect(component.gameMode()).toBe('free-practice');
    expect(component.targetsForBoard()).toEqual([]);
    expect(component.wallsForBoard()).toEqual([]);
    expect(component.boardCharacters()).toEqual([]);
    expect(component.roundComplete()).toBe(false);
    expect(fixture.nativeElement.querySelector('.difficulty-control')).toBeNull();
    expect(component.status()).toContain('Click the board to move');
  });

  it('shows sandbox tools and hides the separate function preview in free practice', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.selectFreePractice();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sandbox-tools')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-equation-controls app-function-preview'),
    ).toBeNull();

    component.selectSinglePlayerMode();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sandbox-tools')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-equation-controls app-function-preview'),
    ).not.toBeNull();
  });

  it('fires equations in free practice without needing targets', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.fire('0');

    expect(audio.playFire).toHaveBeenCalledOnce();
    expect(audio.startEquationSound).toHaveBeenCalledWith(component.playerForBoard().position);
    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['0']);
    expect(component.roundComplete()).toBe(false);
  });

  it('fires free practice shots leftward when the player is on the right side', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();
    component.moveFreePracticePlayer({ x: 4, y: 1 });

    component.fire('0');
    renderTimeline?.(1);

    expect(component.trail().at(-1)?.x).toBeLessThan(4);
  });

  it('moves the free practice player from board clicks', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.moveFreePracticePlayer({ x: 4, y: -2 });

    expect(component.playerForBoard().position).toEqual({ x: 4, y: -2 });
  });

  it('routes free practice board clicks through Move, Enemy, Wall, and Delete tools', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.handleFreePracticeBoardPoint({ x: 1, y: 1 });
    expect(component.playerForBoard().position).toEqual({ x: 1, y: 1 });

    component.selectedSandboxTool.set('enemy');
    component.handleFreePracticeBoardPoint({ x: 5, y: 1 });
    expect(component.freePracticeTargets()).toEqual([
      { id: 1, center: { x: 5, y: 1 }, width: 1, height: 1 },
    ]);

    component.selectedSandboxTool.set('wall');
    component.selectedWallShape.set('square');
    component.selectedWallSize.set('small');
    component.handleFreePracticeBoardPoint({ x: 7, y: 1 });
    expect(component.freePracticeWalls()).toHaveLength(1);
    expect(component.freePracticeWalls()[0].shape).toBe('square');

    component.selectedSandboxTool.set('delete');
    component.handleFreePracticeBoardPoint({ x: 5, y: 1 });
    expect(component.freePracticeTargets()).toEqual([]);
    expect(component.freePracticeWalls()).toHaveLength(1);
  });

  it('rejects invalid free practice enemy and wall placements', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();

    component.selectedSandboxTool.set('enemy');
    component.handleFreePracticeBoardPoint(component.freePracticePlayer().position);
    expect(component.freePracticeTargets()).toEqual([]);

    component.handleFreePracticeBoardPoint({ x: 4, y: 0 });
    component.selectedSandboxTool.set('wall');
    component.selectedWallShape.set('circle');
    component.selectedWallSize.set('large');
    component.handleFreePracticeBoardPoint({ x: 16, y: 10 });
    component.handleFreePracticeBoardPoint({ x: 4, y: 0 });

    expect(component.freePracticeTargets()).toHaveLength(1);
    expect(component.freePracticeWalls()).toEqual([]);
  });

  it('passes a live free practice preview trail to the board without mutating objects', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();
    component.freePracticePlayer.set({ position: { x: -2, y: 0 }, radius: 0.32 });
    component.selectedSandboxTool.set('enemy');
    component.handleFreePracticeBoardPoint({ x: -1, y: 0 });
    const targets = component.freePracticeTargets();

    component.equation.set('0');
    fixture.detectChanges();

    expect(component.previewTrail().length).toBeGreaterThan(1);
    expect(component.freePracticeTargets()).toBe(targets);
    expect(fixture.nativeElement.querySelector('app-board')).not.toBeNull();
  });

  it('free practice shots collide with manually placed enemies and walls', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.selectFreePractice();
    component.freePracticePlayer.set({ position: { x: -2, y: 0 }, radius: 0.32 });
    component.selectedSandboxTool.set('enemy');
    component.handleFreePracticeBoardPoint({ x: -1, y: 0 });
    component.selectedSandboxTool.set('wall');
    component.selectedWallShape.set('vertical');
    component.selectedWallSize.set('small');
    component.handleFreePracticeBoardPoint({ x: 2, y: 0 });

    component.fire('0');
    renderTimeline?.(1);

    expect(component.freePracticeTargets()).toEqual([]);
    expect(audio.playEnemyHit).toHaveBeenCalledOnce();

    component.fire('0');
    renderTimeline?.(1);

    expect(component.freePracticeWalls()[0].pieces.length).toBeLessThan(5);
    expect(audio.playWallHit).toHaveBeenCalledOnce();
  });

  it('starts single player with six soldiers and no square targets', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.cpuDifficulty.set(7);
    component.startCpuMatch();

    expect(component.gameMode()).toBe('single-player');
    expect(component.cpuDifficulty()).toBe(7);
    expect(component.boardCharacters().map((character) => character.displayName)).toEqual([
      'You-1',
      'You-2',
      'You-3',
      'CPU-1',
      'CPU-2',
      'CPU-3',
    ]);
    expect(component.targetsForBoard()).toEqual([]);
    expect(component.status()).toBe('Your turn.');
  });

  it('initializes and resets CPU memory for each single player match', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    expect(component.cpuOpponentMemory()).toBeNull();

    component.startCpuMatch();
    const firstMemory = component.cpuOpponentMemory();

    expect(firstMemory).not.toBeNull();
    expect(firstMemory?.populations.size).toBe(3);

    component.startCpuMatch();

    expect(component.cpuOpponentMemory()).not.toBe(firstMemory);
    expect(component.cpuOpponentMemory()?.recentMisses.size).toBe(0);
  });

  it('saves account progress when a signed-in player defeats a CPU level', async () => {
    account.user.mockReturnValue({ id: 'account-1', displayName: 'Tester' });
    progress.saveEquationArtilleryCpuWin.mockResolvedValue({
      stats: [],
      recentRuns: [],
      achievements: [{ id: 'equation_cpu_level_7', unlockedAt: '2026-07-06T00:00:00.000Z' }],
      newlyUnlocked: [{ id: 'equation_cpu_level_7', unlockedAt: '2026-07-06T00:00:00.000Z' }],
    });
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.cpuDifficulty.set(7);
    component.startCpuMatch();
    const endedState = {
      ...component.singlePlayerState()!,
      status: 'ended' as const,
      winnerUserId: 'human',
      endReason: 'hit' as const,
    };

    (component as any).finishSinglePlayerShot({
      trail: [],
      impact: 'opponent',
      state: endedState,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(progress.createEquationArtilleryCpuWinProof).toHaveBeenCalledWith(7);
    expect(progress.saveEquationArtilleryCpuWin).toHaveBeenCalledWith({
      completionToken: 'completion-token',
    });
    expect(toast.show).toHaveBeenCalledWith('Achievement unlocked: Equation Cpu Level 7');
  });

  it('does not save CPU progress for guests or losses', async () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.startCpuMatch();
    (component as any).finishSinglePlayerShot({
      trail: [],
      impact: 'opponent',
      state: {
        ...component.singlePlayerState()!,
        status: 'ended' as const,
        winnerUserId: 'cpu',
        endReason: 'hit' as const,
      },
    });
    await Promise.resolve();

    expect(progress.saveEquationArtilleryCpuWin).not.toHaveBeenCalled();
  });

  it('records player soldier metadata in single player history', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.startCpuMatch();

    component.fire('0');
    for (let index = 0; index < 500; index += 1) {
      if (advanceShot?.(1) === false) break;
    }

    expect(component.equationHistory()[0]).toMatchObject({
      equation: '0',
      senderName: 'You',
      soldierName: 'You-1',
      mine: true,
    });
  });

  it('fires the CPU turn after the player shot animation finishes', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.startCpuMatch();

    component.fire('50');
    for (let index = 0; index < 500; index += 1) {
      if (advanceShot?.(1) === false) break;
    }
    vi.runOnlyPendingTimers();
    for (let index = 0; index < 500; index += 1) {
      if (advanceShot?.(1) === false) break;
    }

    expect(component.cpuThinking()).toBe(false);
    expect(audio.playFire).toHaveBeenCalledTimes(2);
    expect(component.equationHistory().some((entry) => entry.senderName === 'CPU')).toBe(true);
    vi.useRealTimers();
  });

  it('records CPU shot outcomes in CPU memory', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    component.cpuDifficulty.set(0);
    component.startCpuMatch();
    component.singlePlayerState.update((state) =>
      state
        ? {
            ...state,
            characters: state.characters.map((character) => {
              if (character.ownerUserId === 'human') {
                return { ...character, position: { x: -12 + character.id, y: 7 } };
              }
              if (character.id === 3) return { ...character, position: { x: 12, y: -7 } };
              return { ...character, position: { x: 10 + (character.id - 3), y: -8 } };
            }),
          }
        : state,
    );

    component.fire('50');
    for (let index = 0; index < 500; index += 1) {
      if (advanceShot?.(1) === false) break;
    }
    vi.runOnlyPendingTimers();
    for (let index = 0; index < 500; index += 1) {
      if (advanceShot?.(1) === false) break;
    }

    expect(component.cpuOpponentMemory()?.recentMisses.size).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });
});
