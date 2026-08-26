import { Pool } from 'pg';

import type { ConversationUpsertInput } from '../domain/conversation.js';
import { ConfigurationError } from '../errors.js';

export interface ConversationRepository {
  upsert(input: ConversationUpsertInput): Promise<void>;
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
}

export class UnavailableConversationRepository implements ConversationRepository {
  async upsert(): Promise<void> {
    throw new ConfigurationError(
      'DATABASE_URL is required for webhook processing.',
    );
  }
}
