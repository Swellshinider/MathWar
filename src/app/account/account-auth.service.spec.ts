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
                displayName: 'Player One',
                email: null,
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
                displayName: 'Player One',
                email: 'player@example.com',
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
    const ok = await service.login('player@example.com', 'password123');

    expect(ok).toBe(true);
    expect(service.token()).toBe('login-token');
    expect(service.user()?.email).toBe('player@example.com');
  });
});
