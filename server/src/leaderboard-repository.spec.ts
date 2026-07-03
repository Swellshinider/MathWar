import { describe, expect, it } from 'vitest';
import { InMemoryLeaderboardRepository } from './leaderboard-repository.js';

describe('InMemoryLeaderboardRepository', () => {
  it('keeps only the best score per account', async () => {
    const repository = new InMemoryLeaderboardRepository();
    const base = {
      gameId: 'formula-frenzy' as const,
      difficulty: 'normal' as const,
      accountId: 'account-1',
      username: 'player_one',
      score: 100,
      level: 2,
      averageTimeMs: 2500,
      bestStreak: 3,
      totalCorrect: 5,
    };

    const created = await repository.saveBest(base);
    const lower = await repository.saveBest({ ...base, score: 90, level: 9 });
    const faster = await repository.saveBest({ ...base, averageTimeMs: 1000 });

    expect(created.status).toBe('created');
    expect(lower.status).toBe('not_improved');
    expect(lower.entry.score).toBe(100);
    expect(faster.status).toBe('updated');
    expect(faster.entry.averageTimeMs).toBe(1000);
  });

  it('ranks by score, level, fastest average time, and best streak', async () => {
    const repository = new InMemoryLeaderboardRepository();
    await repository.saveBest({
      gameId: 'formula-frenzy',
      difficulty: 'normal',
      accountId: 'slow',
      username: 'slow',
      score: 100,
      level: 5,
      averageTimeMs: 3000,
      bestStreak: 20,
      totalCorrect: 10,
    });
    await repository.saveBest({
      gameId: 'formula-frenzy',
      difficulty: 'normal',
      accountId: 'fast',
      username: 'fast',
      score: 100,
      level: 5,
      averageTimeMs: 1000,
      bestStreak: 1,
      totalCorrect: 10,
    });
    await repository.saveBest({
      gameId: 'formula-frenzy',
      difficulty: 'normal',
      accountId: 'high-score',
      username: 'high_score',
      score: 200,
      level: 1,
      averageTimeMs: 9000,
      bestStreak: 1,
      totalCorrect: 10,
    });

    const page = await repository.list({
      gameId: 'formula-frenzy',
      difficulty: 'normal',
      page: 1,
      pageSize: 10,
      sort: 'rank',
      username: 'fast',
    });

    expect(page.entries.map((entry) => entry.username)).toEqual(['high_score', 'fast', 'slow']);
    expect(page.searchResult).toMatchObject({ username: 'fast', rank: 2 });
  });

  it('keeps separate best scores per difficulty', async () => {
    const repository = new InMemoryLeaderboardRepository();
    const base = {
      gameId: 'formula-frenzy' as const,
      accountId: 'account-1',
      username: 'player_one',
      score: 100,
      level: 2,
      averageTimeMs: 2500,
      bestStreak: 3,
      totalCorrect: 5,
    };

    await repository.saveBest({ ...base, difficulty: 'normal' });
    await repository.saveBest({ ...base, difficulty: 'hardcore', score: 50 });

    const normal = await repository.list({
      gameId: 'formula-frenzy',
      difficulty: 'normal',
      page: 1,
      pageSize: 10,
      sort: 'rank',
    });
    const hardcore = await repository.list({
      gameId: 'formula-frenzy',
      difficulty: 'hardcore',
      page: 1,
      pageSize: 10,
      sort: 'rank',
    });

    expect(normal.entries).toHaveLength(1);
    expect(hardcore.entries).toHaveLength(1);
    expect(normal.entries[0]).toMatchObject({ difficulty: 'normal', score: 100 });
    expect(hardcore.entries[0]).toMatchObject({ difficulty: 'hardcore', score: 50 });
  });
});
