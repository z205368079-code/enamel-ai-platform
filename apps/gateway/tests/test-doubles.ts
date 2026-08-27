import type { ChatwootClient } from '../src/clients/chatwoot-client.js';
import type { MaxKBAnswer, MaxKBClient } from '../src/clients/maxkb-client.js';
import type {
  DeepSeekAnswer,
  DeepSeekClient,
} from '../src/clients/deepseek-client.js';
import type { AiRunInput } from '../src/domain/ai-run.js';
import type { ConversationUpsertInput } from '../src/domain/conversation.js';
import {
  CONVERSATION_MODE,
  type ConversationState,
} from '../src/domain/conversation.js';
import type {
  HandoffReason,
  HandoffTriggeredBy,
} from '../src/domain/handoff.js';
import type { Logger } from '../src/logging/logger.js';
import type { ConversationRepository } from '../src/repositories/conversation-repository.js';
import type { AiRunRepository } from '../src/repositories/ai-run-repository.js';
import type { WebhookMessageRepository } from '../src/repositories/webhook-message-repository.js';

export class InMemoryConversationRepository implements ConversationRepository {
  readonly inputs: ConversationUpsertInput[] = [];
  readonly maxkbChatIds = new Map<string, string>();
  readonly states = new Map<string, ConversationState>();
  readonly handoffs: Array<{ conversationId: string; reason: HandoffReason }> =
    [];

  async upsert(input: ConversationUpsertInput): Promise<void> {
    this.inputs.push(input);
    if (!this.states.has(input.chatwootConversationId))
      this.states.set(input.chatwootConversationId, {
        mode: CONVERSATION_MODE.AI,
        consecutiveAiFailures: 0,
      });
  }

  async getState(conversationId: string): Promise<ConversationState> {
    return (
      this.states.get(conversationId) ?? {
        mode: CONVERSATION_MODE.AI,
        consecutiveAiFailures: 0,
      }
    );
  }
  async handoff(
    conversationId: string,
    reason: HandoffReason,
    _triggeredBy: HandoffTriggeredBy,
  ): Promise<boolean> {
    void _triggeredBy;
    const state = await this.getState(conversationId);
    if (state.mode === CONVERSATION_MODE.HUMAN) return false;
    this.states.set(conversationId, {
      ...state,
      mode: CONVERSATION_MODE.HUMAN,
    });
    this.handoffs.push({ conversationId, reason });
    return true;
  }
  async recordAiOutcome(
    conversationId: string,
    succeeded: boolean,
    threshold: number,
  ): Promise<{ failureCount: number; handoff: boolean }> {
    const state = await this.getState(conversationId);
    const failureCount = succeeded ? 0 : state.consecutiveAiFailures + 1;
    this.states.set(conversationId, {
      ...state,
      consecutiveAiFailures: failureCount,
    });
    return { failureCount, handoff: !succeeded && failureCount >= threshold };
  }
  async resumeAi(conversationId: string): Promise<boolean> {
    const state = await this.getState(conversationId);
    if (state.mode !== CONVERSATION_MODE.HUMAN) return false;
    this.states.set(conversationId, {
      mode: CONVERSATION_MODE.AI,
      consecutiveAiFailures: 0,
    });
    return true;
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

  private sessionQueue = Promise.resolve();

  async withMaxKBSession<T>(
    chatwootConversationId: string,
    operation: (
      maxkbChatId: string | undefined,
    ) => Promise<{ value: T; nextMaxKBChatId?: string | undefined }>,
  ): Promise<T> {
    const previous = this.sessionQueue;
    let release: () => void = () => undefined;
    this.sessionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const result = await operation(
        this.maxkbChatIds.get(chatwootConversationId),
      );
      if (result.nextMaxKBChatId !== undefined) {
        this.maxkbChatIds.set(chatwootConversationId, result.nextMaxKBChatId);
      }
      return result.value;
    } finally {
      release();
    }
  }
}

export class InMemoryWebhookMessageRepository implements WebhookMessageRepository {
  readonly messageIds = new Set<string>();

  async claim(messageId: string): Promise<boolean> {
    if (this.messageIds.has(messageId)) return false;
    this.messageIds.add(messageId);
    return true;
  }

  async release(messageId: string): Promise<void> {
    this.messageIds.delete(messageId);
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

export class RecordingDeepSeekClient implements DeepSeekClient {
  readonly inputs: Array<{ question: string }> = [];

  constructor(
    private readonly result: DeepSeekAnswer = {
      answer: '来自 DeepSeek 的通用建议。',
      latencyMs: 9,
    },
  ) {}

  async answer(input: { question: string }): Promise<DeepSeekAnswer> {
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
  readonly markedConversations: string[] = [];
  async markConversationForHumanHandoff(conversationId: string): Promise<void> {
    this.markedConversations.push(conversationId);
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
