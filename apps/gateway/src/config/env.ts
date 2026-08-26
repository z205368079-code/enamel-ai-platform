const DEFAULT_PORT = 3000;

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('GATEWAY_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function getGatewayPort(): number {
  return parsePort(process.env.GATEWAY_PORT);
}
