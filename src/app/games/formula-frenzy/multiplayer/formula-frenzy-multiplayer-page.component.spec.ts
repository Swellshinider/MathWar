import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { FormulaFrenzyMatchState } from '@math-war/game-engine';
import { AudioSettingsService } from '../../../shared/audio/audio-settings.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  MultiplayerAuthService,
  MultiplayerGuestSession,
} from '../../../shared/multiplayer/multiplayer-auth.service';
import { MultiplayerSocketService } from '../../../shared/multiplayer/multiplayer-socket.service';
import { FormulaFrenzyMultiplayerPageComponent } from './formula-frenzy-multiplayer-page.component';

type SocketHandlers = Parameters<MultiplayerSocketService['connect']>[1];

function formulaState(overrides: Partial<FormulaFrenzyMatchState> = {}): FormulaFrenzyMatchState {
  return {
    gameId: 'formula-frenzy',
    id: 'match-1',
    roomCode: 'ABCD-EFGH',
    seed: 'seed',
    version: 2,
    status: 'waiting',
    players: [
      {
        userId: 'left',
        displayName: 'Left',
        position: { x: 0, y: 0 },
        radius: 0,
        direction: 1,
        connected: true,
      },
      {
        userId: 'right',
        displayName: 'Right',
        position: { x: 0, y: 0 },
        radius: 0,
        direction: -1,
        connected: true,
      },
    ],
    formulaPlayers: [],
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: '2026-06-28T12:00:00.000Z',
    updatedAt: '2026-06-28T12:00:00.000Z',
    ...overrides,
  };
}

function activeState(overrides: Partial<FormulaFrenzyMatchState> = {}): FormulaFrenzyMatchState {
  return formulaState({
    status: 'active',
    formulaPlayers: [
      {
        userId: 'left',
        displayName: 'Left',
        connected: true,
        score: 0,
        experience: 0,
        level: 1,
        xp: 0,
        xpRequired: 2,
        streak: 0,
        bestStreak: 0,
        hearts: 3,
        hintsRemaining: 3,
        currentHint: null,
        highestLevel: 1,
        totalCorrect: 0,
        totalSolveTimeMs: 0,
        currentProblem: {
          prompt: '4 + 5',
          level: 1,
          levelName: 'Number Scout',
          deadlineMs: 10000,
          startedAt: '2026-06-28T12:00:00.000Z',
        },
      },
      {
        userId: 'right',
        displayName: 'Right',
        connected: true,
        score: 0,
        experience: 0,
        level: 1,
        xp: 0,
        xpRequired: 2,
        streak: 0,
        bestStreak: 0,
        hearts: 3,
        hintsRemaining: 3,
        currentHint: null,
        highestLevel: 1,
        totalCorrect: 0,
        totalSolveTimeMs: 0,
        currentProblem: {
          prompt: '7 - 2',
          level: 1,
          levelName: 'Number Scout',
          deadlineMs: 10000,
          startedAt: '2026-06-28T12:00:00.000Z',
        },
      },
    ],
    ...overrides,
  });
}

