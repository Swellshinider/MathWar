import { TestBed } from '@angular/core/testing';
import { EquationArtilleryPageComponent } from './equation-artillery-page.component';
import { AnimationService } from './game/animation.service';
import { EquationArtilleryAudioService } from './game/audio.service';

describe('EquationArtilleryPageComponent', () => {
  let advanceShot: ((step: number) => boolean) | undefined;
  const animation = {
    start: vi.fn((advance: (step: number) => boolean) => {
      advanceShot = advance;
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
