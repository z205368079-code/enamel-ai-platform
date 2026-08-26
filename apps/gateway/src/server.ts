import 'dotenv/config';

import { createApp } from './app.js';
import {
  getGatewayPort,
  getOptionalChatwootConfig,
  getOptionalDatabaseUrl,
  getOptionalMaxKBConfig,
} from './config/env.js';
import {
  HttpChatwootClient,
  UnavailableChatwootClient,
} from './clients/chatwoot-client.js';
import {
  HttpMaxKBClient,
  UnavailableMaxKBClient,
} from './clients/maxkb-client.js';
import { ConsoleLogger } from './logging/logger.js';
import {
  PostgresConversationRepository,
  UnavailableConversationRepository,
} from './repositories/conversation-repository.js';
import {
  NoopAiRunRepository,
  PostgresAiRunRepository,
} from './repositories/ai-run-repository.js';
import { ChatwootWebhookService } from './services/chatwoot-webhook-service.js';
import { KnowledgeAnswerService } from './services/knowledge-answer-service.js';

const port = getGatewayPort();
const logger = new ConsoleLogger();
const databaseUrl = getOptionalDatabaseUrl();
const chatwootConfig = getOptionalChatwootConfig();
const maxkbConfig = getOptionalMaxKBConfig();
const conversationRepository = databaseUrl
  ? new PostgresConversationRepository(databaseUrl)
  : new UnavailableConversationRepository();
const chatwootClient = chatwootConfig
  ? new HttpChatwootClient(chatwootConfig)
  : new UnavailableChatwootClient();
const aiRunRepository = databaseUrl
  ? new PostgresAiRunRepository(databaseUrl)
  : new NoopAiRunRepository();
const knowledgeAnswerService = new KnowledgeAnswerService(
  maxkbConfig ? new HttpMaxKBClient(maxkbConfig) : new UnavailableMaxKBClient(),
  aiRunRepository,
  logger,
);
const webhookService = new ChatwootWebhookService(
  conversationRepository,
  knowledgeAnswerService,
  chatwootClient,
  logger,
);
const app = createApp({ webhookService, logger });

app.listen(port, '0.0.0.0', () => {
  console.log(`Enamel AI Gateway listening on port ${port}.`);
});
