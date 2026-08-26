import 'dotenv/config';

import path from 'node:path';
import { Pool } from 'pg';

import { getOptionalDatabaseUrl } from '../config/env.js';
import { loadMigrations, runMigrations } from '../db/migration-runner.js';

const databaseUrl = getOptionalDatabaseUrl();
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const migrationsDirectory =
  process.env.MIGRATIONS_DIR ??
  path.resolve(import.meta.dirname, '../../../../infra/postgres/migrations');
const pool = new Pool({ connectionString: databaseUrl });

try {
  const executed = await runMigrations(
    pool,
    await loadMigrations(migrationsDirectory),
  );
  console.info(
    JSON.stringify({
      event: 'migrations_completed',
      executedVersions: executed,
    }),
  );
} finally {
  await pool.end();
}
