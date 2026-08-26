import 'dotenv/config';

import { createApp } from './app.js';
import {
  getGatewayPort,
  getOptionalChatwootConfig,
  getOptionalDatabaseUrl,
} from './config/env.js';
import {
  HttpChatwootClient,
  UnavailableChatwootClient,
} from './clients/chatwoot-client.js';
import { ConsoleLogger } from './logging/logger.js';
import {
  PostgresConversationRepository,
  UnavailableConversationRepository,
} from './repositories/conversation-repository.js';
import { ChatwootWebhookService } from './services/chatwoot-webhook-service.js';

const port = getGatewayPort();
const logger = new ConsoleLogger();
const databaseUrl = getOptionalDatabaseUrl();
const chatwootConfig = getOptionalChatwootConfig();
const conversationRepository = databaseUrl
  ? new PostgresConversationRepository(databaseUrl)
  : new UnavailableConversationRepository();
const chatwootClient = chatwootConfig
  ? new HttpChatwootClient(chatwootConfig)
  : new UnavailableChatwootClient();
const webhookService = new ChatwootWebhookService(
  conversationRepository,
  chatwootClient,
  logger,
);
const app = createApp({ webhookService, logger });

app.listen(port, '0.0.0.0', () => {
  console.log(`Enamel AI Gateway listening on port ${port}.`);
});
