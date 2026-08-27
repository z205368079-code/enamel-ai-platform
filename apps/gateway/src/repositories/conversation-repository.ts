import { Pool } from 'pg';

import {
  CONVERSATION_MODE,
  type ConversationState,
  type ConversationUpsertInput,
} from '../domain/conversation.js';
import type { HandoffReason, HandoffTriggeredBy } from '../domain/handoff.js';
import { ConfigurationError } from '../errors.js';

export interface ConversationRepository {
  upsert(input: ConversationUpsertInput): Promise<void>;
  getMaxKBChatId(chatwootConversationId: string): Promise<string | undefined>;
  setMaxKBChatId(
    chatwootConversationId: string,
    maxkbChatId: string,
  ): Promise<void>;
  withMaxKBSession<T>(
    chatwootConversationId: string,
    operation: (
      maxkbChatId: string | undefined,
    ) => Promise<{ value: T; nextMaxKBChatId?: string | undefined }>,
  ): Promise<T>;
  getState(chatwootConversationId: string): Promise<ConversationState>;
  handoff(
    chatwootConversationId: string,
    reason: HandoffReason,
    triggeredBy: HandoffTriggeredBy,
  ): Promise<boolean>;
  recordAiOutcome(
    chatwootConversationId: string,
    succeeded: boolean,
    threshold: number,
  ): Promise<{ failureCount: number; handoff: boolean }>;
  resumeAi(chatwootConversationId: string): Promise<boolean>;
}

export class PostgresConversationRepository implements ConversationRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async upsert(input: ConversationUpsertInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO conversations (chatwoot_conversation_id, contact_id, mode)
        VALUES ($1, $2, $3)
        ON CONFLICT (chatwoot_conversation_id)
        DO UPDATE SET
          contact_id = EXCLUDED.contact_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [input.chatwootConversationId, input.contactId, input.mode],
    );
  }

  async getState(chatwootConversationId: string): Promise<ConversationState> {
    const result = await this.pool.query<{
      mode: ConversationState['mode'];
      consecutive_ai_failures: number;
    }>(
      `SELECT mode, consecutive_ai_failures
       FROM conversations WHERE chatwoot_conversation_id = $1`,
      [chatwootConversationId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Conversation must exist.');
    return {
      mode: row.mode,
      consecutiveAiFailures: row.consecutive_ai_failures,
    };
  }

  async handoff(
    chatwootConversationId: string,
    reason: HandoffReason,
    triggeredBy: HandoffTriggeredBy,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ id: string }>(
        `UPDATE conversations SET mode = $2, updated_at = CURRENT_TIMESTAMP
         WHERE chatwoot_conversation_id = $1 AND mode = $3 RETURNING id`,
        [chatwootConversationId, CONVERSATION_MODE.HUMAN, CONVERSATION_MODE.AI],
      );
      const row = updated.rows[0];
      if (row === undefined) {
        await client.query('COMMIT');
        return false;
      }
      await client.query(
        `INSERT INTO handoff_events (conversation_id, reason, triggered_by)
         VALUES ($1, $2, $3)`,
        [row.id, reason, triggeredBy],
      );
      await client.query('COMMIT');
      return true;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAiOutcome(
    chatwootConversationId: string,
    succeeded: boolean,
    threshold: number,
  ): Promise<{ failureCount: number; handoff: boolean }> {
    const result = await this.pool.query<{
      consecutive_ai_failures: number;
      mode: ConversationState['mode'];
    }>(
      `UPDATE conversations
       SET consecutive_ai_failures = CASE WHEN $2 THEN 0 ELSE consecutive_ai_failures + 1 END,
           updated_at = CURRENT_TIMESTAMP
       WHERE chatwoot_conversation_id = $1
       RETURNING consecutive_ai_failures, mode`,
      [chatwootConversationId, succeeded],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Conversation must exist.');
    if (
      !succeeded &&
      row.mode === CONVERSATION_MODE.AI &&
      row.consecutive_ai_failures >= threshold
    ) {
      return { failureCount: row.consecutive_ai_failures, handoff: true };
    }
    return { failureCount: row.consecutive_ai_failures, handoff: false };
  }

  async resumeAi(chatwootConversationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE conversations SET mode = $2, consecutive_ai_failures = 0,
         updated_at = CURRENT_TIMESTAMP
       WHERE chatwoot_conversation_id = $1 AND mode = $3`,
      [chatwootConversationId, CONVERSATION_MODE.AI, CONVERSATION_MODE.HUMAN],
    );
    return result.rowCount === 1;
  }

  async getMaxKBChatId(
    chatwootConversationId: string,
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ maxkb_chat_id: string | null }>(
      'SELECT maxkb_chat_id FROM conversations WHERE chatwoot_conversation_id = $1',
      [chatwootConversationId],
    );
    return result.rows[0]?.maxkb_chat_id ?? undefined;
  }

  async setMaxKBChatId(
    chatwootConversationId: string,
    maxkbChatId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE conversations
       SET maxkb_chat_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE chatwoot_conversation_id = $1`,
      [chatwootConversationId, maxkbChatId],
    );
  }

  async withMaxKBSession<T>(
    chatwootConversationId: string,
    operation: (
      maxkbChatId: string | undefined,
    ) => Promise<{ value: T; nextMaxKBChatId?: string | undefined }>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        chatwootConversationId,
      ]);
      const current = await client.query<{ maxkb_chat_id: string | null }>(
        'SELECT maxkb_chat_id FROM conversations WHERE chatwoot_conversation_id = $1',
        [chatwootConversationId],
      );
      const operationResult = await operation(
        current.rows[0]?.maxkb_chat_id ?? undefined,
      );
      if (operationResult.nextMaxKBChatId !== undefined) {
        await client.query(
          `UPDATE conversations
           SET maxkb_chat_id = $2, updated_at = CURRENT_TIMESTAMP
           WHERE chatwoot_conversation_id = $1`,
          [chatwootConversationId, operationResult.nextMaxKBChatId],
        );
      }
      await client.query('COMMIT');
      return operationResult.value;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export class UnavailableConversationRepository implements ConversationRepository {
  async upsert(): Promise<void> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }

  async getMaxKBChatId(): Promise<string | undefined> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }

  async setMaxKBChatId(): Promise<void> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }

  async withMaxKBSession<T>(): Promise<T> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }

  async getState(): Promise<ConversationState> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
  async handoff(): Promise<boolean> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
  async recordAiOutcome(): Promise<{ failureCount: number; handoff: boolean }> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
  async resumeAi(): Promise<boolean> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
}
