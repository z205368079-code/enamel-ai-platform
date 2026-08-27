CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('NO_ANSWER', 'MAXKB_ERROR', 'HIGH_RISK', 'USER_REQUEST')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_created_at ON knowledge_gaps (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON knowledge_gaps (status);
