import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountAuthService } from '../../account/account-auth.service';
import { LeaderboardService } from '../../leaderboard/leaderboard.service';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { MultiplayerAuthService } from '../../shared/multiplayer/multiplayer-auth.service';
import { MultiplayerSocketService } from '../../shared/multiplayer/multiplayer-socket.service';
import { ToastService } from '../../shared/toast/toast.service';
import { FormulaFrenzyPageComponent } from './formula-frenzy-page.component';

describe('FormulaFrenzyPageComponent', () => {
  let fixture: ComponentFixture<FormulaFrenzyPageComponent>;
  let component: FormulaFrenzyPageComponent;
  const audio = {
    playOneShot: vi.fn(),
  };
  const account = {
    ready: vi.fn(() => true),
    user: vi.fn<() => { id: string; username: string; displayName: string } | null>(() => ({
      id: 'account-1',
      username: 'player_one',
      displayName: 'Player One',
    })),
  };
  const leaderboard = {
    save: vi.fn(),
    storePendingRun: vi.fn(),
    takePendingRun: vi.fn(() => null),
  };
  const toast = {
    show: vi.fn(),
  };
  const auth = {
    ready: vi.fn(() => true),
    session: vi.fn(() => ({
      token: 'token',
      expiresAt: '2999-01-01T00:00:00.000Z',
      user: { id: 'left', displayName: 'Left' },
    })),
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
    vi.stubGlobal('localStorage', createMemoryStorage());
    account.ready.mockReturnValue(true);
    account.user.mockReturnValue({
      id: 'account-1',
      username: 'player_one',
      displayName: 'Player One',
    });
    leaderboard.save.mockResolvedValue({
      status: 'created',
      entry: {
        id: 'entry-1',
        gameId: 'formula-frenzy',
        difficulty: 'normal',
        accountId: 'account-1',
        username: 'player_one',
        rank: 1,
        score: 193,
        level: 1,
        averageTimeMs: 2500,
        bestStreak: 1,
        totalCorrect: 1,
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    });
    leaderboard.takePendingRun.mockReturnValue(null);

    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyPageComponent],
      providers: [
        { provide: AccountAuthService, useValue: account },
        { provide: AudioSettingsService, useValue: audio },
        { provide: LeaderboardService, useValue: leaderboard },
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: ToastService, useValue: toast },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FormulaFrenzyPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the Formula Frenzy play surface', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Formula Frenzy');
    expect(root.textContent).toContain('Create private room');
    expect(root.textContent).toContain('Join room');
    expect(root.textContent).toContain('Progression');
    expect(root.textContent).toContain('Hardcore');
    expect(root.textContent).toContain('Free Practice');
    expect(root.querySelector('.problem-prompt .formula-prompt')?.getAttribute('aria-label')).toBe(
      '?? + ??',
    );
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

  it('reveals a hint with the H key and halves the current answer score', () => {
    component.startRun();
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(component.hintsRemaining()).toBe(2);
    expect(component.currentHint()).toEqual(expect.any(String));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.problem-hint')?.textContent,
    ).toContain(`hint: ${component.currentHint()}`);

    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();

    expect(component.score()).toBe(110);
    expect(component.currentHint()).toBeNull();
  });

  it('renders the hint counter and HUD tooltips', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.hint-token')?.textContent).toContain('3');
    expect(root.querySelector('[role="tooltip"]#formula-score-tooltip')?.textContent).toContain(
      'Correct answers score more',
    );
    expect(root.querySelector('[role="tooltip"]#formula-hint-tooltip')?.textContent).toContain(
      'Press H',
    );
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
    expect(root.querySelector('.problem-prompt .formula-prompt')?.getAttribute('aria-label')).toBe(
      component.problem().prompt,
    );
    expect(document.activeElement).toBe(root.querySelector<HTMLInputElement>('#formula-answer'));
  });

  it('renders division as a fraction and multiplication with a multiplication sign', () => {
    component.selectFreePractice();
    component.problem.set({ ...component.problem(), prompt: '10 / 2' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.formula-fraction__numerator')?.textContent?.trim()).toBe('10');
    expect(root.querySelector('.formula-fraction__denominator')?.textContent?.trim()).toBe('2');
    expect(root.querySelector('.problem-prompt .formula-prompt')?.getAttribute('aria-label')).toBe(
      '10 / 2',
    );

    component.problem.set({ ...component.problem(), prompt: '2 * 3' });
    fixture.detectChanges();

    expect(root.querySelector('.problem-prompt')?.textContent).toContain('×');
    expect(root.querySelector('.problem-prompt')?.textContent).not.toContain('*');
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

  it('removes non-numeric typed answer characters without blocking negative answers', () => {
    component.startRun();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#formula-answer',
    )!;

    input.value = '12a-3h';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.answerControl.value).toBe('123');

    input.value = '-4x5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.answerControl.value).toBe('-45');
  });

  it('keeps the hint keybinding when the answer input is focused', () => {
    component.startRun();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#formula-answer',
    )!;
    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(component.hintsRemaining()).toBe(2);
    expect(component.currentHint()).toEqual(expect.any(String));
  });

  it('marks the answer input invalid without showing an error message', () => {
    component.startRun();
    component.answerControl.setValue(String(component.problem().answer! + 1));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.answerRejected()).toBe(true);
    expect(component.answerRejectionCount()).toBe(1);
    expect(component.answerControl.value).toBe('');
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
    expect(component.answerControl.value).toBe('');
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

  it('recovers one hint on a ten-answer streak up to three hints', () => {
    component.startRun();
    component.requestHint();

    for (let index = 0; index < 10; index += 1) {
      component.answerControl.setValue(String(component.problem().answer));
      component.submitAnswer();
    }

    expect(component.streak()).toBe(10);
    expect(component.hintsRemaining()).toBe(3);
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

  it('saves the finished run to the leaderboard for signed-in users', async () => {
    component.startRun();
    vi.advanceTimersByTime(2500);
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    component.hearts.set(1);
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.save-leaderboard-button')
      ?.click();
    await fixture.whenStable();

    expect(leaderboard.save).toHaveBeenCalledWith('formula-frenzy', {
      difficulty: 'normal',
      score: 193,
      level: 1,
      averageTimeMs: 2500,
      bestStreak: 1,
      totalCorrect: 1,
    });
    expect(toast.show).toHaveBeenCalledWith('Score saved to leaderboard.');
  });

  it('prompts guests to sign in before saving a leaderboard score', () => {
    account.user.mockReturnValue(null);
    component.startRun();
    component.hearts.set(1);
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.save-leaderboard-button')
      ?.click();
    fixture.detectChanges();

    expect(leaderboard.storePendingRun).toHaveBeenCalledWith(
      'formula-frenzy',
      expect.objectContaining({ difficulty: 'normal', score: 0, level: 1, averageTimeMs: null }),
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Sign in or create an account',
    );
  });

  it('switches to free practice without a game over timer', () => {
    component.selectFreePractice();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(component.gameMode()).toBe('free-practice');
    expect(root.textContent).toContain('Solved');
    expect(root.textContent).toContain('Streak 0');
    expect(root.textContent).toContain('Level 1');
    expect(root.textContent).toContain('Number Scout');
    expect(root.textContent).toContain('Reset to Level 1');
    expect(root.textContent).not.toContain('Time ');
    expect(root.querySelector('.reset-level-button')).not.toBeNull();
    expect(root.querySelector('.hint-token')).toBeNull();
    expect(root.querySelector('.hearts')).toBeNull();
    expect(root.querySelector('.practice-options')).toBeNull();
    expect(root.querySelector('.mode-panel input[type="checkbox"]')).toBeNull();

    vi.advanceTimersByTime(60000);
    fixture.detectChanges();

    expect(component.gameOver()).toBe(false);
  });

  it('runs hardcore without hints or hearts', () => {
    component.selectHardcore();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(component.gameMode()).toBe('hardcore');
    expect(component.hintsRemaining()).toBe(0);
    expect(component.hearts()).toBe(0);
    expect(root.querySelector('.hint-token')).toBeNull();
    expect(root.querySelector('.hearts')).toBeNull();
    expect(root.querySelector('.hud-mode')).toBeNull();
  });

  it('shows the hardcore warning before starting the run', () => {
    component.selectHardcore();
    fixture.detectChanges();

    component.startRun();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector<HTMLDialogElement>('dialog.hardcore-warning');
    expect(component.runStarted()).toBe(false);
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('One wrong answer ends the run.');
    expect(dialog?.textContent).toContain('Hints and hearts are not available.');

    root.querySelector<HTMLButtonElement>('dialog.hardcore-warning .btn')?.click();
    fixture.detectChanges();

    expect(component.runStarted()).toBe(true);
    expect(dialog?.open).toBe(false);
    expect(document.activeElement).toBe(root.querySelector<HTMLInputElement>('#formula-answer'));
  });

  it('persists the hardcore warning opt-out', () => {
    component.selectHardcore();
    fixture.detectChanges();

    component.startRun();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLInputElement>('dialog.hardcore-warning input')?.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('dialog.hardcore-warning .btn')?.click();
    fixture.detectChanges();

    expect(localStorage.getItem('math-war.formula-frenzy.hide-hardcore-warning')).toBe('1');

    component.restart();
    component.startRun();
    fixture.detectChanges();

    expect(component.runStarted()).toBe(true);
    expect(root.querySelector<HTMLDialogElement>('dialog.hardcore-warning')?.open).toBe(false);
  });

  it('does not reveal hints in hardcore with the H key', () => {
    startHardcoreRun();
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(false);
    expect(component.currentHint()).toBeNull();
    expect(component.hintsRemaining()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('.problem-hint')).toBeNull();
  });

  it('ends hardcore on the first wrong answer', () => {
    startHardcoreRun();
    component.answerControl.setValue(String(component.problem().answer! + 1));

    component.submitAnswer();
    fixture.detectChanges();

    expect(component.gameOver()).toBe(true);
    expect(component.streak()).toBe(0);
    expect(component.answerControl.value).toBe('');
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/wrong-answer.wav');
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/game-over.wav');
  });

  it('does not restore hints or hearts on hardcore streaks', () => {
    startHardcoreRun();

    for (let index = 0; index < 10; index += 1) {
      component.answerControl.setValue(String(component.problem().answer));
      component.submitAnswer();
    }

    expect(component.streak()).toBe(10);
    expect(component.hearts()).toBe(0);
    expect(component.hintsRemaining()).toBe(0);
    expect(audio.playOneShot).not.toHaveBeenCalledWith('/sounds/formula-frenzy/heart-up.wav');
  });

  it('saves hardcore runs to the hardcore leaderboard difficulty', async () => {
    startHardcoreRun();
    vi.advanceTimersByTime(2500);
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    vi.advanceTimersByTime(component.problem().deadlineMs);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.save-leaderboard-button')
      ?.click();
    await fixture.whenStable();

    expect(leaderboard.save).toHaveBeenCalledWith('formula-frenzy', {
      difficulty: 'hardcore',
      score: 193,
      level: 1,
      averageTimeMs: 2500,
      bestStreak: 1,
      totalCorrect: 1,
    });
  });

  it('advances through progression levels in free practice without speed scoring', () => {
    component.selectFreePractice();

    for (let index = 0; index < 8; index += 1) {
      component.answerControl.setValue(String(component.problem().answer));
      component.submitAnswer();
    }
    fixture.detectChanges();

    expect(component.score()).toBe(8);
    expect(component.experience()).toBe(8);
    expect(component.level()).toBe(4);
    expect(component.xp()).toBe(0);
    expect(component.highestLevel()).toBe(4);
    expect(component.totalCorrect()).toBe(8);
    expect(component.problem().level).toBe(4);
    expect(component.problem().prompt).toMatch(/^\d+ \* \d+$/);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Level 4');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Factor Runner');
  });

  it('resets the free practice streak on a wrong answer', () => {
    component.selectFreePractice();
    component.answerControl.setValue(String(component.problem().answer));
    component.submitAnswer();
    const score = component.score();
    const experience = component.experience();
    const level = component.level();
    component.answerControl.setValue(String(component.problem().answer! + 1));
    component.submitAnswer();
    fixture.detectChanges();

    expect(component.score()).toBe(score);
    expect(component.experience()).toBe(experience);
    expect(component.level()).toBe(level);
    expect(component.streak()).toBe(0);
    expect(component.gameOver()).toBe(false);
    expect(component.answerControl.value).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Streak 0');
  });

  it('does not reveal hints in free practice with the H key', () => {
    component.selectFreePractice();
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(false);
    expect(component.currentHint()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.problem-hint')).toBeNull();
  });

  it('resets free practice to level 1 from the toolbar', () => {
    component.selectFreePractice();
    for (let index = 0; index < 3; index += 1) {
      component.answerControl.setValue(String(component.problem().answer));
      component.submitAnswer();
    }
    fixture.detectChanges();

    expect(component.level()).toBe(2);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.reset-level-button')
      ?.click();
    fixture.detectChanges();

    expect(component.score()).toBe(0);
    expect(component.experience()).toBe(0);
    expect(component.level()).toBe(1);
    expect(component.xp()).toBe(0);
    expect(component.streak()).toBe(0);
    expect(component.gameOver()).toBe(false);
    expect(component.runStarted()).toBe(true);
  });

  function startHardcoreRun(): void {
    component.selectHardcore();
    fixture.detectChanges();
    component.startRun();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('dialog.hardcore-warning .btn')
      ?.click();
    fixture.detectChanges();
  }
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}
