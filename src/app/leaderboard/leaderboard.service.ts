import { Injectable, inject } from '@angular/core';
import { AccountAuthService } from '../account/account-auth.service';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';

export type LeaderboardGameId = 'formula-frenzy';
export type LeaderboardSort = 'rank' | 'level' | 'averageTime' | 'bestStreak';
export type LeaderboardSaveStatus = 'created' | 'updated' | 'not_improved';

export interface LeaderboardRun {
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface LeaderboardEntry extends LeaderboardRun {
  readonly id: string;
  readonly gameId: LeaderboardGameId;
  readonly accountId: string;
  readonly username: string;
  readonly rank: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LeaderboardPage {
  readonly entries: readonly LeaderboardEntry[];
  readonly searchResult: LeaderboardEntry | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly sort: LeaderboardSort;
}

export interface LeaderboardSaveResult {
  readonly status: LeaderboardSaveStatus;
  readonly entry: LeaderboardEntry;
}

const PENDING_RUN_PREFIX = 'math-war:pending-leaderboard-run:';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly auth = inject(AccountAuthService);
  private readonly config = inject(MULTIPLAYER_CONFIG);

  async list(
    gameId: LeaderboardGameId,
    options: {
      readonly page: number;
      readonly pageSize: number;
      readonly sort: LeaderboardSort;
      readonly username?: string;
    },
  ): Promise<LeaderboardPage> {
    const url = new URL(`/api/leaderboards/${gameId}`, this.config.serverUrl);
    url.searchParams.set('page', String(options.page));
    url.searchParams.set('pageSize', String(options.pageSize));
    url.searchParams.set('sort', options.sort);
    if (options.username?.trim()) url.searchParams.set('username', options.username.trim());
    const response = await fetch(url);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readMessage(payload, 'Could not load the leaderboard.'));
    return payload as LeaderboardPage;
  }

  async save(gameId: LeaderboardGameId, run: LeaderboardRun): Promise<LeaderboardSaveResult> {
    return this.authorizedJson<LeaderboardSaveResult>(`/api/leaderboards/${gameId}/entries`, {
      method: 'POST',
      body: JSON.stringify(run),
    });
  }

  storePendingRun(gameId: LeaderboardGameId, run: LeaderboardRun): void {
    sessionStorage.setItem(`${PENDING_RUN_PREFIX}${gameId}`, JSON.stringify(run));
  }

  takePendingRun(gameId: LeaderboardGameId): LeaderboardRun | null {
    const key = `${PENDING_RUN_PREFIX}${gameId}`;
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(value) as Partial<LeaderboardRun>;
      if (
        typeof parsed.score !== 'number' ||
        typeof parsed.level !== 'number' ||
        typeof parsed.bestStreak !== 'number' ||
        typeof parsed.totalCorrect !== 'number' ||
        (parsed.averageTimeMs !== null && typeof parsed.averageTimeMs !== 'number')
      ) {
        return null;
      }
      return {
        score: parsed.score,
        level: parsed.level,
        averageTimeMs: parsed.averageTimeMs,
        bestStreak: parsed.bestStreak,
        totalCorrect: parsed.totalCorrect,
      };
    } catch {
      return null;
    }
  }

  private async authorizedJson<T>(
    path: string,
    init: Omit<RequestInit, 'headers' | 'credentials'>,
    retry = true,
  ): Promise<T> {
    if (!this.auth.token() && !(await this.auth.refresh())) {
      throw new Error('Sign in to save your score.');
    }
    const response = await fetch(new URL(path, this.config.serverUrl), {
      ...init,
      credentials: 'include',
      headers: {
        authorization: `Bearer ${this.auth.token()}`,
        'content-type': 'application/json',
      },
    });
    if (response.status === 401 && retry && (await this.auth.refresh())) {
      return this.authorizedJson<T>(path, init, false);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readMessage(payload, 'The leaderboard request failed.'));
    return payload as T;
  }
}

function readMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : fallback;
}
