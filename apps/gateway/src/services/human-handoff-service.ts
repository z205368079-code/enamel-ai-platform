import {
  CONVERSATION_MODE,
  type ConversationState,
} from '../domain/conversation.js';
import {
  HANDOFF_REASON,
  HANDOFF_TRIGGERED_BY,
  ROUTING_DECISION,
  type RoutingDecision,
} from '../domain/handoff.js';
import type { KnowledgeAnswerResult } from './knowledge-answer-service.js';
import type { ConversationRepository } from '../repositories/conversation-repository.js';
import type { ChatwootClient } from '../clients/chatwoot-client.js';
import type { Logger } from '../logging/logger.js';

const FAILURE_STATUSES = new Set([
  'TIMEOUT',
  'NETWORK_ERROR',
  'HTTP_ERROR',
  'INVALID_RESPONSE',
  'UNKNOWN_ERROR',
]);

export class HumanHandoffService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly chatwoot: ChatwootClient,
    private readonly logger: Logger,
    private readonly highRiskKeywords: string[],
    private readonly failureThreshold: number,
  ) {}

  routeBeforeAi(state: ConversationState, message: string): RoutingDecision {
    if (state.mode === CONVERSATION_MODE.HUMAN)
      return ROUTING_DECISION.ALREADY_HUMAN;
    const normalized = message.toLowerCase();
    if (
      [
        '人工客服',
        '转人工',
        '我要人工',
        '找客服',
        '真人客服',
        '联系人工',
        '我想找人工处理',
      ].some((item) => normalized.includes(item))
    )
      return ROUTING_DECISION.HANDOFF_USER_REQUEST;
    if (
      this.highRiskKeywords.some((item) =>
        normalized.includes(item.toLowerCase()),
      )
    )
      return ROUTING_DECISION.HANDOFF_HIGH_RISK;
    return ROUTING_DECISION.CONTINUE_AI;
  }

  async handoff(
    conversationId: string,
    decision: RoutingDecision,
  ): Promise<boolean> {
    const mapping =
      decision === ROUTING_DECISION.HANDOFF_USER_REQUEST
        ? ([
            HANDOFF_REASON.USER_REQUEST,
            HANDOFF_TRIGGERED_BY.CUSTOMER,
          ] as const)
        : decision === ROUTING_DECISION.HANDOFF_HIGH_RISK
          ? ([HANDOFF_REASON.HIGH_RISK, HANDOFF_TRIGGERED_BY.SYSTEM] as const)
          : decision === ROUTING_DECISION.HANDOFF_NO_ANSWER
            ? ([HANDOFF_REASON.NO_ANSWER, HANDOFF_TRIGGERED_BY.SYSTEM] as const)
            : ([
                HANDOFF_REASON.AI_FAILURE,
                HANDOFF_TRIGGERED_BY.SYSTEM,
              ] as const);
    const transitioned = await this.conversations.handoff(
      conversationId,
      mapping[0],
      mapping[1],
    );
    if (!transitioned) return false;
    try {
      await this.chatwoot.markConversationForHumanHandoff(conversationId);
      this.logger.info(
        {
          conversationId,
          handoffReason: mapping[0],
          modeTransition: 'AI_TO_HUMAN',
          chatwootMarker: 'success',
        },
        'Human handoff completed.',
      );
    } catch {
      this.logger.error(
        {
          conversationId,
          handoffReason: mapping[0],
          modeTransition: 'AI_TO_HUMAN',
          chatwootMarker: 'failed',
        },
        'Chatwoot handoff marker failed.',
      );
    }
    return true;
  }

  async routeAfterAi(
    conversationId: string,
    result: KnowledgeAnswerResult,
  ): Promise<RoutingDecision> {
    if (result.status === 'NO_ANSWER')
      return ROUTING_DECISION.HANDOFF_NO_ANSWER;
    const outcome = await this.conversations.recordAiOutcome(
      conversationId,
      !FAILURE_STATUSES.has(result.status),
      this.failureThreshold,
    );
    return outcome.handoff
      ? ROUTING_DECISION.HANDOFF_AI_FAILURE
      : ROUTING_DECISION.CONTINUE_AI;
  }

  async resumeAi(conversationId: string): Promise<boolean> {
    const resumed = await this.conversations.resumeAi(conversationId);
    if (resumed)
      this.logger.info(
        { conversationId, modeTransition: 'HUMAN_TO_AI' },
        'AI resumed.',
      );
    return resumed;
  }
}
