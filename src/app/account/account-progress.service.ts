import { Injectable, inject } from '@angular/core';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';
import { AccountAuthService } from './account-auth.service';

export type ProgressDifficulty = 'normal' | 'hardcore';
export type AchievementId =
  | 'first_run'
  | 'level_5'
  | 'streak_10'
  | 'quick_solver'
  | 'hardcore_debut'
  | 'hardcore_level_5';

export interface FormulaFrenzyProgressRun {
  readonly runId: string;
  readonly difficulty: ProgressDifficulty;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface AccountGameRun extends FormulaFrenzyProgressRun {
  readonly gameId: 'formula-frenzy';
  readonly createdAt: string;
}

export interface AccountGameStats {
  readonly gameId: 'formula-frenzy';
  readonly difficulty: ProgressDifficulty;
  readonly runsCount: number;
  readonly totalScore: number;
  readonly bestScore: number;
  readonly bestLevel: number;
  readonly bestStreak: number;
  readonly totalCorrect: number;
  readonly bestAverageTimeMs: number | null;
  readonly lastPlayedAt: string;
}

export interface AccountAchievement {
  readonly id: AchievementId;
  readonly unlockedAt: string;
}

export interface AccountProgress {
  readonly stats: readonly AccountGameStats[];
  readonly recentRuns: readonly AccountGameRun[];
  readonly achievements: readonly AccountAchievement[];
}

export interface SaveProgressResult extends AccountProgress {
  readonly newlyUnlocked: readonly AccountAchievement[];
}

const PENDING_PROGRESS_PREFIX = 'math-war:pending-progress-run:';

@Injectable({ providedIn: 'root' })
export class AccountProgressService {
  private readonly auth = inject(AccountAuthService);
  private readonly config = inject(MULTIPLAYER_CONFIG);

  async get(): Promise<AccountProgress> {
    return this.authorizedJson<AccountProgress>('/api/account/progress', { method: 'GET' });
  }

  async saveFormulaFrenzyRun(run: FormulaFrenzyProgressRun): Promise<SaveProgressResult> {
    return this.authorizedJson<SaveProgressResult>('/api/account/progress/formula-frenzy/runs', {
      method: 'POST',
      body: JSON.stringify(run),
    });
  }

  storePendingFormulaFrenzyRun(run: FormulaFrenzyProgressRun): void {
    sessionStorage.setItem(this.pendingRunKey(run.difficulty), JSON.stringify(run));
  }

  takePendingFormulaFrenzyRun(
    difficulty: ProgressDifficulty = 'normal',
  ): FormulaFrenzyProgressRun | null {
    const key = this.pendingRunKey(difficulty);
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(value) as Partial<FormulaFrenzyProgressRun>;
      if (
        typeof parsed.runId !== 'string' ||
        (parsed.difficulty !== 'normal' && parsed.difficulty !== 'hardcore') ||
        typeof parsed.score !== 'number' ||
        typeof parsed.level !== 'number' ||
        typeof parsed.bestStreak !== 'number' ||
        typeof parsed.totalCorrect !== 'number' ||
        (parsed.averageTimeMs !== null && typeof parsed.averageTimeMs !== 'number')
      ) {
        return null;
      }
      return {
        runId: parsed.runId,
        difficulty: parsed.difficulty,
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

  private pendingRunKey(difficulty: ProgressDifficulty): string {
    return `${PENDING_PROGRESS_PREFIX}formula-frenzy:${difficulty}`;
  }

  private async authorizedJson<T>(
    path: string,
    init: Omit<RequestInit, 'headers' | 'credentials'>,
    retry = true,
  ): Promise<T> {
    if (!this.auth.token() && !(await this.auth.refresh())) {
      throw new Error('Sign in to save progress.');
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
    if (!response.ok) throw new Error(readMessage(payload, 'The progress request failed.'));
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
