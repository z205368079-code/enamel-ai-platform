import { loadEnv } from './config/env.js';
import { GatewayClient } from './bff/gateway-client.js';
import { createDashboardApp } from './app.js';

const env = loadEnv();
const gatewayClient = new GatewayClient(
  env.gatewayBaseUrl,
  env.internalApiToken,
);

const app = createDashboardApp({
  gatewayClient,
});

// Explicitly bind to loopback address (127.0.0.1) by default to prevent unauthorized LAN access
app.listen(env.port, env.host, () => {
  console.log(
    `[dashboard] Operations Dashboard running on http://${env.host}:${env.port} (loopback only)`,
  );
  console.log(`[dashboard] Target Gateway: ${env.gatewayBaseUrl}`);
});
