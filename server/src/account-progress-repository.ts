import { Pool } from 'pg';

export type ProgressGameId = 'formula-frenzy' | 'equation-artillery';
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

export interface FormulaFrenzyRunInput {
  readonly accountId: string;
  readonly runId: string;
  readonly difficulty: ProgressDifficulty;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface EquationArtilleryCpuWinInput {
  readonly accountId: string;
  readonly cpuLevel: number;
}

export interface AccountGameRun {
  readonly runId: string;
  readonly gameId: ProgressGameId;
  readonly difficulty: ProgressDifficulty;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
  readonly createdAt: string;
}

export interface AccountGameStats {
  readonly gameId: ProgressGameId;
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

export interface AccountProgressRepository {
  initialize(): Promise<void>;
  saveFormulaFrenzyRun(input: FormulaFrenzyRunInput): Promise<SaveProgressResult>;
  saveEquationArtilleryCpuWin(input: EquationArtilleryCpuWinInput): Promise<SaveProgressResult>;
  getProgress(accountId: string): Promise<AccountProgress>;
  close(): Promise<void>;
}

const PROGRESS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account_game_runs (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id text NOT NULL CHECK (run_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  game_id text NOT NULL CHECK (game_id = 'formula-frenzy'),
  difficulty text NOT NULL CHECK (difficulty IN ('normal', 'hardcore')),
  score integer NOT NULL CHECK (score >= 0),
  level integer NOT NULL CHECK (level >= 1),
  average_time_ms integer CHECK (average_time_ms IS NULL OR average_time_ms >= 0),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, run_id)
);

CREATE INDEX IF NOT EXISTS account_game_runs_account_game_created_idx
  ON account_game_runs (account_id, game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_game_stats (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id = 'formula-frenzy'),
  difficulty text NOT NULL CHECK (difficulty IN ('normal', 'hardcore')),
  runs_count integer NOT NULL CHECK (runs_count >= 0),
  total_score bigint NOT NULL CHECK (total_score >= 0),
  best_score integer NOT NULL CHECK (best_score >= 0),
  best_level integer NOT NULL CHECK (best_level >= 1),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  best_average_time_ms integer CHECK (best_average_time_ms IS NULL OR best_average_time_ms >= 0),
  last_played_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, game_id, difficulty)
);

CREATE TABLE IF NOT EXISTS account_achievements (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, achievement_id)
);
`;

const ACHIEVEMENT_ORDER: readonly AchievementId[] = [
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
  'quick_solver',
  'hardcore_debut',
  'hardcore_level_5',
  'hardcore_level_10',
  'hardcore_legend_level',
  'equation_cpu_level_0',
  'equation_cpu_level_1',
  'equation_cpu_level_2',
  'equation_cpu_level_3',
  'equation_cpu_level_4',
  'equation_cpu_level_5',
  'equation_cpu_level_6',
  'equation_cpu_level_7',
  'equation_cpu_level_8',
  'equation_cpu_level_9',
  'equation_cpu_level_10',
  'equation_cpu_sweep',
];

const EQUATION_CPU_LEVEL_ACHIEVEMENTS = Array.from(
  { length: 11 },
  (_, level) => `equation_cpu_level_${level}` as AchievementId,
);

export function isProgressDifficulty(value: string): value is ProgressDifficulty {
  return value === 'normal' || value === 'hardcore';
}

export function validateProgressRunId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) {
    throw new Error('Run id is invalid.');
  }
  return value;
}

function achievementsForRun(input: FormulaFrenzyRunInput): readonly AchievementId[] {
  const achievements: AchievementId[] = ['first_run'];
  if (input.level >= 5) achievements.push('level_5');
  if (input.level >= 10) achievements.push('level_10');
  if (input.level >= 15) achievements.push('level_15');
  if (input.level >= 20) achievements.push('level_20');
  if (input.level >= 25) achievements.push('legend_level');
  if (input.score >= 1000) achievements.push('score_1000');
  if (input.score >= 5000) achievements.push('score_5000');
  if (input.score >= 10000) achievements.push('score_10000');
  if (input.bestStreak >= 10) achievements.push('streak_10');
  if (input.bestStreak >= 25) achievements.push('streak_25');
  if (input.bestStreak >= 50) achievements.push('streak_50');
  if (input.totalCorrect >= 20) achievements.push('twenty_correct');
  if (input.totalCorrect >= 50) achievements.push('fifty_correct');
  if (input.averageTimeMs !== null && input.averageTimeMs <= 3000 && input.totalCorrect >= 10) {
    achievements.push('quick_solver');
  }
  if (input.difficulty === 'hardcore') {
    achievements.push('hardcore_debut');
    if (input.level >= 5) achievements.push('hardcore_level_5');
    if (input.level >= 10) achievements.push('hardcore_level_10');
    if (input.level >= 25) achievements.push('hardcore_legend_level');
  }
  return achievements;
}

function achievementForCpuLevel(cpuLevel: number): AchievementId {
  return `equation_cpu_level_${cpuLevel}` as AchievementId;
}

export class InMemoryAccountProgressRepository implements AccountProgressRepository {
  private readonly runs = new Map<string, AccountGameRun>();
  private readonly stats = new Map<string, AccountGameStats>();
  private readonly achievements = new Map<string, AccountAchievement>();

  async initialize(): Promise<void> {}

  async saveFormulaFrenzyRun(input: FormulaFrenzyRunInput): Promise<SaveProgressResult> {
    const runKey = `${input.accountId}:${input.runId}`;
    const now = new Date().toISOString();
    const newlyUnlocked: AccountAchievement[] = [];
    if (!this.runs.has(runKey)) {
      const run: AccountGameRun = {
        runId: input.runId,
        gameId: 'formula-frenzy',
        difficulty: input.difficulty,
        score: input.score,
        level: input.level,
        averageTimeMs: input.averageTimeMs,
        bestStreak: input.bestStreak,
        totalCorrect: input.totalCorrect,
        createdAt: now,
      };
      this.runs.set(runKey, run);
      this.updateStats(input, now);
      newlyUnlocked.push(
        ...this.unlockAchievements(input.accountId, achievementsForRun(input), now),
      );
    }
    const progress = await this.getProgress(input.accountId);
    return { ...progress, newlyUnlocked };
  }

  async saveEquationArtilleryCpuWin(
    input: EquationArtilleryCpuWinInput,
  ): Promise<SaveProgressResult> {
    const now = new Date().toISOString();
    const progress = await this.getProgress(input.accountId);
    const alreadyUnlocked = new Set(progress.achievements.map((achievement) => achievement.id));
    const cpuAchievement = achievementForCpuLevel(input.cpuLevel);
    const achievements: AchievementId[] = [cpuAchievement];
    if (
      EQUATION_CPU_LEVEL_ACHIEVEMENTS.every(
        (achievement) => achievement === cpuAchievement || alreadyUnlocked.has(achievement),
      )
    ) {
      achievements.push('equation_cpu_sweep');
    }
    const newlyUnlocked = this.unlockAchievements(input.accountId, achievements, now);
    return { ...(await this.getProgress(input.accountId)), newlyUnlocked };
  }

  async getProgress(accountId: string): Promise<AccountProgress> {
    const runPrefix = `${accountId}:`;
    const statsPrefix = `${accountId}:`;
    return {
      stats: [...this.stats.entries()]
        .filter(([key]) => key.startsWith(statsPrefix))
        .map(([, value]) => structuredClone(value))
        .sort(compareStats),
      recentRuns: [...this.runs.entries()]
        .filter(([key]) => key.startsWith(runPrefix))
        .map(([, value]) => structuredClone(value))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10),
      achievements: [...this.achievements.entries()]
        .filter(([key]) => key.startsWith(runPrefix))
        .map(([, value]) => structuredClone(value))
        .sort(compareAchievements),
    };
  }

  async close(): Promise<void> {}

  private unlockAchievements(
    accountId: string,
    achievementIds: readonly AchievementId[],
    now: string,
  ): AccountAchievement[] {
    const newlyUnlocked: AccountAchievement[] = [];
    for (const id of achievementIds) {
      const achievementKey = `${accountId}:${id}`;
      if (!this.achievements.has(achievementKey)) {
        const achievement = { id, unlockedAt: now };
        this.achievements.set(achievementKey, achievement);
        newlyUnlocked.push(achievement);
      }
    }
    return newlyUnlocked;
  }

  private updateStats(input: FormulaFrenzyRunInput, now: string): void {
    const key = `${input.accountId}:formula-frenzy:${input.difficulty}`;
    const current = this.stats.get(key);
    if (!current) {
      this.stats.set(key, {
        gameId: 'formula-frenzy',
        difficulty: input.difficulty,
        runsCount: 1,
        totalScore: input.score,
        bestScore: input.score,
        bestLevel: input.level,
        bestStreak: input.bestStreak,
        totalCorrect: input.totalCorrect,
        bestAverageTimeMs: input.averageTimeMs,
        lastPlayedAt: now,
      });
      return;
    }
    this.stats.set(key, {
      ...current,
      runsCount: current.runsCount + 1,
      totalScore: current.totalScore + input.score,
      bestScore: Math.max(current.bestScore, input.score),
      bestLevel: Math.max(current.bestLevel, input.level),
      bestStreak: Math.max(current.bestStreak, input.bestStreak),
      totalCorrect: current.totalCorrect + input.totalCorrect,
      bestAverageTimeMs: bestAverage(current.bestAverageTimeMs, input.averageTimeMs),
      lastPlayedAt: now,
    });
  }
}

export class PostgresAccountProgressRepository implements AccountProgressRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(urlOrPool: string | Pool) {
    this.pool =
      typeof urlOrPool === 'string' ? new Pool({ connectionString: urlOrPool }) : urlOrPool;
    this.ownsPool = typeof urlOrPool === 'string';
  }

  async initialize(): Promise<void> {
    await this.pool.query(PROGRESS_SCHEMA_SQL);
  }

  async saveFormulaFrenzyRun(input: FormulaFrenzyRunInput): Promise<SaveProgressResult> {
    const client = await this.pool.connect();
    const newlyUnlocked: AccountAchievement[] = [];
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO account_game_runs (
          account_id,
          run_id,
          game_id,
          difficulty,
          score,
          level,
          average_time_ms,
          best_streak,
          total_correct
        )
        VALUES ($1, $2, 'formula-frenzy', $3, $4, $5, $6, $7, $8)
        ON CONFLICT (account_id, run_id) DO NOTHING
        RETURNING created_at`,
        [
          input.accountId,
          input.runId,
          input.difficulty,
          input.score,
          input.level,
          input.averageTimeMs,
          input.bestStreak,
          input.totalCorrect,
        ],
      );
      if (inserted.rowCount) {
        const playedAt = inserted.rows[0]['created_at'] as Date;
        await client.query(
          `INSERT INTO account_game_stats (
            account_id,
            game_id,
            difficulty,
            runs_count,
            total_score,
            best_score,
            best_level,
            best_streak,
            total_correct,
            best_average_time_ms,
            last_played_at
          )
          VALUES ($1, 'formula-frenzy', $2, 1, $3::bigint, $3::integer, $4, $5, $6, $7, $8)
          ON CONFLICT (account_id, game_id, difficulty) DO UPDATE
          SET
            runs_count = account_game_stats.runs_count + 1,
            total_score = account_game_stats.total_score + EXCLUDED.total_score,
            best_score = GREATEST(account_game_stats.best_score, EXCLUDED.best_score),
            best_level = GREATEST(account_game_stats.best_level, EXCLUDED.best_level),
            best_streak = GREATEST(account_game_stats.best_streak, EXCLUDED.best_streak),
            total_correct = account_game_stats.total_correct + EXCLUDED.total_correct,
            best_average_time_ms = CASE
              WHEN account_game_stats.best_average_time_ms IS NULL THEN EXCLUDED.best_average_time_ms
              WHEN EXCLUDED.best_average_time_ms IS NULL THEN account_game_stats.best_average_time_ms
              ELSE LEAST(account_game_stats.best_average_time_ms, EXCLUDED.best_average_time_ms)
            END,
            last_played_at = GREATEST(account_game_stats.last_played_at, EXCLUDED.last_played_at)`,
          [
            input.accountId,
            input.difficulty,
            input.score,
            input.level,
            input.bestStreak,
            input.totalCorrect,
            input.averageTimeMs,
            playedAt,
          ],
        );
        newlyUnlocked.push(
          ...(await insertAchievements(client, input.accountId, achievementsForRun(input))),
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const progress = await this.getProgress(input.accountId);
    return { ...progress, newlyUnlocked };
  }

  async saveEquationArtilleryCpuWin(
    input: EquationArtilleryCpuWinInput,
  ): Promise<SaveProgressResult> {
    const client = await this.pool.connect();
    const newlyUnlocked: AccountAchievement[] = [];
    try {
      await client.query('BEGIN');
      const unlocked = await client.query(
        `SELECT achievement_id
        FROM account_achievements
        WHERE account_id = $1`,
        [input.accountId],
      );
      const alreadyUnlocked = new Set(
        unlocked.rows.map((row) => row['achievement_id'] as AchievementId),
      );
      const cpuAchievement = achievementForCpuLevel(input.cpuLevel);
      const achievements: AchievementId[] = [cpuAchievement];
      if (
        EQUATION_CPU_LEVEL_ACHIEVEMENTS.every(
          (achievement) => achievement === cpuAchievement || alreadyUnlocked.has(achievement),
        )
      ) {
        achievements.push('equation_cpu_sweep');
      }
      newlyUnlocked.push(...(await insertAchievements(client, input.accountId, achievements)));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const progress = await this.getProgress(input.accountId);
    return { ...progress, newlyUnlocked };
  }

  async getProgress(accountId: string): Promise<AccountProgress> {
    const [stats, runs, achievements] = await Promise.all([
      this.pool.query(
        `SELECT *
        FROM account_game_stats
        WHERE account_id = $1
        ORDER BY game_id ASC, difficulty ASC`,
        [accountId],
      ),
      this.pool.query(
        `SELECT *
        FROM account_game_runs
        WHERE account_id = $1
        ORDER BY created_at DESC
        LIMIT 10`,
        [accountId],
      ),
      this.pool.query(
        `SELECT achievement_id, unlocked_at
        FROM account_achievements
        WHERE account_id = $1
        ORDER BY unlocked_at ASC, achievement_id ASC`,
        [accountId],
      ),
    ]);
    return {
      stats: stats.rows.map(mapStats),
      recentRuns: runs.rows.map(mapRun),
      achievements: achievements.rows.map(mapAchievement).sort(compareAchievements),
    };
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}

function bestAverage(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function compareStats(left: AccountGameStats, right: AccountGameStats): number {
  return left.gameId.localeCompare(right.gameId) || left.difficulty.localeCompare(right.difficulty);
}

function compareAchievements(left: AccountAchievement, right: AccountAchievement): number {
  const order = ACHIEVEMENT_ORDER.indexOf(left.id) - ACHIEVEMENT_ORDER.indexOf(right.id);
  return order || left.unlockedAt.localeCompare(right.unlockedAt);
}

function mapRun(row: Record<string, any>): AccountGameRun {
  return {
    runId: row['run_id'],
    gameId: row['game_id'],
    difficulty: row['difficulty'],
    score: row['score'],
    level: row['level'],
    averageTimeMs: row['average_time_ms'] ?? null,
    bestStreak: row['best_streak'],
    totalCorrect: row['total_correct'],
    createdAt: row['created_at'].toISOString(),
  };
}

function mapStats(row: Record<string, any>): AccountGameStats {
  return {
    gameId: row['game_id'],
    difficulty: row['difficulty'],
    runsCount: row['runs_count'],
    totalScore: Number(row['total_score']),
    bestScore: row['best_score'],
    bestLevel: row['best_level'],
    bestStreak: row['best_streak'],
    totalCorrect: row['total_correct'],
    bestAverageTimeMs: row['best_average_time_ms'] ?? null,
    lastPlayedAt: row['last_played_at'].toISOString(),
  };
}

function mapAchievement(row: Record<string, any>): AccountAchievement {
  return {
    id: row['achievement_id'],
    unlockedAt: row['unlocked_at'].toISOString(),
  };
}

async function insertAchievements(
  client: Pick<Pool, 'query'>,
  accountId: string,
  achievementIds: readonly AchievementId[],
): Promise<AccountAchievement[]> {
  const newlyUnlocked: AccountAchievement[] = [];
  for (const id of achievementIds) {
    const achievement = await client.query(
      `INSERT INTO account_achievements (account_id, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (account_id, achievement_id) DO NOTHING
      RETURNING achievement_id, unlocked_at`,
      [accountId, id],
    );
    if (achievement.rowCount) newlyUnlocked.push(mapAchievement(achievement.rows[0]));
  }
  return newlyUnlocked;
}
