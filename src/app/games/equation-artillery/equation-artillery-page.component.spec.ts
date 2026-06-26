import { TestBed } from '@angular/core/testing';
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
    startTimeline: vi.fn((render: (progress: number) => boolean) => {
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

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    advanceShot = undefined;
    renderTimeline = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.overrideComponent(EquationArtilleryPageComponent, {
      set: {
        providers: [{ provide: AnimationService, useValue: animation }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [EquationArtilleryPageComponent],
      providers: [{ provide: EquationArtilleryAudioService, useValue: audio }],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('records only equations that successfully start a shot', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

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

  it('places sound and help controls on the board instead of the page header', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();

    const introActions = fixture.nativeElement.querySelector('.intro-actions');
    const board = fixture.nativeElement.querySelector('app-board');

    expect(introActions.textContent).not.toContain('Sound');
    expect(introActions.textContent).not.toContain('Help');
    expect(board.querySelector('[aria-label="Open sound settings"]')).not.toBeNull();
    expect(board.querySelector('[aria-label="Open equation help"]')).not.toBeNull();
  });

  it('retains history across new rounds', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.fire('x^2');
    component.newRound();

    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['x^2']);
    expect(component.active()).toBe(false);
    expect(audio.stopEquationSound).toHaveBeenCalled();
  });

  it('plays fire and starts generated audio for a valid shot', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.fire('0');

    expect(audio.playFire).toHaveBeenCalledOnce();
    expect(audio.startEquationSound).toHaveBeenCalledWith(component.player().position);
  });

  it('plays target and win sounds when the last target is destroyed', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.targets.set([{ id: 1, center: { x: -1, y: 3 }, width: 1, height: 1 }]);
    component.walls.set([]);
    component.player.set({ position: { x: -2, y: 3 }, radius: 0.3 });

    component.fire('0');
    for (let index = 0; index < 10; index += 1) {
      if (advanceShot?.(1) === false) break;
    }

    expect(audio.playEnemyHit).toHaveBeenCalledOnce();
    expect(audio.playWin).toHaveBeenCalledOnce();
  });

  it('plays the wall hit sound and stops generated audio when a shot hits a wall', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    component.targets.set([{ id: 1, center: { x: 5, y: 5 }, width: 1, height: 1 }]);
    component.walls.set([
      {
        id: 1,
        shape: 'vertical',
        pieces: [{ id: 1, center: { x: -1, y: 3 }, size: 0.5 }],
      },
    ]);
    component.player.set({ position: { x: -2, y: 3 }, radius: 0.3 });

    component.fire('0');
    for (let index = 0; index < 10; index += 1) {
      if (advanceShot?.(1) === false) break;
    }

    expect(audio.stopEquationSound).toHaveBeenCalled();
    expect(audio.playWallHit).toHaveBeenCalledOnce();
  });

  it('shows CPU setup only after selecting single player without starting a match', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(fixture.nativeElement.querySelector('.difficulty-control')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Start Single Player');

    const modeTabs = Array.from(
      fixture.nativeElement.querySelectorAll('.mode-tab'),
    ) as HTMLButtonElement[];
    const singlePlayerTab = modeTabs.find((button) =>
      button.textContent?.includes('Single Player'),
    )!;
    singlePlayerTab.click();
    fixture.detectChanges();

    expect(component.gameMode()).toBe('single-player');
    expect(component.singlePlayerState()).toBeNull();
    expect(fixture.nativeElement.querySelector('.difficulty-control')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Start Single Player');

    const startButton = fixture.nativeElement.querySelector(
      '.difficulty-control .btn',
    ) as HTMLButtonElement;
    startButton.click();
    fixture.detectChanges();

    expect(component.singlePlayerState()).not.toBeNull();
    expect(component.status()).toBe('Your turn.');
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

    component.selectTargetPractice();
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

  it('moves only the free practice player from board clicks', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    const targetPracticePlayer = component.player();
    component.selectFreePractice();

    component.moveFreePracticePlayer({ x: 4, y: -2 });

    expect(component.playerForBoard().position).toEqual({ x: 4, y: -2 });
    expect(component.player()).toBe(targetPracticePlayer);
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

  it('preserves target practice entities after visiting free practice', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;
    const targetPracticeTargets = component.targets();
    const targetPracticeWalls = component.walls();

    component.selectFreePractice();
    component.moveFreePracticePlayer({ x: 1, y: 1 });
    component.selectTargetPractice();

    expect(component.targetsForBoard()).toBe(targetPracticeTargets);
    expect(component.wallsForBoard()).toBe(targetPracticeWalls);
    expect(component.playerForBoard()).toBe(component.player());
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
