import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatchState, ShotResolvedEvent } from '@math-war/game-engine';
import { AnimationService } from '../game/animation.service';
import { shotAnimationDuration } from '../game/shot-animation';
import { MultiplayerGuestSession } from './multiplayer-auth.service';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerPageComponent } from './multiplayer-page.component';
import { MultiplayerSocketService } from './multiplayer-socket.service';
import { EquationArtilleryAudioService } from '../game/audio.service';
import { ToastService } from '../../../shared/toast/toast.service';

type SocketHandlers = Parameters<MultiplayerSocketService['connect']>[1];

function matchState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: 'match-1',
    roomCode: 'ABC123',
    seed: 'seed',
    version: 1,
    status: 'active',
    players: [
      {
        userId: 'left',
        displayName: 'Left',
        position: { x: -9, y: 0 },
        radius: 0.32,
        direction: 1,
        connected: true,
      },
      {
        userId: 'right',
        displayName: 'Right',
        position: { x: 9, y: 0 },
        radius: 0.32,
        direction: -1,
        connected: true,
      },
    ],
    characters: [
      {
        id: 0,
        ownerUserId: 'left',
        displayName: 'Left',
        position: { x: -9, y: 0 },
        radius: 0.32,
        direction: 1,
        alive: true,
      },
      {
        id: 1,
        ownerUserId: 'left',
        displayName: 'Left',
        position: { x: -9, y: 2 },
        radius: 0.32,
        direction: 1,
        alive: true,
      },
      {
        id: 2,
        ownerUserId: 'left',
        displayName: 'Left',
        position: { x: -9, y: -2 },
        radius: 0.32,
        direction: 1,
        alive: true,
      },
      {
        id: 3,
        ownerUserId: 'right',
        displayName: 'Right',
        position: { x: 9, y: 0 },
        radius: 0.32,
        direction: -1,
        alive: true,
      },
      {
        id: 4,
        ownerUserId: 'right',
        displayName: 'Right',
        position: { x: 9, y: 2 },
        radius: 0.32,
        direction: -1,
        alive: true,
      },
      {
        id: 5,
        ownerUserId: 'right',
        displayName: 'Right',
        position: { x: 9, y: -2 },
        radius: 0.32,
        direction: -1,
        alive: true,
      },
    ],
    walls: [
      {
        id: 1,
        shape: 'vertical',
        pieces: [
          { id: 101, center: { x: 0, y: 0 }, size: 0.5 },
          { id: 102, center: { x: 0, y: 0.5 }, size: 0.5 },
        ],
      },
    ],
    equationHistory: [],
    turnUserId: 'left',
    turnCharacterId: 0,
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: '2026-06-22T12:00:00.000Z',
    updatedAt: '2026-06-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('MultiplayerPageComponent', () => {
  let handlers: SocketHandlers;
  let advanceShot: (() => boolean) | undefined;
  let renderTimeline: ((progress: number) => boolean) | undefined;
  let routeParams: Record<string, string>;
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
    create: vi.fn(),
    join: vi.fn(),
    fire: vi.fn(),
    leave: vi.fn(),
  };
  const router = {
    navigate: vi.fn(),
  };
  const animation = {
    start: vi.fn((advance: () => boolean) => {
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
    routeParams = {};
    auth.ready.set(true);
    auth.session.set({
      token: 'token',
      user: { id: 'left', displayName: 'Left' },
    });
    auth.storedDisplayName.set('');
    auth.error.set(null);
    auth.signIn.mockResolvedValue(undefined);
    socket.leave.mockResolvedValue({ ok: true });
    router.navigate.mockResolvedValue(true);
    advanceShot = undefined;
    renderTimeline = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.overrideComponent(MultiplayerPageComponent, {
      set: { providers: [{ provide: AnimationService, useValue: animation }] },
    });
    await TestBed.configureTestingModule({
      imports: [MultiplayerPageComponent],
      providers: [
        { provide: EquationArtilleryAudioService, useValue: audio },
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useFactory: () => ({ snapshot: { queryParamMap: convertToParamMap(routeParams) } }),
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('returns to the Equation Artillery page after leaving a match', async () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    handlers.state(state);

    await fixture.componentInstance.leave();

    expect(socket.leave).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: state.version,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/games/equation-artillery']);
  });

  it('shows Help and Equation history without technical server messages', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    handlers.state(matchState());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Help');
    expect(text).toContain('Equation history');
    expect(text).not.toContain('connected');
    expect(text).not.toContain('3/3');
    expect(text).not.toContain('Shots are resolved by the server');
    expect(text).not.toContain('Version 1');
  });

  it('keeps help on the board while match actions remain text controls', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    handlers.state(matchState());
    fixture.detectChanges();

    const introActions = fixture.nativeElement.querySelector('.intro-actions');
    const board = fixture.nativeElement.querySelector('app-board');
    const matchToolbar = fixture.nativeElement.querySelector('.match-toolbar');

    expect(introActions.textContent).not.toContain('Sound');
    expect(introActions.textContent).not.toContain('Help');
    expect(board.querySelector('[aria-label="Open sound settings"]')).toBeNull();
    expect(board.querySelector('[aria-label="Open equation help"]')).not.toBeNull();
    expect(matchToolbar.textContent).toContain('Share link');
    expect(matchToolbar.textContent).toContain('Leave match');
  });

  it('reveals the newest authoritative result only after the shot animation finishes', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const initial = matchState();
    const resolved = matchState({
      version: 2,
      walls: [],
      turnUserId: 'right',
      turnCharacterId: 3,
      equationHistory: [
        {
          commandId: 'shot-1',
          shooterUserId: 'left',
          shooterCharacterId: 0,
          equation: '0.25x',
        },
      ],
    });
    const paused = matchState({
      ...resolved,
      version: 3,
      status: 'paused',
      disconnectedUserId: 'right',
      reconnectDeadline: '2026-06-22T12:01:00.000Z',
    });
    const event: ShotResolvedEvent = {
      commandId: 'shot-1',
      matchId: initial.id,
      version: resolved.version,
      shooterUserId: 'left',
      shooterCharacterId: 0,
      equation: '0.25x',
      trail: [initial.characters[0].position, { x: 0, y: 0 }],
      impact: 'wall',
      error: null,
      state: resolved,
    };

    handlers.state(initial);
    handlers.shot?.(event);
    handlers.state(resolved);
    handlers.state(paused);

    expect(audio.playFire).toHaveBeenCalledOnce();
    expect(audio.startEquationSound).toHaveBeenCalledWith(event.trail[0]);
    expect(animation.startTimeline).toHaveBeenCalledWith(
      expect.any(Function),
      shotAnimationDuration(event.trail),
    );
    expect(component.activeShot()).toBe(true);
    expect(component.status()).toBe('Shot in flight.');
    expect(component.state()?.walls).toHaveLength(1);
    expect(component.state()?.turnUserId).toBe('left');
    expect(component.boardCharacters().find((character) => character.id === 0)?.active).toBe(true);
    expect(component.boardCharacters().find((character) => character.id === 0)?.functionLabel).toBe(
      '0.25x',
    );
    expect(component.equationHistory()).toEqual([]);

    expect(renderTimeline?.(1)).toBe(false);
    expect(audio.updateEquationSound).toHaveBeenCalledWith(event.trail[1]);

    expect(audio.stopEquationSound).toHaveBeenCalled();
    expect(audio.playWallHit).toHaveBeenCalledOnce();
    expect(component.activeShot()).toBe(false);
    expect(component.state()?.version).toBe(3);
    expect(component.state()?.walls).toEqual([]);
    expect(component.state()?.turnUserId).toBe('right');
    expect(component.trail()).toEqual([]);
    expect(component.boardCharacters().find((character) => character.id === 0)?.functionLabel).toBe(
      '0.25x',
    );
    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['0.25x']);
    expect(component.equationHistory()[0]).toMatchObject({
      senderName: 'Left',
      soldierName: 'Left-1',
      mine: true,
    });
    expect(component.status()).toBe('Match paused while a player reconnects.');
  });

  it('shows invalid-equation errors immediately without starting an animation', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    handlers.state(state);

    handlers.shot?.({
      commandId: 'invalid-shot',
      matchId: state.id,
      version: state.version,
      shooterUserId: 'left',
      shooterCharacterId: 0,
      equation: 'x+(',
      trail: [state.characters[0].position],
      impact: 'invalid',
      error: 'The equation has invalid syntax.',
      state,
    });

    expect(fixture.componentInstance.error()).toBe('The equation has invalid syntax.');
    expect(fixture.componentInstance.activeShot()).toBe(false);
    expect(animation.start).not.toHaveBeenCalled();
    expect(fixture.componentInstance.equationHistory()).toEqual([]);
  });

  it('plays local fire immediately and does not double-play it for the resolved shot event', async () => {
    socket.fire.mockResolvedValue({ ok: true });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    handlers.state(state);

    await fixture.componentInstance.fire();
    const commandId = socket.fire.mock.calls[0][0].commandId;
    handlers.shot?.({
      commandId,
      matchId: state.id,
      version: 2,
      shooterUserId: 'left',
      shooterCharacterId: 0,
      equation: '0',
      trail: [state.characters[0].position, { x: -8, y: 0 }],
      impact: 'bounds',
      error: null,
      state: matchState({ version: 2, turnUserId: 'right', turnCharacterId: 3 }),
    });

    expect(audio.playFire).toHaveBeenCalledOnce();
  });

  it('plays opponent hit and lose sounds after a resolved final shot', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    const ended = matchState({
      version: 2,
      status: 'ended',
      winnerUserId: 'right',
      endReason: 'hit',
      turnUserId: null,
      turnCharacterId: null,
    });
    handlers.state(state);
    handlers.shot?.({
      commandId: 'right-final',
      matchId: state.id,
      version: ended.version,
      shooterUserId: 'right',
      shooterCharacterId: 3,
      equation: '0',
      trail: [state.characters[3].position, { x: -9, y: 0 }],
      impact: 'opponent',
      error: null,
      state: ended,
    });

    renderTimeline?.(1);

    expect(audio.playEnemyHit).toHaveBeenCalledOnce();
    expect(audio.playLose).toHaveBeenCalledOnce();
  });

  it('defers match result sounds until an active final shot animation finishes', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    const ended = matchState({
      version: 2,
      status: 'ended',
      winnerUserId: 'right',
      endReason: 'hit',
      turnUserId: null,
      turnCharacterId: null,
    });
    handlers.state(state);
    handlers.shot?.({
      commandId: 'right-final',
      matchId: state.id,
      version: ended.version,
      shooterUserId: 'right',
      shooterCharacterId: 3,
      equation: '0',
      trail: [state.characters[3].position, { x: -9, y: 0 }],
      impact: 'opponent',
      error: null,
      state: ended,
    });

    handlers.ended?.({
      matchId: state.id,
      version: ended.version,
      winnerUserId: 'right',
      reason: 'hit',
    });

    expect(audio.playLose).not.toHaveBeenCalled();

    renderTimeline?.(1);

    expect(audio.playEnemyHit).toHaveBeenCalledOnce();
    expect(audio.playLose).toHaveBeenCalledOnce();
  });

  it('recovers the current player equation for each active character', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    handlers.state(
      matchState({
        turnUserId: 'left',
        turnCharacterId: 0,
        equationHistory: [
          {
            commandId: 'left-0',
            shooterUserId: 'left',
            shooterCharacterId: 0,
            equation: 'x^2 - 2x + 1',
          },
          {
            commandId: 'left-1',
            shooterUserId: 'left',
            shooterCharacterId: 1,
            equation: 'x^2 - 3x + 2',
          },
          {
            commandId: 'right-3',
            shooterUserId: 'right',
            shooterCharacterId: 3,
            equation: '100x',
          },
        ],
      }),
    );
    fixture.detectChanges();
    expect(component.equation()).toBe('x^2 - 2x + 1');

    handlers.state(
      matchState({
        version: 2,
        turnUserId: 'left',
        turnCharacterId: 1,
        equationHistory: [
          {
            commandId: 'left-0',
            shooterUserId: 'left',
            shooterCharacterId: 0,
            equation: 'x^2 - 2x + 1',
          },
          {
            commandId: 'left-1',
            shooterUserId: 'left',
            shooterCharacterId: 1,
            equation: 'x^2 - 3x + 2',
          },
          {
            commandId: 'right-3',
            shooterUserId: 'right',
            shooterCharacterId: 3,
            equation: '100x',
          },
        ],
      }),
    );
    fixture.detectChanges();
    expect(component.equation()).toBe('x^2 - 3x + 2');
  });

  it('uses the default equation for a player character without remembered history', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.equation.set('typed before turn');

    handlers.state(
      matchState({
        turnUserId: 'left',
        turnCharacterId: 2,
        equationHistory: [
          {
            commandId: 'left-0',
            shooterUserId: 'left',
            shooterCharacterId: 0,
            equation: 'x^2',
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.equation()).toBe('0');
  });

  it('does not overwrite edits while the same character turn remains active', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const state = matchState({
      turnUserId: 'left',
      turnCharacterId: 0,
      equationHistory: [
        {
          commandId: 'left-0',
          shooterUserId: 'left',
          shooterCharacterId: 0,
          equation: 'x^2',
        },
      ],
    });

    handlers.state(state);
    fixture.detectChanges();
    component.equation.set('x^2 + 1');
    handlers.state({ ...state, updatedAt: '2026-06-22T12:00:01.000Z' });
    fixture.detectChanges();

    expect(component.equation()).toBe('x^2 + 1');
  });

  it('ignores legacy equation history entries without character ids for recall', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    handlers.state(
      matchState({
        turnUserId: 'left',
        turnCharacterId: 0,
        equationHistory: [
          { commandId: 'legacy', shooterUserId: 'left', equation: 'x^2' },
        ] as unknown as MatchState['equationHistory'],
      }),
    );
    fixture.detectChanges();

    expect(component.equation()).toBe('0');
    expect(component.equationHistory().map((entry) => entry.equation)).toEqual(['x^2']);
    expect(component.equationHistory()[0]).toMatchObject({
      senderName: 'Left',
      soldierName: null,
      mine: true,
    });
  });

  it('maps living match characters to the board and hides defeated characters', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    handlers.state(
      matchState({
        characters: matchState().characters.map((character) =>
          character.id === 3 ? { ...character, alive: false } : character,
        ),
      }),
    );

    const characters = fixture.componentInstance.boardCharacters();

    expect(characters.map((character) => character.id)).toEqual([0, 1, 2, 4, 5]);
    expect(characters.find((character) => character.id === 0)?.active).toBe(true);
    expect(characters.every((character) => character.functionLabel === null)).toBe(true);
  });

  it('auto-joins an invite room after the socket connects', async () => {
    routeParams = { room: 'abcd-efgh' };
    socket.join.mockResolvedValue({ ok: true, data: matchState({ roomCode: 'ABCD-EFGH' }) });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();

    handlers.connected?.();
    await fixture.whenStable();

    expect(socket.join).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
      roomCode: 'ABCD-EFGH',
    });
  });

  it('clears a connection error after the socket reconnects', async () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();

    handlers.error('Connection interrupted. Trying to reconnect...');
    handlers.connected?.();
    await fixture.whenStable();

    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('auto-joins an invite room once a guest session becomes available', async () => {
    routeParams = { room: 'abcd-efgh' };
    auth.session.set(null);
    socket.join.mockResolvedValue({ ok: true, data: matchState({ roomCode: 'ABCD-EFGH' }) });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();

    // The embedded lobby completes sign-in, which makes a session available and
    // lets the page open its socket.
    auth.session.set({ token: 'token', user: { id: 'left', displayName: 'Left' } });
    fixture.detectChanges();
    handlers.connected?.();
    await fixture.whenStable();

    expect(socket.join).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
      roomCode: 'ABCD-EFGH',
    });
  });

  it('copies the current room invite link', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal('location', new URL('https://math-war.example/current'));
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    handlers.state(matchState({ roomCode: 'ABCD-EFGH' }));

    await fixture.componentInstance.shareRoomLink();

    expect(writeText).toHaveBeenCalledWith(
      'https://math-war.example/games/equation-artillery/multiplayer?room=ABCD-EFGH',
    );
    expect(TestBed.inject(ToastService).toasts()[0]?.message).toBe('Link copied to clipboard!');
  });
});
