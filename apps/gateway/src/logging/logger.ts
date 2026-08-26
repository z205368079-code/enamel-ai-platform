export interface Logger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export class ConsoleLogger implements Logger {
  info(context: Record<string, unknown>, message: string): void {
    console.info(JSON.stringify({ level: 'info', message, ...context }));
  }

  error(context: Record<string, unknown>, message: string): void {
    console.error(JSON.stringify({ level: 'error', message, ...context }));
  }
}
