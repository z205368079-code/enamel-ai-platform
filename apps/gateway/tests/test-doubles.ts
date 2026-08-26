import type { ChatwootClient } from '../src/clients/chatwoot-client.js';
import type { ConversationUpsertInput } from '../src/domain/conversation.js';
import type { Logger } from '../src/logging/logger.js';
import type { ConversationRepository } from '../src/repositories/conversation-repository.js';

export class InMemoryConversationRepository implements ConversationRepository {
  readonly inputs: ConversationUpsertInput[] = [];

  async upsert(input: ConversationUpsertInput): Promise<void> {
    this.inputs.push(input);
  }
}

export class RecordingChatwootClient implements ChatwootClient {
  readonly inputs: Array<{ conversationId: string; content: string }> = [];

  async sendConversationMessage(input: {
    conversationId: string;
    content: string;
  }): Promise<{ latencyMs: number }> {
    this.inputs.push(input);
    return { latencyMs: 12 };
  }
}

export class RecordingLogger implements Logger {
  readonly infoEntries: Array<Record<string, unknown>> = [];
  readonly errorEntries: Array<Record<string, unknown>> = [];

  info(context: Record<string, unknown>): void {
    this.infoEntries.push(context);
  }

  error(context: Record<string, unknown>): void {
    this.errorEntries.push(context);
  }
}
