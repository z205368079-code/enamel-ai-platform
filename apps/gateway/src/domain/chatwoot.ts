export interface IncomingChatwootMessage {
  eventType: 'message_created';
  conversationId: string;
  contactId: string;
  messageId: string;
  content: string;
}

export interface SendConversationMessageInput {
  conversationId: string;
  content: string;
}

export interface ChatwootSendResult {
  latencyMs: number;
}
