import { Injectable, inject } from '@angular/core';
import { AccountAuthService } from '../../account/account-auth.service';
import { LeaderboardDifficulty } from '../../leaderboard/leaderboard.service';
import { MULTIPLAYER_CONFIG } from '../../shared/multiplayer/multiplayer-config';

export interface FormulaRunProblem {
  readonly prompt: string;
  readonly level: number;
  readonly levelName: string;
  readonly deadlineMs: number;
  readonly startedAt: string;
  readonly hint: string | null;
}

export interface FormulaRunState {
  readonly runId: string;
  readonly difficulty: LeaderboardDifficulty;
  readonly status: 'active' | 'ended';
  readonly score: number;
  readonly experience: number;
  readonly level: number;
  readonly xp: number;
  readonly xpRequired: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly hearts: number;
  readonly hintsRemaining: number;
  readonly currentHint: string | null;
  readonly highestLevel: number;
  readonly totalCorrect: number;
  readonly totalSolveTimeMs: number;
  readonly currentProblem: FormulaRunProblem;
  readonly completionToken?: string;
}

@Injectable({ providedIn: 'root' })
export class FormulaFrenzyRunService {
  private readonly auth = inject(AccountAuthService);
  private readonly config = inject(MULTIPLAYER_CONFIG);

  async start(difficulty: LeaderboardDifficulty): Promise<FormulaRunState> {
    return this.request('/api/runs/formula-frenzy/start', {
      method: 'POST',
      body: JSON.stringify({ difficulty }),
    });
  }

  async answer(runId: string, answer: number): Promise<FormulaRunState> {
    return this.request(`/api/runs/formula-frenzy/${runId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  }

  async hint(runId: string): Promise<FormulaRunState> {
    return this.request(`/api/runs/formula-frenzy/${runId}/hints`, { method: 'POST' });
  }

  async finish(runId: string): Promise<FormulaRunState> {
    return this.request(`/api/runs/formula-frenzy/${runId}/finish`, { method: 'POST' });
  }

  private async request(path: string, init: RequestInit): Promise<FormulaRunState> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.auth.token() || (await this.auth.refresh())) {
      headers['authorization'] = `Bearer ${this.auth.token()}`;
    }
    const response = await fetch(new URL(path, this.config.serverUrl), {
      ...init,
      credentials: 'include',
      headers,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readMessage(payload, 'The run request failed.'));
    return payload as FormulaRunState;
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
