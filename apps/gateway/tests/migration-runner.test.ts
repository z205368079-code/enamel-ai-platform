import { describe, expect, it } from 'vitest';

import {
  runMigrations,
  type Migration,
  type SqlExecutor,
} from '../src/db/migration-runner.js';

class FakeExecutor implements SqlExecutor {
  readonly executedSql: string[] = [];

  constructor(private readonly appliedVersions: string[]) {}

  async query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<{ version: string }> }> {
    this.executedSql.push(text);
    if (text.includes('SELECT version FROM schema_migrations')) {
      return { rows: this.appliedVersions.map((version) => ({ version })) };
    }
    if (text.includes('INSERT INTO schema_migrations')) {
      const version = values?.[0];
      if (typeof version === 'string') this.appliedVersions.push(version);
    }
    return { rows: [] };
  }
}

const migrations: Migration[] = [
  {
    version: '001',
    name: 'create_conversations',
    sql: 'CREATE TABLE conversations',
  },
  {
    version: '002',
    name: 'add_maxkb_and_ai_runs',
    sql: 'ALTER TABLE conversations ADD COLUMN maxkb_chat_id; CREATE TABLE ai_runs',
  },
  {
    version: '003',
    name: 'add_webhook_idempotency',
    sql: 'CREATE TABLE processed_webhook_messages',
  },
];

describe('migration runner', () => {
  it('upgrades a Phase 1 schema by applying only later versions', async () => {
    const executor = new FakeExecutor(['001']);

    await expect(runMigrations(executor, migrations)).resolves.toEqual([
      '002',
      '003',
    ]);
    expect(executor.executedSql.join('\n')).toContain(
      'ADD COLUMN maxkb_chat_id',
    );
    expect(executor.executedSql.join('\n')).toContain('CREATE TABLE ai_runs');
  });

  it('does not repeat already recorded migrations', async () => {
    const executor = new FakeExecutor(['001', '002', '003']);

    await expect(runMigrations(executor, migrations)).resolves.toEqual([]);
    expect(executor.executedSql.join('\n')).not.toContain(
      'CREATE TABLE ai_runs',
    );
  });
});
