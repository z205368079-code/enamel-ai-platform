ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS maxkb_chat_id TEXT NULL;

CREATE TABLE IF NOT EXISTS ai_runs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'SUCCESS',
      'TIMEOUT',
      'NETWORK_ERROR',
      'HTTP_ERROR',
      'INVALID_RESPONSE',
      'NO_ANSWER',
      'UNKNOWN_ERROR'
    )
  ),
  latency_ms INTEGER NULL CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_conversation_created_at
  ON ai_runs (conversation_id, created_at DESC);
