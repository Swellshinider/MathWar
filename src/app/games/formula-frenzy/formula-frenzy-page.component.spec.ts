import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { FormulaFrenzyPageComponent } from './formula-frenzy-page.component';

describe('FormulaFrenzyPageComponent', () => {
  let fixture: ComponentFixture<FormulaFrenzyPageComponent>;
  let component: FormulaFrenzyPageComponent;
  const audio = {
    playOneShot: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyPageComponent],
      providers: [{ provide: AudioSettingsService, useValue: audio }],
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
    expect(root.textContent).toContain('Sprint');
    expect(root.textContent).toContain('Free Practice');
    expect(root.querySelector('.problem-prompt')?.textContent?.trim()).toBe(
      component.problem().prompt,
    );
    expect(root.querySelector('input')?.getAttribute('type')).toBe('text');
    expect(root.querySelector('input')?.getAttribute('inputmode')).toBe('decimal');
    expect(root.querySelector('button[type="submit"]')).toBeNull();
    expect(root.textContent).not.toContain(
      'Each correct answer raises your score. The deadline gets tighter as you climb.',
    );
  });

  it('uses the wide mini-game layout', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('app-game-frame article.wide')).not.toBeNull();
    expect(getComputedStyle(root.querySelector('.mode-panel')!).maxWidth).not.toBe('64rem');
    expect(getComputedStyle(root.querySelector('.frenzy-surface')!).maxWidth).not.toBe('64rem');
  });

  it('accepts a correct answer and advances the score', () => {
    component.answerControl.setValue(String(component.problem().answer));

    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(1);
    expect(component.answerControl.value).toBe('');
    expect(component.answerRejected()).toBe(false);
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/right-answer.wav');
  });

  it('prevents browser navigation when submitting with Enter', () => {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });

    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('marks the answer input invalid without showing an error message', () => {
    component.answerControl.setValue(String(component.problem().answer + 1));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.answerRejected()).toBe(true);
    expect(component.answerRejectionCount()).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.classList).toContain(
      'answer-input--invalid',
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.classList).toContain(
      'answer-input--shake-a',
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/wrong-answer.wav');

    component.answerControl.setValue('abc');
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.answerRejected()).toBe(true);
    expect(component.answerRejectionCount()).toBe(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.classList).toContain(
      'answer-input--shake-b',
    );
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
    expect(root.querySelector('.game-over')?.textContent).toContain(
      `Answer ${component.problem().answer}`,
    );
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

  it('switches to free practice without a game over timer', () => {
    component.selectFreePractice();
    fixture.detectChanges();

    expect(component.gameMode()).toBe('free-practice');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Solved 0');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Time ');

    vi.advanceTimersByTime(60000);
    fixture.detectChanges();

    expect(component.gameOver()).toBe(false);
  });

  it('uses selected operation types in free practice', () => {
    component.selectFreePractice();
    component.setPracticeOperation('addition', false);
    component.setPracticeOperation('subtraction', false);
    component.setPracticeOperation('division', false);

    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.practiceOperations()).toEqual(['multiplication']);
    expect(component.problem().prompt).toMatch(/^\d+ \* \d+$/);
    expect(component.score()).toBe(1);
  });

  it('pauses free practice when all operation types are unchecked', () => {
    component.selectFreePractice();
    for (const operation of component.practiceOperations()) {
      component.setPracticeOperation(operation, false);
    }
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(component.practicePaused()).toBe(true);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose at least one calculation type.',
    );
    expect(root.querySelector<HTMLInputElement>('#formula-answer')?.disabled).toBe(true);

    component.setPracticeOperation('division', true);
    fixture.detectChanges();

    expect(component.practicePaused()).toBe(false);
    expect(component.problem().prompt).toMatch(/^\d+ \/ \d+$/);
    expect(root.querySelector<HTMLInputElement>('#formula-answer')?.disabled).toBe(false);
  });
});
