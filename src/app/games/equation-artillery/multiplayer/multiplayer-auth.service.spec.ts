import { TestBed } from '@angular/core/testing';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';
import { MultiplayerAuthService } from './multiplayer-auth.service';

describe('MultiplayerAuthService', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
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
});
