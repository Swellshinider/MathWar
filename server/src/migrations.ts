import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export async function runMigrations(
  connectionString: string,
  migrationsDirectory: string,
): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: createDatabaseSslConfig(),
  });
  try {
    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();
    if (filenames.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `create table if not exists public.schema_migrations (
          filename text primary key,
          applied_at timestamptz not null default now()
        )`,
      );
      const applied = await client.query<{ filename: string }>(
        'select filename from public.schema_migrations',
      );
      const appliedFilenames = new Set(applied.rows.map((row) => row.filename));

      for (const filename of filenames) {
        if (appliedFilenames.has(filename)) continue;
        const sql = await readFile(join(migrationsDirectory, filename), 'utf8');
        await client.query(sql);
        await client.query('insert into public.schema_migrations(filename) values ($1)', [
          filename,
        ]);
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export function createDatabaseSslConfig(): false | { rejectUnauthorized: boolean } {
  const sslEnabled = process.env['DATABASE_SSL'] === 'true';
  if (!sslEnabled) return false;
  return {
    rejectUnauthorized: process.env['DATABASE_SSL_REJECT_UNAUTHORIZED'] !== 'false',
  };
}
