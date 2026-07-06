import { describe, expect, it } from 'vitest';
import { InMemoryAccountProgressRepository } from './account-progress-repository.js';

describe('InMemoryAccountProgressRepository', () => {
  it('records runs, aggregates stats, and unlocks achievements', async () => {
    const repository = new InMemoryAccountProgressRepository();

    const saved = await repository.saveFormulaFrenzyRun({
      accountId: 'account-1',
      runId: 'run-0001',
      difficulty: 'normal',
      score: 6000,
      level: 25,
      averageTimeMs: 2500,
      bestStreak: 25,
      totalCorrect: 25,
    });

    expect(saved.stats).toEqual([
      expect.objectContaining({
        gameId: 'formula-frenzy',
        difficulty: 'normal',
        runsCount: 1,
        totalScore: 6000,
        bestScore: 6000,
        bestLevel: 25,
        bestStreak: 25,
        totalCorrect: 25,
        bestAverageTimeMs: 2500,
      }),
    ]);
    expect(saved.recentRuns).toEqual([expect.objectContaining({ runId: 'run-0001', score: 6000 })]);
    expect(saved.newlyUnlocked.map((achievement) => achievement.id)).toEqual([
      'first_run',
      'level_5',
      'level_10',
      'level_15',
      'level_20',
      'legend_level',
      'score_1000',
      'score_5000',
      'streak_10',
      'streak_25',
      'twenty_correct',
      'quick_solver',
    ]);
  });

  it('unlocks expanded Formula Frenzy achievements at higher thresholds', async () => {
    const repository = new InMemoryAccountProgressRepository();

    const saved = await repository.saveFormulaFrenzyRun({
      accountId: 'account-1',
      runId: 'run-0001',
      difficulty: 'hardcore',
      score: 10_000,
      level: 25,
      averageTimeMs: 3500,
      bestStreak: 50,
      totalCorrect: 50,
    });

    expect(saved.newlyUnlocked.map((achievement) => achievement.id)).toEqual([
      'first_run',
      'level_5',
      'level_10',
      'level_15',
      'level_20',
      'legend_level',
      'score_1000',
      'score_5000',
      'score_10000',
      'streak_10',
      'streak_25',
      'streak_50',
      'twenty_correct',
      'fifty_correct',
      'hardcore_debut',
      'hardcore_level_5',
      'hardcore_level_10',
      'hardcore_legend_level',
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
      score: 1200,
      level: 10,
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
      'level_10',
      'score_1000',
      'hardcore_debut',
      'hardcore_level_5',
      'hardcore_level_10',
    ]);
  });

  it('records Equation Artillery CPU level wins idempotently', async () => {
    const repository = new InMemoryAccountProgressRepository();

    const saved = await repository.saveEquationArtilleryCpuWin({
      accountId: 'account-1',
      cpuLevel: 7,
    });
    const duplicate = await repository.saveEquationArtilleryCpuWin({
      accountId: 'account-1',
      cpuLevel: 7,
    });

    expect(saved.newlyUnlocked.map((achievement) => achievement.id)).toEqual([
      'equation_cpu_level_7',
    ]);
    expect(duplicate.newlyUnlocked).toEqual([]);
    expect(duplicate.achievements.map((achievement) => achievement.id)).toEqual([
      'equation_cpu_level_7',
    ]);
  });

  it('unlocks an Equation Artillery CPU sweep after every CPU level is defeated', async () => {
    const repository = new InMemoryAccountProgressRepository();

    for (let level = 0; level < 10; level += 1) {
      await repository.saveEquationArtilleryCpuWin({ accountId: 'account-1', cpuLevel: level });
    }
    const saved = await repository.saveEquationArtilleryCpuWin({
      accountId: 'account-1',
      cpuLevel: 10,
    });

    expect(saved.newlyUnlocked.map((achievement) => achievement.id)).toEqual([
      'equation_cpu_level_10',
      'equation_cpu_sweep',
    ]);
  });
});
