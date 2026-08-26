import type { ChatwootClient } from '../src/clients/chatwoot-client.js';
import type { MaxKBAnswer, MaxKBClient } from '../src/clients/maxkb-client.js';
import type { AiRunInput } from '../src/domain/ai-run.js';
import type { ConversationUpsertInput } from '../src/domain/conversation.js';
import type { Logger } from '../src/logging/logger.js';
import type { ConversationRepository } from '../src/repositories/conversation-repository.js';
import type { AiRunRepository } from '../src/repositories/ai-run-repository.js';

export class InMemoryConversationRepository implements ConversationRepository {
  readonly inputs: ConversationUpsertInput[] = [];
  readonly maxkbChatIds = new Map<string, string>();

  async upsert(input: ConversationUpsertInput): Promise<void> {
    this.inputs.push(input);
  }

  async getMaxKBChatId(
    chatwootConversationId: string,
  ): Promise<string | undefined> {
    return this.maxkbChatIds.get(chatwootConversationId);
  }

  async setMaxKBChatId(
    chatwootConversationId: string,
    maxkbChatId: string,
  ): Promise<void> {
    this.maxkbChatIds.set(chatwootConversationId, maxkbChatId);
  }
}

export class InMemoryAiRunRepository implements AiRunRepository {
  readonly inputs: AiRunInput[] = [];

  async record(input: AiRunInput): Promise<void> {
    this.inputs.push(input);
  }
}

export class RecordingMaxKBClient implements MaxKBClient {
  readonly inputs: Array<{ question: string; maxkbChatId?: string }> = [];

  constructor(
    private readonly result: MaxKBAnswer = {
      answer: '来自 MaxKB 的知识库回答。',
      latencyMs: 8,
      maxkbChatId: 'maxkb-chat-001',
    },
  ) {}

  async answer(input: {
    question: string;
    maxkbChatId?: string;
  }): Promise<MaxKBAnswer> {
    this.inputs.push(input);
    return this.result;
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
