import { Injectable, inject } from '@angular/core';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';
import { AccountAuthService } from './account-auth.service';

export type ProgressDifficulty = 'normal' | 'hardcore';
export type AchievementId =
  | 'first_run'
  | 'level_5'
  | 'level_10'
  | 'level_15'
  | 'level_20'
  | 'legend_level'
  | 'score_1000'
  | 'score_5000'
  | 'score_10000'
  | 'streak_10'
  | 'streak_25'
  | 'streak_50'
  | 'twenty_correct'
  | 'fifty_correct'
  | 'quick_solver'
  | 'hardcore_debut'
  | 'hardcore_level_5'
  | 'hardcore_level_10'
  | 'hardcore_legend_level'
  | `equation_cpu_level_${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | 'equation_cpu_sweep';

export interface FormulaFrenzyProgressRun {
  readonly runId: string;
  readonly difficulty: ProgressDifficulty;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface EquationArtilleryCpuWin {
  readonly completionToken: string;
}

export interface EquationArtilleryCpuWinProof {
  readonly completionToken: string;
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

  async saveFormulaFrenzyRun(completionToken: string): Promise<SaveProgressResult> {
    return this.authorizedJson<SaveProgressResult>('/api/account/progress/formula-frenzy/runs', {
      method: 'POST',
      body: JSON.stringify({ completionToken }),
    });
  }

  async saveEquationArtilleryCpuWin(win: EquationArtilleryCpuWin): Promise<SaveProgressResult> {
    return this.authorizedJson<SaveProgressResult>(
      '/api/account/progress/equation-artillery/cpu-wins',
      {
        method: 'POST',
        body: JSON.stringify(win),
      },
    );
  }

  async createEquationArtilleryCpuWinProof(
    cpuLevel: number,
  ): Promise<EquationArtilleryCpuWinProof> {
    return this.authorizedJson<EquationArtilleryCpuWinProof>(
      '/api/runs/equation-artillery/cpu-wins',
      {
        method: 'POST',
        body: JSON.stringify({ cpuLevel }),
      },
    );
  }

  storePendingFormulaFrenzyRun(difficulty: ProgressDifficulty, completionToken: string): void {
    sessionStorage.setItem(this.pendingRunKey(difficulty), completionToken);
  }

  takePendingFormulaFrenzyRun(difficulty: ProgressDifficulty = 'normal'): string | null {
    const key = this.pendingRunKey(difficulty);
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    sessionStorage.removeItem(key);
    return value;
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
