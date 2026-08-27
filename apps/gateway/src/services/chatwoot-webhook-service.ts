import type { ChatwootClient } from '../clients/chatwoot-client.js';
import { CONVERSATION_MODE } from '../domain/conversation.js';
import type { IncomingChatwootMessage } from '../domain/chatwoot.js';
import { WebhookValidationError } from '../errors.js';
import type { Logger } from '../logging/logger.js';
import type { ConversationRepository } from '../repositories/conversation-repository.js';
import type { WebhookMessageRepository } from '../repositories/webhook-message-repository.js';
import type { KnowledgeAnswerService } from './knowledge-answer-service.js';
import { HumanHandoffService } from './human-handoff-service.js';
import type { AnalyticsService } from './analytics-service.js';
import type { DeepSeekFallbackService } from './deepseek-fallback-service.js';

export interface WebhookProcessingResult {
  status: 'processed' | 'ignored';
  reason?: string;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function getNestedIdentifier(
  payload: RecordValue,
  parentKey: string,
  childKey: string,
): string | undefined {
  const parent = payload[parentKey];
  return isRecord(parent) ? getIdentifier(parent[childKey]) : undefined;
}

function getSenderType(payload: RecordValue): string | undefined {
  const directValue = getText(payload.sender_type);
  if (directValue !== undefined) {
    return directValue.toLowerCase();
  }

  const sender = payload.sender;
  return isRecord(sender) ? getText(sender.type)?.toLowerCase() : undefined;
}

export function parseIncomingChatwootMessage(
  payload: unknown,
): IncomingChatwootMessage | WebhookProcessingResult {
  if (!isRecord(payload)) {
    throw new WebhookValidationError('Webhook body must be a JSON object.');
  }

  const eventType = getText(payload.event);
  if (eventType === undefined) {
    throw new WebhookValidationError('Webhook event is required.');
  }

  if (eventType !== 'message_created') {
    return { status: 'ignored', reason: 'event_not_target' };
  }

  if (getText(payload.message_type)?.toLowerCase() !== 'incoming') {
    return { status: 'ignored', reason: 'message_not_incoming' };
  }

  const senderType = getSenderType(payload);
  if (senderType === 'bot' || senderType === 'system') {
    return { status: 'ignored', reason: 'sender_not_customer' };
  }

  if (getText(payload.content_type)?.toLowerCase() !== 'text') {
    return { status: 'ignored', reason: 'message_not_text' };
  }

  const content = getText(payload.content);
  const conversationId =
    getNestedIdentifier(payload, 'conversation', 'id') ??
    getIdentifier(payload.conversation_id);
  const contactId =
    getNestedIdentifier(payload, 'sender', 'id') ??
    getNestedIdentifier(payload, 'contact', 'id') ??
    getNestedIdentifier(payload, 'conversation', 'contact_id');
  const messageId = getIdentifier(payload.id);

  if (
    content === undefined ||
    conversationId === undefined ||
    contactId === undefined ||
    messageId === undefined
  ) {
    throw new WebhookValidationError(
      'Incoming text message is missing a required identifier or content.',
    );
  }

  return {
    eventType: 'message_created',
    conversationId,
    contactId,
    messageId,
    content,
  };
}

export class ChatwootWebhookService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly webhookMessageRepository: WebhookMessageRepository,
    private readonly knowledgeAnswerService: KnowledgeAnswerService,
    private readonly handoffService: HumanHandoffService,
    private readonly chatwootClient: ChatwootClient,
    private readonly logger: Logger,
    private readonly analyticsService?: AnalyticsService,
    private readonly deepSeekFallbackService?: DeepSeekFallbackService,
  ) {}

  async process(payload: unknown): Promise<WebhookProcessingResult> {
    const parsed = parseIncomingChatwootMessage(payload);
    if ('status' in parsed) {
      this.logger.info(
        {
          eventType: isRecord(payload) ? payload.event : undefined,
          processingResult: parsed.reason,
        },
        'Chatwoot webhook ignored.',
      );
      return parsed;
    }

    const claimed = await this.webhookMessageRepository.claim(
      parsed.messageId,
      parsed.conversationId,
    );
    if (!claimed) {
      this.logger.info(
        {
          eventType: parsed.eventType,
          conversationId: parsed.conversationId,
          messageId: parsed.messageId,
          processingResult: 'duplicate_message',
        },
        'Chatwoot webhook duplicate ignored.',
      );
      return { status: 'ignored', reason: 'duplicate_message' };
    }

    try {
      await this.conversationRepository.upsert({
        chatwootConversationId: parsed.conversationId,
        contactId: parsed.contactId,
        mode: CONVERSATION_MODE.AI,
      });

      const state = await this.conversationRepository.getState(
        parsed.conversationId,
      );
      const initialDecision = this.handoffService.routeBeforeAi(
        state,
        parsed.content,
      );
      if (initialDecision === 'ALREADY_HUMAN')
        return { status: 'ignored', reason: 'already_human' };
      if (initialDecision !== 'CONTINUE_AI') {
        const transitioned = await this.handoffService.handoff(
          parsed.conversationId,
          initialDecision,
        );
        if (transitioned)
          await this.chatwootClient.sendConversationMessage({
            conversationId: parsed.conversationId,
            content: '这个问题暂时无法从知识库中确认，我已为您转接人工客服。',
          });
        return { status: 'processed' };
      }

      const knowledgeAnswer =
        await this.conversationRepository.withMaxKBSession(
          parsed.conversationId,
          async (maxkbChatId) => {
            const maxkbAnswer = await this.knowledgeAnswerService.answerFor({
              chatwootConversationId: parsed.conversationId,
              messageId: parsed.messageId,
              question: parsed.content,
              maxkbChatId,
            });
            const fallbackAnswer =
              maxkbAnswer.status === 'NO_ANSWER'
                ? await this.deepSeekFallbackService?.answerFor({
                    chatwootConversationId: parsed.conversationId,
                    messageId: parsed.messageId,
                    question: parsed.content,
                  })
                : undefined;
            return {
              value: fallbackAnswer ?? maxkbAnswer,
              nextMaxKBChatId: maxkbAnswer.maxkbChatId,
            };
          },
        );

      const afterAiDecision = await this.handoffService.routeAfterAi(
        parsed.conversationId,
        knowledgeAnswer,
      );
      if (afterAiDecision !== 'CONTINUE_AI') {
        if (afterAiDecision === 'HANDOFF_NO_ANSWER')
          await this.analyticsService?.recordNoAnswer(
            parsed.conversationId,
            parsed.messageId,
          );
        const transitioned = await this.handoffService.handoff(
          parsed.conversationId,
          afterAiDecision,
        );
        if (transitioned)
          await this.chatwootClient.sendConversationMessage({
            conversationId: parsed.conversationId,
            content: '这个问题暂时无法从知识库中确认，我已为您转接人工客服。',
          });
        return { status: 'processed' };
      }
      const result = await this.chatwootClient.sendConversationMessage({
        conversationId: parsed.conversationId,
        content: knowledgeAnswer.answer,
      });

      this.logger.info(
        {
          eventType: parsed.eventType,
          conversationId: parsed.conversationId,
          messageId: parsed.messageId,
          processingResult: 'processed',
          knowledgeStatus: knowledgeAnswer.status,
          aiProvider: knowledgeAnswer.provider,
          aiLatencyMs: knowledgeAnswer.latencyMs,
          aiErrorCode: knowledgeAnswer.errorCode,
          chatwootLatencyMs: result.latencyMs,
        },
        'Chatwoot webhook processed.',
      );

      return { status: 'processed' };
    } catch (error: unknown) {
      await this.webhookMessageRepository.release(parsed.messageId);
      throw error;
    }
  }
}
