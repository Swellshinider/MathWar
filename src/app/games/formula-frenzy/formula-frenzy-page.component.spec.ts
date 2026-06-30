import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { MultiplayerAuthService } from '../../shared/multiplayer/multiplayer-auth.service';
import { MultiplayerSocketService } from '../../shared/multiplayer/multiplayer-socket.service';
import { FormulaFrenzyPageComponent } from './formula-frenzy-page.component';

describe('FormulaFrenzyPageComponent', () => {
  let fixture: ComponentFixture<FormulaFrenzyPageComponent>;
  let component: FormulaFrenzyPageComponent;
  const audio = {
    playOneShot: vi.fn(),
  };
  const auth = {
    ready: vi.fn(() => true),
    session: vi.fn(() => ({ token: 'token', user: { id: 'left', displayName: 'Left' } })),
    storedDisplayName: vi.fn(() => ''),
    error: vi.fn(() => null),
    signIn: vi.fn(),
  };
  const socket = {
    disconnect: vi.fn(),
    connect: vi.fn(),
    create: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyPageComponent],
      providers: [
        { provide: AudioSettingsService, useValue: audio },
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        provideRouter([]),
      ],
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
    expect(root.textContent).toContain('Create private room');
    expect(root.textContent).toContain('Join room');
    expect(root.textContent).toContain('Progression');
    expect(root.textContent).toContain('Free Practice');
    expect(root.querySelector('.problem-prompt')?.textContent?.trim()).toBe('?? + ??');
    expect(root.querySelector('#formula-answer')?.getAttribute('type')).toBe('text');
    expect(root.querySelector('#formula-answer')?.getAttribute('inputmode')).toBe('none');
    expect(root.querySelector('.answer-keypad__send')?.textContent).toContain('Send');
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
    component.startRun();
    component.answerControl.setValue(String(component.problem().answer));

    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(220);
    expect(component.totalCorrect()).toBe(1);
    expect(component.streak()).toBe(1);
    expect(component.answerControl.value).toBe('');
    expect(component.answerRejected()).toBe(false);
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/right-answer.wav');
  });

  it('waits to start sprint mode until the player clicks start and focuses the answer', () => {
    const root = fixture.nativeElement as HTMLElement;
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    expect(component.gameOver()).toBe(false);
    expect(component.runStarted()).toBe(false);
    expect(root.querySelector<HTMLInputElement>('#formula-answer')?.disabled).toBe(true);
    expect(root.querySelector('.mode-panel .start-button')).not.toBeNull();
    expect(root.querySelector('.problem-panel .start-button')).toBeNull();

    root.querySelector<HTMLButtonElement>('.start-button')?.click();
    fixture.detectChanges();

    expect(component.runStarted()).toBe(true);
    expect(root.querySelector('.problem-prompt')?.textContent?.trim()).toBe(
      component.problem().prompt,
    );
    expect(document.activeElement).toBe(root.querySelector<HTMLInputElement>('#formula-answer'));
  });

  it('prevents browser navigation when submitting with Enter', () => {
    const form = (fixture.nativeElement as HTMLElement).querySelector('.problem-panel form')!;
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });

    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('enters and sends answers from the mobile keypad', () => {
    component.startRun();
    const answer = String(component.problem().answer);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    for (const digit of answer.replace('-', '')) {
      const button = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.answer-keypad button'),
      ).find((current) => current.textContent?.trim() === digit);
      button?.click();
    }
    if (answer.startsWith('-')) {
      root.querySelector<HTMLButtonElement>('[aria-label="Toggle sign"]')?.click();
    }
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.answer-keypad__send')?.click();
    fixture.detectChanges();

    expect(component.totalCorrect()).toBe(1);
    expect(component.answerControl.value).toBe('');
  });

  it('marks the answer input invalid without showing an error message', () => {
    component.startRun();
    component.answerControl.setValue(String(component.problem().answer! + 1));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.answerRejected()).toBe(true);
    expect(component.answerRejectionCount()).toBe(1);
    const answerInput = (fixture.nativeElement as HTMLElement).querySelector('#formula-answer');
    expect(answerInput?.classList).toContain('answer-input--invalid');
    expect(answerInput?.classList).toContain('answer-input--shake-a');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/wrong-answer.wav');

    component.answerControl.setValue('abc');
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.answerRejected()).toBe(true);
    expect(component.answerRejectionCount()).toBe(2);
    expect(answerInput?.classList).toContain('answer-input--shake-b');
  });

  it('ends the run when the problem timer expires', () => {
    component.startRun();
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    expect(component.gameOver()).toBe(true);
  });

  it('spends hearts on wrong answers and recovers one on a five-answer streak', () => {
    component.startRun();
    component.answerControl.setValue(String(component.problem().answer! + 1));
    component.submitAnswer();
    expect(component.hearts()).toBe(2);

    for (let index = 0; index < 5; index += 1) {
      component.answerControl.setValue(String(component.problem().answer));
      component.submitAnswer();
    }

    expect(component.hearts()).toBe(3);
    expect(component.streak()).toBe(5);
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/heart-up.wav');
  });

  it('prevents Backspace navigation after the sprint result appears', () => {
    component.startRun();
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('shows score and average solve time after losing', () => {
    component.startRun();
    vi.advanceTimersByTime(2500);
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    component.hearts.set(1);
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLDialogElement>('dialog.game-over')?.open).toBe(true);
    expect(root.querySelector('dialog.game-over')?.textContent).toContain('Final score 193');
    expect(root.querySelector('dialog.game-over')?.textContent).toContain(
      `Answer ${component.problem().answer}`,
    );
    expect(root.querySelector('dialog.game-over')?.textContent).toContain('Average 2.5s');
  });

  it('restarts the run from the game over screen', () => {
    component.startRun();
    component.hearts.set(1);
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
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Streak 0');
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
    component.setPracticeOperation('power', false);
    component.setPracticeOperation('root', false);

    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.practiceOperations()).toEqual(['multiplication']);
    expect(component.problem().prompt).toMatch(/^\d+ \* \d+$/);
    expect(component.score()).toBe(1);
    expect(component.streak()).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Streak 1');
  });

  it('resets the free practice streak on a wrong answer', () => {
    component.selectFreePractice();
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    component.answerControl.setValue(String(component.problem().answer! + 1));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(1);
    expect(component.streak()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Streak 0');
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
