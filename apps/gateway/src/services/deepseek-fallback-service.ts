import {
  DeepSeekClientError,
  type DeepSeekClient,
} from '../clients/deepseek-client.js';
import { KNOWLEDGE_ANSWER_STATUS } from '../domain/ai-run.js';
import type { Logger } from '../logging/logger.js';
import type { AiRunRepository } from '../repositories/ai-run-repository.js';
import type {
  KnowledgeAnswerInput,
  KnowledgeAnswerResult,
} from './knowledge-answer-service.js';

export class DeepSeekFallbackService {
  constructor(
    private readonly client: DeepSeekClient,
    private readonly aiRuns: AiRunRepository,
    private readonly logger: Logger,
  ) {}

  async answerFor(
    input: KnowledgeAnswerInput,
  ): Promise<KnowledgeAnswerResult | undefined> {
    try {
      const result = await this.client.answer({ question: input.question });
      await this.aiRuns.record({
        chatwootConversationId: input.chatwootConversationId,
        messageId: input.messageId,
        question: input.question,
        answer: result.answer,
        status: KNOWLEDGE_ANSWER_STATUS.SUCCESS,
        latencyMs: result.latencyMs,
        errorCode: null,
      });
      this.logger.info(
        {
          provider: 'deepseek',
          conversationId: input.chatwootConversationId,
          messageId: input.messageId,
          latencyMs: result.latencyMs,
          processingResult: 'fallback_success',
        },
        'DeepSeek fallback answer processed.',
      );
      return {
        status: KNOWLEDGE_ANSWER_STATUS.SUCCESS,
        answer: result.answer,
        provider: 'deepseek',
        latencyMs: result.latencyMs,
        errorCode: null,
      };
    } catch (error: unknown) {
      this.logger.error(
        {
          provider: 'deepseek',
          conversationId: input.chatwootConversationId,
          messageId: input.messageId,
          errorCode:
            error instanceof DeepSeekClientError ? error.code : 'UNKNOWN_ERROR',
          processingResult: 'fallback_failed',
        },
        'DeepSeek fallback failed.',
      );
      return undefined;
    }
  }
}
