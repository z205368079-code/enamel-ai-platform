import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SqlExecutor {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<{ version: string }> }>;
}

export interface Migration {
  version: string;
  name: string;
  sql: string;
}

const MIGRATION_FILE = /^(\d+)_(.+)\.sql$/;

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const fileNames = await readdir(directory);
  const migrations = await Promise.all(
    fileNames.map(async (fileName) => {
      const match = MIGRATION_FILE.exec(fileName);
      if (match === null) return undefined;
      return {
        version: match[1],
        name: match[2],
        sql: await readFile(path.join(directory, fileName), 'utf8'),
      };
    }),
  );

  return migrations
    .filter((migration): migration is Migration => migration !== undefined)
    .sort((left, right) => left.version.localeCompare(right.version));
}

export async function runMigrations(
  executor: SqlExecutor,
  migrations: Migration[],
): Promise<string[]> {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const appliedRows = await executor.query(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(appliedRows.rows.map((row) => row.version));
  const executed: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await executor.query('BEGIN');
    try {
      await executor.query(migration.sql);
      await executor.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );
      await executor.query('COMMIT');
      executed.push(migration.version);
    } catch (error: unknown) {
      await executor.query('ROLLBACK');
      throw error;
    }
  }

  return executed;
}
