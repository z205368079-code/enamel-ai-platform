import { Pool } from 'pg';

import type { ConversationUpsertInput } from '../domain/conversation.js';
import { ConfigurationError } from '../errors.js';

export interface ConversationRepository {
  upsert(input: ConversationUpsertInput): Promise<void>;
  getMaxKBChatId(chatwootConversationId: string): Promise<string | undefined>;
  setMaxKBChatId(
    chatwootConversationId: string,
    maxkbChatId: string,
  ): Promise<void>;
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
          mode = EXCLUDED.mode,
          updated_at = CURRENT_TIMESTAMP
      `,
      [input.chatwootConversationId, input.contactId, input.mode],
    );
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
}
