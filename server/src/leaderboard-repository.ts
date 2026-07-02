import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export type LeaderboardGameId = 'formula-frenzy';
export type LeaderboardSort = 'rank' | 'level' | 'averageTime' | 'bestStreak';
export type LeaderboardSaveStatus = 'created' | 'updated' | 'not_improved';

export interface LeaderboardScoreInput {
  readonly gameId: LeaderboardGameId;
  readonly accountId: string;
  readonly username: string;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface LeaderboardEntry {
  readonly id: string;
  readonly gameId: LeaderboardGameId;
  readonly accountId: string;
  readonly username: string;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  readonly rank: number;
}

export interface LeaderboardPage {
  readonly entries: readonly RankedLeaderboardEntry[];
  readonly searchResult: RankedLeaderboardEntry | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly sort: LeaderboardSort;
}

export interface LeaderboardSaveResult {
  readonly status: LeaderboardSaveStatus;
  readonly entry: RankedLeaderboardEntry;
}

export interface LeaderboardRepository {
  initialize(): Promise<void>;
  saveBest(input: LeaderboardScoreInput): Promise<LeaderboardSaveResult>;
  list(input: {
    readonly gameId: LeaderboardGameId;
    readonly page: number;
    readonly pageSize: number;
    readonly sort: LeaderboardSort;
    readonly username?: string;
  }): Promise<LeaderboardPage>;
  close(): Promise<void>;
}

const LEADERBOARD_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY,
  game_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  level integer NOT NULL CHECK (level >= 1),
  average_time_ms integer CHECK (average_time_ms IS NULL OR average_time_ms >= 0),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, account_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_entries_rank_idx
  ON leaderboard_entries (
    game_id,
    score DESC,
    level DESC,
    average_time_ms ASC NULLS LAST,
    best_streak DESC,
    updated_at ASC,
    id ASC
  );
`;

export function isLeaderboardGameId(value: string): value is LeaderboardGameId {
  return value === 'formula-frenzy';
}

export function isLeaderboardSort(value: string): value is LeaderboardSort {
  return value === 'rank' || value === 'level' || value === 'averageTime' || value === 'bestStreak';
}

export function isBetterLeaderboardScore(
  candidate: Pick<LeaderboardScoreInput, 'score' | 'level' | 'averageTimeMs' | 'bestStreak'>,
  current: Pick<LeaderboardEntry, 'score' | 'level' | 'averageTimeMs' | 'bestStreak'>,
): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  if (candidate.level !== current.level) return candidate.level > current.level;
  const candidateAverage = candidate.averageTimeMs ?? Number.POSITIVE_INFINITY;
  const currentAverage = current.averageTimeMs ?? Number.POSITIVE_INFINITY;
  if (candidateAverage !== currentAverage) return candidateAverage < currentAverage;
  return candidate.bestStreak > current.bestStreak;
}

export class InMemoryLeaderboardRepository implements LeaderboardRepository {
  private readonly entries = new Map<string, LeaderboardEntry>();

  async initialize(): Promise<void> {}

  async saveBest(input: LeaderboardScoreInput): Promise<LeaderboardSaveResult> {
    const key = this.entryKey(input.gameId, input.accountId);
    const existing = this.entries.get(key);
    if (existing && !isBetterLeaderboardScore(input, existing)) {
      return {
        status: 'not_improved',
        entry: this.rankEntry(existing),
      };
    }

    const now = new Date().toISOString();
    const entry: LeaderboardEntry = {
      id: existing?.id ?? randomUUID(),
      gameId: input.gameId,
      accountId: input.accountId,
      username: input.username,
      score: input.score,
      level: input.level,
      averageTimeMs: input.averageTimeMs,
      bestStreak: input.bestStreak,
      totalCorrect: input.totalCorrect,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.entries.set(key, entry);
    return {
      status: existing ? 'updated' : 'created',
      entry: this.rankEntry(entry),
    };
  }

  async list(input: {
    readonly gameId: LeaderboardGameId;
    readonly page: number;
    readonly pageSize: number;
    readonly sort: LeaderboardSort;
    readonly username?: string;
  }): Promise<LeaderboardPage> {
    const ranked = this.rankEntries(
      [...this.entries.values()].filter((entry) => entry.gameId === input.gameId),
    );
    const sorted = sortEntries(ranked, input.sort);
    const start = (input.page - 1) * input.pageSize;
    const searchUsername = input.username?.trim().toLowerCase();
    return {
      entries: sorted.slice(start, start + input.pageSize).map((entry) => structuredClone(entry)),
      searchResult: searchUsername
        ? (ranked.find((entry) => entry.username === searchUsername) ?? null)
        : null,
      page: input.page,
      pageSize: input.pageSize,
      total: ranked.length,
      sort: input.sort,
    };
  }

  async close(): Promise<void> {}

  private rankEntry(entry: LeaderboardEntry): RankedLeaderboardEntry {
    return this.rankEntries(
      [...this.entries.values()].filter((current) => current.gameId === entry.gameId),
    ).find((current) => current.id === entry.id)!;
  }

  private rankEntries(entries: readonly LeaderboardEntry[]): readonly RankedLeaderboardEntry[] {
    return [...entries]
      .sort(compareByOfficialRank)
      .map((entry, index) => ({ ...structuredClone(entry), rank: index + 1 }));
  }

  private entryKey(gameId: LeaderboardGameId, accountId: string): string {
    return `${gameId}:${accountId}`;
  }
}

export class PostgresLeaderboardRepository implements LeaderboardRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(urlOrPool: string | Pool) {
    this.pool =
      typeof urlOrPool === 'string' ? new Pool({ connectionString: urlOrPool }) : urlOrPool;
    this.ownsPool = typeof urlOrPool === 'string';
  }

  async initialize(): Promise<void> {
    await this.pool.query(LEADERBOARD_SCHEMA_SQL);
  }

  async saveBest(input: LeaderboardScoreInput): Promise<LeaderboardSaveResult> {
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const existingResult = await client.query(
        `SELECT entry.*, account.username
        FROM leaderboard_entries entry
        JOIN accounts account ON account.id = entry.account_id
        WHERE entry.game_id = $1 AND entry.account_id = $2
        FOR UPDATE`,
        [input.gameId, input.accountId],
      );
      const existing = existingResult.rowCount ? mapLeaderboardEntry(existingResult.rows[0]) : null;
      if (existing && !isBetterLeaderboardScore(input, existing)) {
        await client.query('COMMIT');
        committed = true;
        return {
          status: 'not_improved',
          entry: await this.findRankedEntry(existing.id),
        };
      }

      const savedResult = existing
        ? await client.query(
            `UPDATE leaderboard_entries
            SET
              score = $3,
              level = $4,
              average_time_ms = $5,
              best_streak = $6,
              total_correct = $7,
              updated_at = now()
            WHERE game_id = $1 AND account_id = $2
            RETURNING *`,
            [
              input.gameId,
              input.accountId,
              input.score,
              input.level,
              input.averageTimeMs,
              input.bestStreak,
              input.totalCorrect,
            ],
          )
        : await client.query(
            `INSERT INTO leaderboard_entries (
              id,
              game_id,
              account_id,
              score,
              level,
              average_time_ms,
              best_streak,
              total_correct
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
              randomUUID(),
              input.gameId,
              input.accountId,
              input.score,
              input.level,
              input.averageTimeMs,
              input.bestStreak,
              input.totalCorrect,
            ],
          );
      const saved = mapLeaderboardEntry({ ...savedResult.rows[0], username: input.username });
      await client.query('COMMIT');
      committed = true;
      return {
        status: existing ? 'updated' : 'created',
        entry: await this.findRankedEntry(saved.id),
      };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async list(input: {
    readonly gameId: LeaderboardGameId;
    readonly page: number;
    readonly pageSize: number;
    readonly sort: LeaderboardSort;
    readonly username?: string;
  }): Promise<LeaderboardPage> {
    const offset = (input.page - 1) * input.pageSize;
    const ordered = await this.pool.query(
      `WITH ranked AS (
        SELECT
          entry.*,
          account.username,
          row_number() OVER (
            PARTITION BY entry.game_id
            ORDER BY
              entry.score DESC,
              entry.level DESC,
              entry.average_time_ms ASC NULLS LAST,
              entry.best_streak DESC,
              entry.updated_at ASC,
              entry.id ASC
          ) AS rank
        FROM leaderboard_entries entry
        JOIN accounts account ON account.id = entry.account_id
        WHERE entry.game_id = $1
      )
      SELECT * FROM ranked
      ORDER BY ${sortSql(input.sort)}
      LIMIT $2 OFFSET $3`,
      [input.gameId, input.pageSize, offset],
    );
    const count = await this.pool.query(
      'SELECT count(*)::int AS total FROM leaderboard_entries WHERE game_id = $1',
      [input.gameId],
    );
    const searchResult = input.username
      ? await this.findByUsername(input.gameId, input.username.trim().toLowerCase())
      : null;
    return {
      entries: ordered.rows.map(mapRankedLeaderboardEntry),
      searchResult,
      page: input.page,
      pageSize: input.pageSize,
      total: count.rows[0]?.total ?? 0,
      sort: input.sort,
    };
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  private async findRankedEntry(id: string): Promise<RankedLeaderboardEntry> {
    const result = await this.pool.query(
      `WITH ranked AS (
        SELECT
          entry.*,
          account.username,
          row_number() OVER (
            PARTITION BY entry.game_id
            ORDER BY
              entry.score DESC,
              entry.level DESC,
              entry.average_time_ms ASC NULLS LAST,
              entry.best_streak DESC,
              entry.updated_at ASC,
              entry.id ASC
          ) AS rank
        FROM leaderboard_entries entry
        JOIN accounts account ON account.id = entry.account_id
      )
      SELECT * FROM ranked WHERE id = $1`,
      [id],
    );
    if (!result.rowCount) throw new Error('Leaderboard entry not found.');
    return mapRankedLeaderboardEntry(result.rows[0]);
  }

  private async findByUsername(
    gameId: LeaderboardGameId,
    username: string,
  ): Promise<RankedLeaderboardEntry | null> {
    const result = await this.pool.query(
      `WITH ranked AS (
        SELECT
          entry.*,
          account.username,
          row_number() OVER (
            PARTITION BY entry.game_id
            ORDER BY
              entry.score DESC,
              entry.level DESC,
              entry.average_time_ms ASC NULLS LAST,
              entry.best_streak DESC,
              entry.updated_at ASC,
              entry.id ASC
          ) AS rank
        FROM leaderboard_entries entry
        JOIN accounts account ON account.id = entry.account_id
        WHERE entry.game_id = $1
      )
      SELECT * FROM ranked WHERE username = $2`,
      [gameId, username],
    );
    return result.rowCount ? mapRankedLeaderboardEntry(result.rows[0]) : null;
  }
}

