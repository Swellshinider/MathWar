import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AccountAuthService } from '../../account/account-auth.service';
import { MULTIPLAYER_CONFIG } from '../../shared/multiplayer/multiplayer-config';
import { FormulaFrenzyRunService } from './formula-frenzy-run.service';

describe('FormulaFrenzyRunService', () => {
  const account = {
    token: vi.fn(() => null),
    refresh: vi.fn(async () => false),
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ runId: 'server-run', seed: 's', status: 'active', score: 0 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await TestBed.configureTestingModule({
      providers: [
        { provide: AccountAuthService, useValue: account },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://test.local' } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function lastInit(): RequestInit {
    return fetchMock.mock.calls.at(-1)![1] as RequestInit;
  }

  it('does not send a json content-type for bodyless finish requests', async () => {
    const service = TestBed.inject(FormulaFrenzyRunService);
    await service.finish('run-1');

    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('still sends a json content-type for requests with a body', async () => {
    const service = TestBed.inject(FormulaFrenzyRunService);
    await service.start('normal');

    const init = lastInit();
    expect(init.body).toBe(JSON.stringify({ difficulty: 'normal' }));
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});
