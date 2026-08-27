import 'dotenv/config';

import { createApp } from './app.js';
import {
  getGatewayPort,
  getHandoffConfig,
  getOptionalInternalApiToken,
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
import {
  PostgresWebhookMessageRepository,
  UnavailableWebhookMessageRepository,
} from './repositories/webhook-message-repository.js';
import { ChatwootWebhookService } from './services/chatwoot-webhook-service.js';
import { KnowledgeAnswerService } from './services/knowledge-answer-service.js';
import { HumanHandoffService } from './services/human-handoff-service.js';

const port = getGatewayPort();
const logger = new ConsoleLogger();
const databaseUrl = getOptionalDatabaseUrl();
const chatwootConfig = getOptionalChatwootConfig();
const maxkbConfig = getOptionalMaxKBConfig();
const handoffConfig = getHandoffConfig();
const conversationRepository = databaseUrl
  ? new PostgresConversationRepository(databaseUrl)
  : new UnavailableConversationRepository();
const chatwootClient = chatwootConfig
  ? new HttpChatwootClient(chatwootConfig)
  : new UnavailableChatwootClient();
const aiRunRepository = databaseUrl
  ? new PostgresAiRunRepository(databaseUrl)
  : new NoopAiRunRepository();
const webhookMessageRepository = databaseUrl
  ? new PostgresWebhookMessageRepository(databaseUrl)
  : new UnavailableWebhookMessageRepository();
const knowledgeAnswerService = new KnowledgeAnswerService(
  maxkbConfig ? new HttpMaxKBClient(maxkbConfig) : new UnavailableMaxKBClient(),
  aiRunRepository,
  logger,
);
const handoffService = new HumanHandoffService(
  conversationRepository,
  chatwootClient,
  logger,
  handoffConfig.highRiskKeywords,
  handoffConfig.failureThreshold,
);
const webhookService = new ChatwootWebhookService(
  conversationRepository,
  webhookMessageRepository,
  knowledgeAnswerService,
  handoffService,
  chatwootClient,
  logger,
);
const app = createApp({
  webhookService,
  handoffService,
  internalApiToken: getOptionalInternalApiToken(),
  logger,
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Enamel AI Gateway listening on port ${port}.`);
});