function sortEntries(
  entries: readonly RankedLeaderboardEntry[],
  sort: LeaderboardSort,
): readonly RankedLeaderboardEntry[] {
  const copy = [...entries];
  if (sort === 'level') {
    return copy.sort(
      (left, right) => right.level - left.level || compareByOfficialRank(left, right),
    );
  }
  if (sort === 'averageTime') {
    return copy.sort((left, right) => {
      const leftAverage = left.averageTimeMs ?? Number.POSITIVE_INFINITY;
      const rightAverage = right.averageTimeMs ?? Number.POSITIVE_INFINITY;
      return leftAverage - rightAverage || compareByOfficialRank(left, right);
    });
  }
  if (sort === 'bestStreak') {
    return copy.sort(
      (left, right) => right.bestStreak - left.bestStreak || compareByOfficialRank(left, right),
    );
  }
  return copy.sort(compareByOfficialRank);
}

function compareByOfficialRank(
  left: Pick<
    LeaderboardEntry,
    'score' | 'level' | 'averageTimeMs' | 'bestStreak' | 'updatedAt' | 'id'
  >,
  right: Pick<
    LeaderboardEntry,
    'score' | 'level' | 'averageTimeMs' | 'bestStreak' | 'updatedAt' | 'id'
  >,
): number {
  const leftAverage = left.averageTimeMs ?? Number.POSITIVE_INFINITY;
  const rightAverage = right.averageTimeMs ?? Number.POSITIVE_INFINITY;
  return (
    right.score - left.score ||
    right.level - left.level ||
    leftAverage - rightAverage ||
    right.bestStreak - left.bestStreak ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function sortSql(sort: LeaderboardSort): string {
  if (sort === 'level') {
    return 'level DESC, rank ASC';
  }
  if (sort === 'averageTime') {
    return 'average_time_ms ASC NULLS LAST, rank ASC';
  }
  if (sort === 'bestStreak') {
    return 'best_streak DESC, rank ASC';
  }
  return 'rank ASC';
}

function mapRankedLeaderboardEntry(row: Record<string, any>): RankedLeaderboardEntry {
  return {
    ...mapLeaderboardEntry(row),
    rank: Number(row['rank']),
  };
}

function mapLeaderboardEntry(row: Record<string, any>): LeaderboardEntry {
  return {
    id: row['id'],
    gameId: row['game_id'],
    accountId: row['account_id'],
    username: row['username'],
    score: Number(row['score']),
    level: Number(row['level']),
    averageTimeMs: row['average_time_ms'] === null ? null : Number(row['average_time_ms']),
    bestStreak: Number(row['best_streak']),
    totalCorrect: Number(row['total_correct']),
    createdAt: row['created_at'].toISOString(),
    updatedAt: row['updated_at'].toISOString(),
  };
}
