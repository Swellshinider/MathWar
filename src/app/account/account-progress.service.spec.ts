import { TestBed } from '@angular/core/testing';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';
import { AccountAuthService } from './account-auth.service';
import { AccountProgressService } from './account-progress.service';

describe('AccountProgressService', () => {
  const auth = {
    token: vi.fn(() => 'access-token'),
    refresh: vi.fn(),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    vi.stubGlobal('sessionStorage', createMemoryStorage());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('saves Formula Frenzy runs through the authenticated progress API', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            stats: [],
            recentRuns: [],
            achievements: [],
            newlyUnlocked: [{ id: 'first_run', unlockedAt: '2026-07-05T00:00:00.000Z' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountAuthService, useValue: auth },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(AccountProgressService);
    const result = await service.saveFormulaFrenzyRun({
      runId: 'run-0001',
      difficulty: 'normal',
      score: 100,
      level: 2,
      averageTimeMs: 2500,
      bestStreak: 4,
      totalCorrect: 5,
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL('http://localhost:3000/api/account/progress/formula-frenzy/runs'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
        body: JSON.stringify({
          runId: 'run-0001',
          difficulty: 'normal',
          score: 100,
          level: 2,
          averageTimeMs: 2500,
          bestStreak: 4,
          totalCorrect: 5,
        }),
      }),
    );
    expect(result.newlyUnlocked).toEqual([
      { id: 'first_run', unlockedAt: '2026-07-05T00:00:00.000Z' },
    ]);
  });

  it('saves Equation Artillery CPU wins through the authenticated progress API', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            stats: [],
            recentRuns: [],
            achievements: [],
            newlyUnlocked: [{ id: 'equation_cpu_level_7', unlockedAt: '2026-07-06T00:00:00.000Z' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountAuthService, useValue: auth },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });

    const service = TestBed.inject(AccountProgressService);
    const result = await service.saveEquationArtilleryCpuWin({ cpuLevel: 7 });

    expect(fetch).toHaveBeenCalledWith(
      new URL('http://localhost:3000/api/account/progress/equation-artillery/cpu-wins'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
        body: JSON.stringify({ cpuLevel: 7 }),
      }),
    );
    expect(result.newlyUnlocked).toEqual([
      { id: 'equation_cpu_level_7', unlockedAt: '2026-07-06T00:00:00.000Z' },
    ]);
  });

  it('stores and takes pending runs from session storage', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountAuthService, useValue: auth },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });
    const service = TestBed.inject(AccountProgressService);

    service.storePendingFormulaFrenzyRun({
      runId: 'run-0001',
      difficulty: 'hardcore',
      score: 100,
      level: 2,
      averageTimeMs: null,
      bestStreak: 4,
      totalCorrect: 5,
    });

    expect(service.takePendingFormulaFrenzyRun('normal')).toBeNull();
    expect(service.takePendingFormulaFrenzyRun('hardcore')).toEqual({
      runId: 'run-0001',
      difficulty: 'hardcore',
      score: 100,
      level: 2,
      averageTimeMs: null,
      bestStreak: 4,
      totalCorrect: 5,
    });
    expect(service.takePendingFormulaFrenzyRun('hardcore')).toBeNull();
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}
