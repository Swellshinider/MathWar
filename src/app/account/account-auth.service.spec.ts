import { TestBed } from '@angular/core/testing';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';
import { AccountAuthService } from './account-auth.service';

describe('AccountAuthService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('refreshes the account session on startup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'access-token',
              expiresAt: '2999-01-01T00:00:00.000Z',
              user: {
                id: 'account-1',
                username: 'player_one',
                displayName: 'Player One',
                avatarUrl: '/api/account/avatar/account-1?v=1',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(AccountAuthService);
    await service.refresh();

    expect(service.ready()).toBe(true);
    expect(service.token()).toBe('access-token');
    expect(service.user()?.displayName).toBe('Player One');
    expect(service.avatarUrl()).toBe('http://localhost:3000/api/account/avatar/account-1?v=1');
  });

  it('stores the access token after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'login-token',
              expiresAt: '2999-01-01T00:00:00.000Z',
              user: {
                id: 'account-1',
                username: 'player_one',
                displayName: 'Player One',
                avatarUrl: null,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(AccountAuthService);
    const ok = await service.login('player_one', 'password123');

    expect(ok).toBe(true);
    expect(service.token()).toBe('login-token');
    expect(service.user()?.username).toBe('player_one');
  });

  it('checks username availability', async () => {
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/account/refresh') {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      expect(url.pathname).toBe('/api/account/username-availability');
      expect(url.searchParams.get('username')).toBe('player_one');
      return Promise.resolve(
        new Response(JSON.stringify({ username: 'player_one', available: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(AccountAuthService);
    const availability = await service.checkUsernameAvailability('player_one');

    expect(availability).toEqual({ username: 'player_one', available: false });
  });
});
