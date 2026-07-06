import { describe, expect, it } from 'vitest';
import { InMemoryAccountProgressRepository } from './account-progress-repository.js';

describe('InMemoryAccountProgressRepository', () => {
  it('records runs, aggregates stats, and unlocks achievements', async () => {
    const repository = new InMemoryAccountProgressRepository();

    const saved = await repository.saveFormulaFrenzyRun({
      accountId: 'account-1',
      runId: 'run-0001',
      difficulty: 'normal',
      score: 500,
      level: 5,
      averageTimeMs: 2500,
      bestStreak: 10,
      totalCorrect: 10,
    });

    expect(saved.stats).toEqual([
      expect.objectContaining({
        gameId: 'formula-frenzy',
        difficulty: 'normal',
        runsCount: 1,
        totalScore: 500,
        bestScore: 500,
        bestLevel: 5,
        bestStreak: 10,
        totalCorrect: 10,
        bestAverageTimeMs: 2500,
      }),
    ]);
    expect(saved.recentRuns).toEqual([expect.objectContaining({ runId: 'run-0001', score: 500 })]);
    expect(saved.newlyUnlocked.map((achievement) => achievement.id)).toEqual([
      'first_run',
      'level_5',
      'streak_10',
      'quick_solver',
    ]);
  });

  it('keeps duplicate run ids idempotent', async () => {
    const repository = new InMemoryAccountProgressRepository();
    const run = {
      accountId: 'account-1',
      runId: 'run-0001',
      difficulty: 'normal' as const,
      score: 100,
      level: 1,
      averageTimeMs: null,
      bestStreak: 0,
      totalCorrect: 0,
    };

    await repository.saveFormulaFrenzyRun(run);
    const duplicate = await repository.saveFormulaFrenzyRun({ ...run, score: 999, level: 9 });

    expect(duplicate.stats[0]).toMatchObject({ runsCount: 1, totalScore: 100, bestScore: 100 });
    expect(duplicate.recentRuns).toHaveLength(1);
    expect(duplicate.newlyUnlocked).toEqual([]);
  });

  it('tracks hardcore achievements separately from normal stats', async () => {
    const repository = new InMemoryAccountProgressRepository();

    await repository.saveFormulaFrenzyRun({
      accountId: 'account-1',
      runId: 'hardcore-1',
      difficulty: 'hardcore',
      score: 800,
      level: 5,
      averageTimeMs: 4000,
      bestStreak: 8,
      totalCorrect: 8,
    });

    const progress = await repository.getProgress('account-1');

    expect(progress.stats).toEqual([
      expect.objectContaining({ difficulty: 'hardcore', runsCount: 1 }),
    ]);
    expect(progress.achievements.map((achievement) => achievement.id)).toEqual([
      'first_run',
      'level_5',
      'hardcore_debut',
      'hardcore_level_5',
    ]);
  });
});