describe('FormulaFrenzyMultiplayerPageComponent', () => {
  let fixture: ComponentFixture<FormulaFrenzyMultiplayerPageComponent>;
  let handlers: SocketHandlers;
  const auth = {
    ready: signal(true),
    session: signal<MultiplayerGuestSession | null>({
      token: 'token',
      expiresAt: '2999-01-01T00:00:00.000Z',
      user: { id: 'left', displayName: 'Left' },
    }),
    storedDisplayName: signal(''),
    error: signal<string | null>(null),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
  const socket = {
    connect: vi.fn((_token: string, nextHandlers: SocketHandlers) => {
      handlers = nextHandlers;
    }),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    answerFormula: vi.fn(),
    requestFormulaHint: vi.fn(),
    sendFormulaTyping: vi.fn(),
    startFormula: vi.fn(),
  };
  const router = { navigate: vi.fn() };
  const audio = { playOneShot: vi.fn() };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    auth.session.set({
      token: 'token',
      expiresAt: '2999-01-01T00:00:00.000Z',
      user: { id: 'left', displayName: 'Left' },
    });
    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyMultiplayerPageComponent],
      providers: [
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: AudioSettingsService, useValue: audio },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: ToastService, useValue: new ToastService() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FormulaFrenzyMultiplayerPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.componentInstance.ngOnDestroy());

  it('lets the host start a waiting match and focuses the answer input', async () => {
    const started = activeState({ version: 3 });
    socket.startFormula.mockResolvedValue({ ok: true, data: started });
    const root = fixture.nativeElement as HTMLElement;

    handlers.state(formulaState());
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.start-button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(socket.startFormula).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 2,
    });
    expect(document.activeElement).toBe(
      root.querySelector<HTMLInputElement>('#formula-multiplayer-answer'),
    );
  });

  it('shows restart after a result and starts a new run', async () => {
    const ended = activeState({ status: 'ended', winnerUserId: 'right', endReason: 'timeout' });
    const restarted = activeState({ version: 4 });
    socket.startFormula.mockResolvedValue({ ok: true, data: restarted });
    const root = fixture.nativeElement as HTMLElement;

    handlers.state(ended);
    fixture.detectChanges();
    expect(root.querySelector<HTMLDialogElement>('dialog.game-over')?.open).toBe(true);
    expect(root.querySelector('dialog.game-over')?.textContent).toContain('Game over');
    expect(root.querySelector('dialog.game-over')?.textContent).toContain('Final score 0');
    expect(root.querySelector('dialog.game-over')?.textContent).toContain('Leave match');
    expect(root.querySelector('dialog.game-over')?.textContent).not.toContain('timeout');
    root.querySelector<HTMLButtonElement>('.restart-button')?.click();
    await fixture.whenStable();

    expect(socket.startFormula).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: ended.version,
    });
  });

  it('hides restart from guests after a result', async () => {
    const ended = activeState({ status: 'ended', winnerUserId: 'left', endReason: 'timeout' });
    auth.session.set({
      token: 'token',
      expiresAt: '2999-01-01T00:00:00.000Z',
      user: { id: 'right', displayName: 'Right' },
    });
    const root = fixture.nativeElement as HTMLElement;

    handlers.state(ended);
    fixture.detectChanges();
    await fixture.componentInstance.startRun();

    expect(root.querySelector<HTMLButtonElement>('.restart-button')).toBeNull();
    expect(socket.startFormula).not.toHaveBeenCalled();
  });

  it('enters answers from the mobile keypad and sends typing updates', () => {
    vi.useFakeTimers();
    handlers.state(activeState());
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLInputElement>('#formula-multiplayer-answer')?.focus();
    expect(root.querySelector('#formula-multiplayer-answer')?.getAttribute('inputmode')).toBe(
      'none',
    );
    Array.from(root.querySelectorAll<HTMLButtonElement>('.answer-keypad button'))
      .find((button) => button.textContent?.trim() === '4')
      ?.click();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.answer-keypad button'))
      .find((button) => button.textContent?.trim() === '5')
      ?.click();
    vi.advanceTimersByTime(100);

    expect(fixture.componentInstance.answerControl.value).toBe('45');
    expect(socket.sendFormulaTyping).toHaveBeenCalledWith({ input: '45' });
    vi.useRealTimers();
  });

  it('renders local and opponent operators with math formatting', () => {
    const state = activeState({
      formulaPlayers: [
        {
          ...activeState().formulaPlayers[0],
          currentProblem: {
            ...activeState().formulaPlayers[0].currentProblem,
            prompt: '10 / 2',
          },
        },
        {
          ...activeState().formulaPlayers[1],
          currentProblem: {
            ...activeState().formulaPlayers[1].currentProblem,
            prompt: '2 * 3',
          },
        },
      ],
    });
    handlers.state(state);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const prompts = root.querySelectorAll<HTMLElement>('.problem-prompt');

    expect(prompts[0].querySelector('.formula-fraction__numerator')?.textContent?.trim()).toBe(
      '10',
    );
    expect(prompts[0].querySelector('.formula-fraction__denominator')?.textContent?.trim()).toBe(
      '2',
    );
    expect(prompts[0].querySelector('.formula-prompt')?.getAttribute('aria-label')).toBe('10 / 2');
    expect(prompts[1].textContent).toContain('×');
    expect(prompts[1].textContent).not.toContain('*');
    expect(prompts[1].querySelector('.formula-prompt')?.getAttribute('aria-label')).toBe('2 * 3');
  });

  it('sends the keypad answer through the existing form submit', async () => {
    const next = activeState({ version: 3 });
    socket.answerFormula.mockResolvedValue({ ok: true, data: next });
    handlers.state(activeState());
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    Array.from(root.querySelectorAll<HTMLButtonElement>('.answer-keypad button'))
      .find((button) => button.textContent?.trim() === '4')
      ?.click();
    root.querySelector<HTMLButtonElement>('.answer-keypad__send')?.click();
    await fixture.whenStable();

    expect(socket.answerFormula).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 2,
      answer: 4,
    });
  });

  it('requests a hint and renders the revealed local hint', async () => {
    const hinted = activeState({
      version: 3,
      formulaPlayers: [
        { ...activeState().formulaPlayers[0], hintsRemaining: 2, currentHint: '4 + 5' },
        activeState().formulaPlayers[1],
      ],
    });
    socket.requestFormulaHint.mockResolvedValue({ ok: true, data: hinted });
    handlers.state(activeState());
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.hint-token')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(socket.requestFormulaHint).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 2,
    });
    expect(root.querySelector('.hint-token')?.textContent).toContain('2');
    expect(root.querySelector('.problem-hint')?.textContent).toContain('hint: 4 + 5');
  });

  it('prevents Backspace navigation after the multiplayer result appears', () => {
    const ended = activeState({ status: 'ended', winnerUserId: 'right', endReason: 'timeout' });
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });

    handlers.state(ended);
    fixture.detectChanges();
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('returns to the lobby when the multiplayer session expires', () => {
    handlers.state(activeState());
    fixture.detectChanges();

    auth.session.set(null);
    handlers.error('Your multiplayer session expired. Please enter again.');
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBeNull();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Your multiplayer session expired. Please enter again.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Enter a display name to create or join a private match.',
    );
  });

  it('plays only local player formula sounds', () => {
    handlers.state(activeState());
    audio.playOneShot.mockClear();

    handlers.state(
      activeState({
        version: 3,
        formulaPlayers: [
          {
            ...activeState().formulaPlayers[0],
            score: 100,
            streak: 1,
            hearts: 2,
            level: 2,
          },
          {
            ...activeState().formulaPlayers[1],
            score: 100,
            streak: 1,
            hearts: 2,
            level: 2,
          },
        ],
      }),
    );

    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/right-answer.wav');
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/wrong-answer.wav');
    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/level-up.wav');
    expect(audio.playOneShot).toHaveBeenCalledTimes(3);
  });

  it('plays the local result sound once when the match ends', () => {
    handlers.state(activeState());
    audio.playOneShot.mockClear();

    handlers.ended!({ matchId: 'match-1', reason: 'timeout', winnerUserId: 'right', version: 3 });
    handlers.ended!({ matchId: 'match-1', reason: 'timeout', winnerUserId: 'right', version: 3 });

    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/game-over.wav');
    expect(audio.playOneShot).toHaveBeenCalledTimes(1);
  });

  it('plays the local heal sound when only the local player recovers a heart', () => {
    handlers.state(
      activeState({
        formulaPlayers: activeState().formulaPlayers.map((player) => ({ ...player, hearts: 2 })),
      }),
    );
    audio.playOneShot.mockClear();

    handlers.state(
      activeState({
        version: 3,
        formulaPlayers: [
          { ...activeState().formulaPlayers[0], hearts: 3 },
          { ...activeState().formulaPlayers[1], hearts: 3 },
        ],
      }),
    );

    expect(audio.playOneShot).toHaveBeenCalledWith('/sounds/formula-frenzy/heart-up.wav');
    expect(audio.playOneShot).toHaveBeenCalledTimes(1);
  });
});
