import type { Request, Response } from 'express';

import type { HumanHandoffService } from '../services/human-handoff-service.js';

export function createInternalConversationController(
  service: HumanHandoffService,
) {
  return async (
    request: Request<{ id: string }>,
    response: Response,
  ): Promise<void> => {
    const resumed = await service.resumeAi(request.params.id);
    response.status(200).json({ status: resumed ? 'resumed' : 'unchanged' });
  };
}
