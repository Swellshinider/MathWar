import { TestBed } from '@angular/core/testing';
import { EquationArtilleryPageComponent } from './equation-artillery-page.component';
import { AnimationService } from './game/animation.service';

describe('EquationArtilleryPageComponent', () => {
  const animation = {
    start: vi.fn(),
    cancel: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.overrideComponent(EquationArtilleryPageComponent, {
      set: {
        providers: [{ provide: AnimationService, useValue: animation }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [EquationArtilleryPageComponent],
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
  });
});
