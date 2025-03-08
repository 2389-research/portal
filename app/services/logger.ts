/**
 * Logger service for consistent logging across the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Global logging configuration
const LogConfig = {
  // Default to true in development, can be configured at runtime
  enabled: process.env.NODE_ENV !== 'production',
  // Default levels to show (can be overridden)
  enabledLevels: {
    debug: process.env.NODE_ENV !== 'production',
    info: true,
    warn: true,
    error: true
  }
};

export class Logger {
  private context: string;
  private enabled: boolean = LogConfig.enabled;
  
  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    if (!this.enabled || !LogConfig.enabledLevels.debug) return;
    console.debug(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: any[]): void {
    if (!this.enabled || !LogConfig.enabledLevels.info) return;
    console.log(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    if (!this.enabled || !LogConfig.enabledLevels.warn) return;
    console.warn(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    if (!this.enabled || !LogConfig.enabledLevels.error) return;
    console.error(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Enable or disable logging for this specific logger instance
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

/**
 * Configure global logging settings
 * @param options Configuration options for all loggers
 */
export function configureLogging(options: {
  enabled?: boolean;
  levels?: Partial<Record<LogLevel, boolean>>;
}): void {
  if (typeof options.enabled === 'boolean') {
    LogConfig.enabled = options.enabled;
  }
  
  if (options.levels) {
    LogConfig.enabledLevels = {
      ...LogConfig.enabledLevels,
      ...options.levels
    };
  }
}