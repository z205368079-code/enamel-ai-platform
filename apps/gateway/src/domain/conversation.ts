export const CONVERSATION_MODE = {
  AI: 'AI',
  HUMAN: 'HUMAN',
} as const;

export type ConversationMode =
  (typeof CONVERSATION_MODE)[keyof typeof CONVERSATION_MODE];

export interface ConversationUpsertInput {
  chatwootConversationId: string;
  contactId: string;
  mode: ConversationMode;
}

export interface ConversationState {
  mode: ConversationMode;
  consecutiveAiFailures: number;
}
