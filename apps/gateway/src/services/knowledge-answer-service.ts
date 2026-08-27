import {
  KNOWLEDGE_ANSWER_STATUS,
  type KnowledgeAnswerStatus,
} from '../domain/ai-run.js';
import { MaxKBClientError, type MaxKBClient } from '../clients/maxkb-client.js';
import type { Logger } from '../logging/logger.js';
import type { AiRunRepository } from '../repositories/ai-run-repository.js';

const SAFE_FALLBACK =
  '暂时无法从知识库中找到可靠答案，请稍后重试或联系人工客服。';

export interface KnowledgeAnswerInput {
  chatwootConversationId: string;
  messageId: string;
  question: string;
  maxkbChatId?: string | undefined;
}

export interface KnowledgeAnswerResult {
  status: KnowledgeAnswerStatus;
  answer: string;
  provider: 'maxkb' | 'deepseek';
  latencyMs: number | null;
  errorCode: string | null;
  maxkbChatId?: string | undefined;
}

export class KnowledgeAnswerService {
  constructor(
    private readonly maxkbClient: MaxKBClient,
    private readonly aiRunRepository: AiRunRepository,
    private readonly logger: Logger,
  ) {}

  async answerFor(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult> {
    let status: KnowledgeAnswerStatus = KNOWLEDGE_ANSWER_STATUS.UNKNOWN_ERROR;
    let answer: string | null = null;
    let latencyMs: number | null = null;
    let errorCode: string | null = null;

    try {
      const request = {
        question: input.question,
        ...(input.maxkbChatId === undefined
          ? {}
          : { maxkbChatId: input.maxkbChatId }),
      };
      const result = await this.maxkbClient.answer(request);
      latencyMs = result.latencyMs;
      if (
        result.answer === null ||
        result.answer.trim().toUpperCase() === KNOWLEDGE_ANSWER_STATUS.NO_ANSWER
      ) {
        status = KNOWLEDGE_ANSWER_STATUS.NO_ANSWER;
        errorCode = KNOWLEDGE_ANSWER_STATUS.NO_ANSWER;
      } else {
        status = KNOWLEDGE_ANSWER_STATUS.SUCCESS;
        answer = result.answer;
        return await this.recordAndReturn(input, {
          status,
          answer,
          latencyMs,
          errorCode,
          maxkbChatId: result.maxkbChatId,
        });
      }
    } catch (error: unknown) {
      if (error instanceof MaxKBClientError) {
        status = error.code;
        latencyMs = error.latencyMs;
        errorCode = error.code;
      } else {
        errorCode = KNOWLEDGE_ANSWER_STATUS.UNKNOWN_ERROR;
      }
    }

    return this.recordAndReturn(input, {
      status,
      answer,
      latencyMs,
      errorCode,
    });
  }

  private async recordAndReturn(
    input: KnowledgeAnswerInput,
    result: Omit<KnowledgeAnswerResult, 'provider' | 'answer'> & {
      answer: string | null;
    },
  ): Promise<KnowledgeAnswerResult> {
    await this.aiRunRepository.record({
      ...input,
      answer: result.answer,
      status: result.status,
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
    });

    this.logger.info(
      {
        provider: 'maxkb',
        conversationId: input.chatwootConversationId,
        messageId: input.messageId,
        knowledgeStatus: result.status,
        latencyMs: result.latencyMs,
        errorCode: result.errorCode,
      },
      'Knowledge answer processed.',
    );

    return {
      status: result.status,
      answer: result.answer ?? SAFE_FALLBACK,
      provider: 'maxkb',
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
      maxkbChatId: result.maxkbChatId,
    };
  }
}
