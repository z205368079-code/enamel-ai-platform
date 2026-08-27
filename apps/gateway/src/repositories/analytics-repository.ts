import { Pool } from 'pg';

export interface AnalyticsRepository {
  recordGap(input: {
    conversationId: string;
    messageId: string;
    reason: 'NO_ANSWER' | 'MAXKB_ERROR';
  }): Promise<void>;
  stats(): Promise<Record<string, number | null>>;
  gaps(limit: number, offset: number): Promise<Array<Record<string, unknown>>>;
}
export class PostgresAnalyticsRepository implements AnalyticsRepository {
  private readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url });
  }
  async recordGap(input: {
    conversationId: string;
    messageId: string;
    reason: 'NO_ANSWER' | 'MAXKB_ERROR';
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO knowledge_gaps (conversation_id,message_id,reason) SELECT id,$2,$3 FROM conversations WHERE chatwoot_conversation_id=$1 ON CONFLICT (message_id) DO NOTHING`,
      [input.conversationId, input.messageId, input.reason],
    );
  }
  async stats(): Promise<Record<string, number | null>> {
    const r = await this.pool.query(
      `SELECT (SELECT count(*) FROM conversations)::int "totalConversations",(SELECT count(*) FROM conversations WHERE mode='AI')::int "aiModeConversations",(SELECT count(*) FROM conversations WHERE mode='HUMAN')::int "humanModeConversations",(SELECT count(*) FROM ai_runs)::int "totalAiRuns",(SELECT count(*) FROM ai_runs WHERE status='SUCCESS')::int "successfulAiRuns",(SELECT count(*) FROM ai_runs WHERE status<>'SUCCESS')::int "failedAiRuns",(SELECT count(*) FROM handoff_events)::int "humanHandoffs",(SELECT count(*) FROM knowledge_gaps)::int "knowledgeGaps",(SELECT round(avg(latency_ms))::int FROM ai_runs WHERE latency_ms IS NOT NULL) "averageAiLatencyMs"`,
    );
    return r.rows[0] as Record<string, number | null>;
  }
  async gaps(
    limit: number,
    offset: number,
  ): Promise<Array<Record<string, unknown>>> {
    const r = await this.pool.query(
      `SELECT g.id,c.chatwoot_conversation_id "conversationId",g.message_id "messageId",g.reason,g.status,g.created_at "createdAt" FROM knowledge_gaps g JOIN conversations c ON c.id=g.conversation_id ORDER BY g.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return r.rows;
  }
}
export class NoopAnalyticsRepository implements AnalyticsRepository {
  async recordGap(): Promise<void> {}
  async stats(): Promise<Record<string, number | null>> {
    return {
      totalConversations: 0,
      aiModeConversations: 0,
      humanModeConversations: 0,
      totalAiRuns: 0,
      successfulAiRuns: 0,
      failedAiRuns: 0,
      humanHandoffs: 0,
      knowledgeGaps: 0,
      averageAiLatencyMs: null,
    };
  }
  async gaps(): Promise<Array<Record<string, unknown>>> {
    return [];
  }
}
