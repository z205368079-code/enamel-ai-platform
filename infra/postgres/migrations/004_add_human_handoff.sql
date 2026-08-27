ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_mode_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_mode_check CHECK (mode IN ('AI', 'HUMAN'));

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS consecutive_ai_failures INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_ai_failures >= 0);

CREATE TABLE IF NOT EXISTS handoff_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('USER_REQUEST', 'NO_ANSWER', 'AI_FAILURE', 'HIGH_RISK')),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('CUSTOMER', 'SYSTEM')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
