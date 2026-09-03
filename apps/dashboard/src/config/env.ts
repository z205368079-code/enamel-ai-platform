import dotenv from 'dotenv';

dotenv.config();

export interface DashboardEnv {
  port: number;
  host: string;
  gatewayBaseUrl: string;
  internalApiToken?: string | undefined;
}

export function loadEnv(): DashboardEnv {
  const port = Number(process.env.DASHBOARD_PORT) || 3001;
  // Explicitly restrict to loopback interface by default to prevent LAN exposure without auth
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  const gatewayBaseUrl = (
    process.env.GATEWAY_BASE_URL || 'http://127.0.0.1:3000'
  ).replace(/\/+$/, '');
  const internalApiToken = process.env.INTERNAL_API_TOKEN || undefined;

  return {
    port,
    host,
    gatewayBaseUrl,
    internalApiToken,
  };
}
