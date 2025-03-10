/**
 * Logger configuration service
 * Provides central configuration for logging across the application
 */
import { configureLogging } from './logger';

/**
 * Initialize logging configuration based on environment
 */
export function initializeLogging(): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Configure logging based on environment
  configureLogging({
    enabled: true, // Always enable logging at the global level, but control verbosity
    levels: {
      debug: isDevelopment, // Only show debug logs in development
      info: true, // Always show info logs
      warn: true, // Always show warning logs
      error: true, // Always show error logs
    },
  });

  // Log the configuration
  if (isDevelopment) {
    console.log(`[Logger] Initialized in ${isDevelopment ? 'development' : 'production'} mode`);
    console.log('[Logger] Debug logs are', isDevelopment ? 'enabled' : 'disabled');
  }
}
