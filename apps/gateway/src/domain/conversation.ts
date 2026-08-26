export const CONVERSATION_MODE = {
  AI: 'AI',
} as const;

export type ConversationMode =
  (typeof CONVERSATION_MODE)[keyof typeof CONVERSATION_MODE];

export interface ConversationUpsertInput {
  chatwootConversationId: string;
  contactId: string;
  mode: ConversationMode;
}
