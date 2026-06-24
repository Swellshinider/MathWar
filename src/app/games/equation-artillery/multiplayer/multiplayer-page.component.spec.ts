import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatchState, ShotResolvedEvent } from '@math-war/game-engine';
import { AnimationService } from '../game/animation.service';
import { MultiplayerGuestSession } from './multiplayer-auth.service';
import { MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerPageComponent } from './multiplayer-page.component';
import { MultiplayerSocketService } from './multiplayer-socket.service';

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
  const animation = {
    start: vi.fn((advance: () => boolean) => {
      advanceShot = advance;
    }),
    cancel: vi.fn(),
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
    advanceShot = undefined;
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
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        {
          provide: ActivatedRoute,
          useFactory: () => ({ snapshot: { queryParamMap: convertToParamMap(routeParams) } }),
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

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
      equationHistory: [{ commandId: 'shot-1', shooterUserId: 'left', equation: '0.25x' }],
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
    handlers.shot(event);
    handlers.state(resolved);
    handlers.state(paused);

    expect(component.activeShot()).toBe(true);
    expect(component.status()).toBe('Shot in flight.');
    expect(component.state()?.walls).toHaveLength(1);
    expect(component.state()?.turnUserId).toBe('left');
    expect(component.boardCharacters().find((character) => character.id === 0)?.active).toBe(true);
    expect(component.boardCharacters().find((character) => character.id === 0)?.functionLabel).toBe(
      '0.25x',
    );
    expect(component.equationHistory()).toEqual([]);

    expect(advanceShot?.()).toBe(true);
    expect(advanceShot?.()).toBe(false);

    expect(component.activeShot()).toBe(false);
    expect(component.state()?.version).toBe(3);
    expect(component.state()?.walls).toEqual([]);
    expect(component.state()?.turnUserId).toBe('right');
    expect(component.trail()).toEqual([]);
    expect(component.boardCharacters().find((character) => character.id === 0)?.functionLabel).toBe(
      '0.25x',
    );
    expect(component.equationHistory()).toEqual(['0.25x']);
    expect(component.status()).toBe('Match paused while a player reconnects.');
  });

  it('shows invalid-equation errors immediately without starting an animation', () => {
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const state = matchState();
    handlers.state(state);

    handlers.shot({
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

  it('submits the lobby room code with Enter', async () => {
    socket.join.mockResolvedValue({ ok: true, data: matchState({ roomCode: 'ABCD-EFGH' }) });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.setRoomCode('abcd-efgh');

    fixture.nativeElement.querySelector('.lobby').dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(socket.join).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
      roomCode: 'ABCD-EFGH',
    });
  });

  it('auto-joins an invite room after the socket connects', async () => {
    routeParams = { room: 'abcd-efgh' };
    socket.join.mockResolvedValue({ ok: true, data: matchState({ roomCode: 'ABCD-EFGH' }) });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();

    handlers.connected?.();
    await fixture.whenStable();

    expect(fixture.componentInstance.roomCode()).toBe('ABCD-EFGH');
    expect(socket.join).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
      roomCode: 'ABCD-EFGH',
    });
  });

  it('auto-joins an invite room after display-name sign-in', async () => {
    routeParams = { room: 'abcd-efgh' };
    auth.session.set(null);
    auth.signIn.mockImplementation(async () => {
      auth.session.set({ token: 'token', user: { id: 'left', displayName: 'Left' } });
    });
    socket.join.mockResolvedValue({ ok: true, data: matchState({ roomCode: 'ABCD-EFGH' }) });
    const fixture = TestBed.createComponent(MultiplayerPageComponent);
    fixture.detectChanges();

    await fixture.componentInstance.signIn();
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
    expect(fixture.componentInstance.status()).toBe('Share link copied.');
  });
});
