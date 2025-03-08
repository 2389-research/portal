/**
 * Logger service for consistent logging across the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private context: string;
  private enabled: boolean = true;
  
  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.debug(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.log(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.warn(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.error(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Enable or disable logging
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}