import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatchState, ShotResolvedEvent } from '@math-war/game-engine';
import { AnimationService } from '../game/animation.service';
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
  const auth = {
    ready: signal(true),
    session: signal({
      access_token: 'token',
      user: { id: 'left', email: 'left@example.com', user_metadata: {} },
    }),
    error: signal<string | null>(null),
    signInWithGoogle: vi.fn(),
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
    vi.clearAllMocks();
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
      equation: '0.25x',
      trail: [initial.players[0].position, { x: 0, y: 0 }],
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
    expect(component.equationHistory()).toEqual([]);

    expect(advanceShot?.()).toBe(true);
    expect(advanceShot?.()).toBe(false);

    expect(component.activeShot()).toBe(false);
    expect(component.state()?.version).toBe(3);
    expect(component.state()?.walls).toEqual([]);
    expect(component.state()?.turnUserId).toBe('right');
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
      equation: 'x+(',
      trail: [state.players[0].position],
      impact: 'invalid',
      error: 'The equation has invalid syntax.',
      state,
    });

    expect(fixture.componentInstance.error()).toBe('The equation has invalid syntax.');
    expect(fixture.componentInstance.activeShot()).toBe(false);
    expect(animation.start).not.toHaveBeenCalled();
    expect(fixture.componentInstance.equationHistory()).toEqual([]);
  });
});
