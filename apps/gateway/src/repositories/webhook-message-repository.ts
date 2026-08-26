import { Pool } from 'pg';

import { ConfigurationError } from '../errors.js';

export interface WebhookMessageRepository {
  claim(messageId: string, conversationId: string): Promise<boolean>;
  release(messageId: string): Promise<void>;
}

export class PostgresWebhookMessageRepository implements WebhookMessageRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async claim(messageId: string, conversationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO processed_webhook_messages (
         message_id,
         chatwoot_conversation_id
       ) VALUES ($1, $2)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING message_id`,
      [messageId, conversationId],
    );
    return result.rowCount === 1;
  }

  async release(messageId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM processed_webhook_messages WHERE message_id = $1',
      [messageId],
    );
  }
}

export class UnavailableWebhookMessageRepository implements WebhookMessageRepository {
  async claim(): Promise<boolean> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }

  async release(): Promise<void> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
}
