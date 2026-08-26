export const KNOWLEDGE_ANSWER_STATUS = {
  SUCCESS: 'SUCCESS',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NO_ANSWER: 'NO_ANSWER',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type KnowledgeAnswerStatus =
  (typeof KNOWLEDGE_ANSWER_STATUS)[keyof typeof KNOWLEDGE_ANSWER_STATUS];

export interface AiRunInput {
  chatwootConversationId: string;
  messageId: string;
  question: string;
  answer: string | null;
  status: KnowledgeAnswerStatus;
  latencyMs: number | null;
  errorCode: string | null;
}
