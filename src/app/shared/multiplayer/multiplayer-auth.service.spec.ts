import { TestBed } from '@angular/core/testing';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';
import { MultiplayerAuthService } from './multiplayer-auth.service';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
}

describe('MultiplayerAuthService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a clear error when the multiplayer server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    TestBed.configureTestingModule({
      providers: [
        MultiplayerAuthService,
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(MultiplayerAuthService);
    await service.signIn('Player');

    expect(service.session()).toBeNull();
    expect(service.error()).toBe('Could not reach the multiplayer server.');
  });

  it('stores the guest session and remembered display name after sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              token: 'token',
              user: { id: 'user-1', displayName: 'Player One' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        MultiplayerAuthService,
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(MultiplayerAuthService);
    await service.signIn('Player One');

    expect(service.session()).toEqual({
      token: 'token',
      user: { id: 'user-1', displayName: 'Player One' },
    });
    expect(service.storedDisplayName()).toBe('Player One');
  });

  it('clears only the guest session when signing out', async () => {
    localStorage.setItem(
      'math-war-multiplayer-session',
      JSON.stringify({ token: 'token', user: { id: 'user-1', displayName: 'Player One' } }),
    );
    localStorage.setItem('math-war-multiplayer-display-name', 'Player One');
    localStorage.setItem('unrelated-key', 'keep me');
    TestBed.configureTestingModule({
      providers: [
        MultiplayerAuthService,
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(MultiplayerAuthService);
    service.signOut();

    expect(service.session()).toBeNull();
    expect(service.storedDisplayName()).toBe('Player One');
    expect(localStorage.getItem('math-war-multiplayer-session')).toBeNull();
    expect(localStorage.getItem('math-war-multiplayer-display-name')).toBe('Player One');
    expect(localStorage.getItem('unrelated-key')).toBe('keep me');
  });

  it('clears invalid guest sessions without clearing remembered or unrelated storage', async () => {
    localStorage.setItem(
      'math-war-multiplayer-session',
      JSON.stringify({ token: 'token', user: { id: 'user-1', displayName: 'Player One' } }),
    );
    localStorage.setItem('math-war-multiplayer-display-name', 'Player One');
    localStorage.setItem('unrelated-key', 'keep me');
    TestBed.configureTestingModule({
      providers: [
        MultiplayerAuthService,
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(MultiplayerAuthService);
    service.clearInvalidSession();

    expect(service.session()).toBeNull();
    expect(service.storedDisplayName()).toBe('Player One');
    expect(localStorage.getItem('math-war-multiplayer-session')).toBeNull();
    expect(localStorage.getItem('math-war-multiplayer-display-name')).toBe('Player One');
    expect(localStorage.getItem('unrelated-key')).toBe('keep me');
  });

  it('removes invalid stored sessions without clearing the remembered display name', () => {
    localStorage.setItem('math-war-multiplayer-session', '{');
    localStorage.setItem('math-war-multiplayer-display-name', 'Player One');
    TestBed.configureTestingModule({
      providers: [
        MultiplayerAuthService,
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(MultiplayerAuthService);

    expect(service.session()).toBeNull();
    expect(service.storedDisplayName()).toBe('Player One');
    expect(localStorage.getItem('math-war-multiplayer-session')).toBeNull();
  });
});
