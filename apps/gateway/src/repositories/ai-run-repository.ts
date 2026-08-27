import { Pool } from 'pg';

import type { AiRunInput } from '../domain/ai-run.js';

export interface AiRunRepository {
  record(input: AiRunInput): Promise<void>;
}

export class PostgresAiRunRepository implements AiRunRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async record(input: AiRunInput): Promise<void> {
    const result = await this.pool.query(
      `
        INSERT INTO ai_runs (
          conversation_id,
          message_id,
          question,
          answer,
          status,
          latency_ms,
          error_code
        )
        SELECT id, $2, $3, $4, $5, $6, $7
        FROM conversations
        WHERE chatwoot_conversation_id = $1
      `,
      [
        input.chatwootConversationId,
        input.messageId,
        input.question,
        input.answer,
        input.status,
        input.latencyMs,
        input.errorCode,
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error('Conversation must exist before an AI run is recorded.');
    }
  }
}

export class NoopAiRunRepository implements AiRunRepository {
  async record(): Promise<void> {
    // Used only when DATABASE_URL is unavailable; the webhook will already fail persistence.
  }
}
