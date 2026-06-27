import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormulaFrenzyPageComponent } from './formula-frenzy-page.component';

describe('FormulaFrenzyPageComponent', () => {
  let fixture: ComponentFixture<FormulaFrenzyPageComponent>;
  let component: FormulaFrenzyPageComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FormulaFrenzyPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Formula Frenzy play surface', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Formula Frenzy');
    expect(root.querySelector('.problem-prompt')?.textContent?.trim()).toBe(
      component.problem().prompt,
    );
    expect(root.querySelector('input')?.getAttribute('type')).toBe('text');
    expect(root.querySelector('input')?.getAttribute('inputmode')).toBe('decimal');
    expect(root.querySelector('button[type="submit"]')).toBeNull();
  });

  it('accepts a correct answer and advances the score', () => {
    component.answerControl.setValue(String(component.problem().answer));

    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(1);
    expect(component.answerControl.value).toBe('');
    expect(component.error()).toBeNull();
  });

  it('prevents browser navigation when submitting with Enter', () => {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });

    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('rejects wrong and nonnumeric answers without advancing', () => {
    component.answerControl.setValue(String(component.problem().answer + 1));
    component.submitAnswer();

    expect(component.score()).toBe(0);
    expect(component.error()).toBe('Try again.');

    component.answerControl.setValue('abc');
    component.submitAnswer();

    expect(component.score()).toBe(0);
    expect(component.error()).toBe('Enter a number.');
  });

  it('ends the run when the problem timer expires', () => {
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    expect(component.gameOver()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Time up');
  });

  it('shows score and average solve time after losing', () => {
    vi.advanceTimersByTime(2500);
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.game-over')?.textContent).toContain('Score 1');
    expect(root.querySelector('.game-over')?.textContent).toContain('Average 2.5s');
  });

  it('restarts the run from the game over screen', () => {
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.restart-button')
      ?.click();
    fixture.detectChanges();

    expect(component.gameOver()).toBe(false);
    expect(component.score()).toBe(0);
    expect(component.averageSolveTime()).toBe('0.0s');
  });
});
