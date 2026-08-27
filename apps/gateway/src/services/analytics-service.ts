import type { AnalyticsRepository } from '../repositories/analytics-repository.js';
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}
  stats() {
    return this.repository.stats();
  }
  gaps(limit: number, offset: number) {
    return this.repository.gaps(limit, offset);
  }
  recordNoAnswer(conversationId: string, messageId: string) {
    return this.repository.recordGap({
      conversationId,
      messageId,
      reason: 'NO_ANSWER',
    });
  }
}
