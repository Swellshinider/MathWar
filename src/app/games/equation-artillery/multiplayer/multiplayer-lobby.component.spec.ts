import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatchState } from '@math-war/game-engine';
import { MultiplayerGuestSession, MultiplayerAuthService } from './multiplayer-auth.service';
import { MultiplayerLobbyComponent } from './multiplayer-lobby.component';
import { MultiplayerSocketService } from './multiplayer-socket.service';
import { ToastService } from '../../../shared/toast/toast.service';

type SocketHandlers = Parameters<MultiplayerSocketService['connect']>[1];

function matchState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: 'match-1',
    roomCode: 'ABCD-EFGH',
    seed: 'seed',
    version: 1,
    status: 'waiting',
    players: [
      {
        userId: 'left',
        displayName: 'Left',
        position: { x: -9, y: 0 },
        radius: 0.32,
        direction: 1,
        connected: true,
      },
    ],
    characters: [],
    walls: [],
    equationHistory: [],
    turnUserId: 'left',
    turnCharacterId: null,
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: '2026-06-22T12:00:00.000Z',
    updatedAt: '2026-06-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('MultiplayerLobbyComponent', () => {
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
    create: vi.fn(),
    join: vi.fn(),
    fire: vi.fn(),
    leave: vi.fn(),
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    auth.ready.set(true);
    auth.session.set({ token: 'token', user: { id: 'left', displayName: 'Left' } });
    auth.storedDisplayName.set('');
    auth.error.set(null);
    auth.signIn.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [MultiplayerLobbyComponent],
      providers: [
        { provide: MultiplayerAuthService, useValue: auth },
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: ToastService, useValue: new ToastService() },
      ],
    }).compileComponents();
  });

  it('signs in with the entered display name', async () => {
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    const component = fixture.componentInstance;
    component.displayName.set('Commander');

    await component.signIn();

    expect(auth.signIn).toHaveBeenCalledWith('Commander');
  });

  it('creates a private room and reports the joined state', async () => {
    const state = matchState();
    socket.create.mockResolvedValue({ ok: true, data: state });
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    const component = fixture.componentInstance;
    const joined = vi.fn();
    component.roomJoined.subscribe(joined);

    await component.createRoom();

    expect(socket.create).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
    });
    expect(component.room()).toEqual(state);
    expect(joined).toHaveBeenCalledWith(state);
  });

  it('formats the room code before joining', async () => {
    socket.join.mockResolvedValue({ ok: true, data: matchState() });
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    const component = fixture.componentInstance;
    component.setRoomCode('abcd-efgh');

    await component.joinRoom();

    expect(socket.join).toHaveBeenCalledWith({
      commandId: expect.any(String),
      expectedVersion: 0,
      roomCode: 'ABCD-EFGH',
    });
    expect(component.roomCode()).toBe('ABCD-EFGH');
  });

  it('surfaces a server rejection without creating a room', async () => {
    socket.create.mockResolvedValue({ ok: false, error: 'Leave the current match first.' });
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    const component = fixture.componentInstance;

    await component.createRoom();

    expect(component.room()).toBeNull();
    expect(component.error()).toBe('Leave the current match first.');
  });

  it('copies the room invite link', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.stubGlobal('location', new URL('https://math-war.example/current'));
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    fixture.detectChanges();
    const state = matchState({ roomCode: 'ABCD-EFGH' });
    fixture.componentInstance.room.set(state);

    await fixture.componentInstance.shareRoomLink();

    expect(writeText).toHaveBeenCalledWith(
      'https://math-war.example/games/equation-artillery/multiplayer?room=ABCD-EFGH',
    );
  });

  it('emits play for the ready room', () => {
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    const component = fixture.componentInstance;
    const state = matchState();
    component.room.set(state);
    const played = vi.fn();
    component.play.subscribe(played);

    component.enterPlay();

    expect(played).toHaveBeenCalledWith(state);
  });

  it('renders the room code once a room is ready', () => {
    const fixture = TestBed.createComponent(MultiplayerLobbyComponent);
    fixture.detectChanges();
    fixture.componentInstance.room.set(matchState({ roomCode: 'ABCD-EFGH' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ABCD-EFGH');
    expect(fixture.nativeElement.textContent).toContain('Play');
  });
});
