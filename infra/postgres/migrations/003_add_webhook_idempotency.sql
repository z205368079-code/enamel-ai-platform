CREATE TABLE IF NOT EXISTS processed_webhook_messages (
  message_id TEXT PRIMARY KEY,
  chatwoot_conversation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
