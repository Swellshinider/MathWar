import { MatchState } from '@math-war/game-engine';
import pg from 'pg';
import { MatchRepository, UpdateResult } from './repository.js';

const { Pool } = pg;

export class PostgresMatchRepository implements MatchRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      create table if not exists multiplayer_matches (
        id uuid primary key,
        room_code varchar(8) not null unique,
        state jsonb not null,
        version integer not null,
        status varchar(16) not null,
        updated_at timestamptz not null
      );
      create table if not exists multiplayer_commands (
        match_id uuid not null references multiplayer_matches(id) on delete cascade,
        command_id uuid not null,
        created_at timestamptz not null default now(),
        primary key (match_id, command_id)
      );
      create index if not exists multiplayer_matches_status_idx
        on multiplayer_matches(status, updated_at);
    `);
  }

  async create(state: MatchState, commandId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into multiplayer_matches(id, room_code, state, version, status, updated_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [state.id, state.roomCode, state, state.version, state.status, state.updatedAt],
      );
      await client.query('insert into multiplayer_commands(match_id, command_id) values ($1, $2)', [
        state.id,
        commandId,
      ]);
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') return false;
      throw error;
    } finally {
      client.release();
    }
  }

  private async find(where: string, value: string): Promise<MatchState | null> {
    const result = await this.pool.query(
      `select state from multiplayer_matches where ${where} = $1 limit 1`,
      [value],
    );
    return (result.rows[0]?.state as MatchState | undefined) ?? null;
  }

  findByCode(roomCode: string): Promise<MatchState | null> {
    return this.find('room_code', roomCode);
  }
  findById(id: string): Promise<MatchState | null> {
    return this.find('id', id);
  }

  async findActiveByUser(userId: string): Promise<MatchState | null> {
    const result = await this.pool.query(
      `select state from multiplayer_matches
       where status <> 'ended' and state->'players' @> $1::jsonb order by updated_at desc limit 1`,
      [JSON.stringify([{ userId }])],
    );
    return (result.rows[0]?.state as MatchState | undefined) ?? null;
  }

  async update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MatchState) => MatchState,
  ): Promise<UpdateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const command = await client.query(
        `insert into multiplayer_commands(match_id, command_id) values ($1, $2)
         on conflict do nothing returning command_id`,
        [id, commandId],
      );
      if (command.rowCount === 0) {
        await client.query('rollback');
        return { ok: false, reason: 'duplicate' };
      }
      const selected = await client.query(
        'select state, version from multiplayer_matches where id = $1 for update',
        [id],
      );
      if (selected.rowCount === 0) {
        await client.query('rollback');
        return { ok: false, reason: 'missing' };
      }
      if (selected.rows[0].version !== expectedVersion) {
        await client.query('rollback');
        return { ok: false, reason: 'stale' };
      }
      const state = transform(selected.rows[0].state as MatchState);
      await client.query(
        `update multiplayer_matches set state = $2, version = $3, status = $4, updated_at = $5
         where id = $1`,
        [id, state, state.version, state.status, state.updatedAt],
      );
      await client.query('commit');
      return { ok: true, state };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listExpiredReconnects(now: Date): Promise<readonly MatchState[]> {
    const result = await this.pool.query(
      `select state from multiplayer_matches where status = 'paused'
       and (state->>'reconnectDeadline')::timestamptz <= $1`,
      [now],
    );
    return result.rows.map((row) => row.state as MatchState);
  }

  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    const result = await this.pool.query(
      `delete from multiplayer_matches where status = 'ended' and updated_at < $1`,
      [cutoff],
    );
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
