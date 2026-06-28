import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { FormulaFrenzyMatchState } from '@math-war/game-engine';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  MultiplayerAuthService,
  MultiplayerGuestSession,
} from '../../equation-artillery/multiplayer/multiplayer-auth.service';
import { MultiplayerSocketService } from '../../equation-artillery/multiplayer/multiplayer-socket.service';
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
        totalSolveTimeMs: 0,
        currentProblem: {
          prompt: '4 + 5',
          level: 1,
          deadlineMs: 10000,
          startedAt: '2026-06-28T12:00:00.000Z',
        },
      },
      {
        userId: 'right',
        displayName: 'Right',
        connected: true,
        score: 0,
        totalSolveTimeMs: 0,
        currentProblem: {
          prompt: '7 - 2',
          level: 1,
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
    sendFormulaTyping: vi.fn(),
    startFormula: vi.fn(),
  };
  const router = { navigate: vi.fn() };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    auth.session.set({ token: 'token', user: { id: 'left', displayName: 'Left' } });
    await TestBed.configureTestingModule({
      imports: [FormulaFrenzyMultiplayerPageComponent],
      providers: [
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
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
    root.querySelector<HTMLButtonElement>('.restart-button')?.click();
    await fixture.whenStable();

    expect(socket.startFormula).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: ended.version,
    });
  });
});
