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

  it('records only equations that successfully start a shot', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.fire('sin(x)');
    expect(component.equationHistory()).toEqual(['sin(x)']);

    component.active.set(false);
    component.fire('x+(');
    expect(component.equationHistory()).toEqual(['sin(x)']);
    expect(component.error()).not.toBeNull();
  });

  it('retains history across new rounds', () => {
    const fixture = TestBed.createComponent(EquationArtilleryPageComponent);
    const component = fixture.componentInstance;

    component.fire('x^2');
    component.newRound();

    expect(component.equationHistory()).toEqual(['x^2']);
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
    advanceShot?.(1);

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
    advanceShot?.(1);

    expect(audio.stopEquationSound).toHaveBeenCalled();
    expect(audio.playWallHit).toHaveBeenCalledOnce();
  });
});
