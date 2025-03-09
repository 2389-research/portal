/**
 * API Provider for selecting and managing API clients
 * Uses dependency injection instead of singleton pattern for better testability
 */

import { ApiInterface } from './ApiInterface';
import { FirebaseApiClient } from './FirebaseApiClient';
import { config } from './config';
import { createLogger } from '../services/logger';

// We only support Firebase
export type ApiType = 'firebase';

// Factory function to create API clients
export function createApiClient(type: ApiType): ApiInterface {
  switch (type) {
    case 'firebase':
      return new FirebaseApiClient(config.firebase);
    default:
      throw new Error(`Unsupported API type: ${type}`);
  }
}

export class ApiProvider {
  private apiClient: ApiInterface | null = null;
  private apiType: ApiType | null = null;
  private logger = createLogger('ApiProvider');

  constructor(initialApiType?: ApiType) {
    if (initialApiType) {
      // Don't await here - let the caller handle initialization
      this.initialize(initialApiType).catch((err) => {
        this.logger.error('Failed to initialize API client', err);
      });
    }
  }

  /**
   * Initialize with specified API type
   */
  public async initialize(type: ApiType = 'firebase'): Promise<ApiInterface> {
    this.logger.info(`Initializing API client of type: ${type}`);

    // If we already have a client of this type, return it
    if (this.apiClient && this.apiType === type) {
      this.logger.info('Reusing existing API client');
      return this.apiClient;
    }

    // If we have a different client, disconnect it
    if (this.apiClient) {
      this.logger.info('Disconnecting existing API client');
      await this.apiClient.disconnect();
      this.apiClient = null;
      this.apiType = null;
    }

    // Create the API client using factory function
    this.apiClient = createApiClient(type);

    // Connect to the API
    this.logger.info('Connecting to API');
    await this.apiClient.connect();
    this.apiType = type;

    return this.apiClient;
  }

  /**
   * Get the current API client
   */
  public getApiClient(): ApiInterface | null {
    if (!this.apiClient) {
      this.logger.warn('No API client initialized. Call initialize() first.');
    }
    return this.apiClient;
  }

  /**
   * Get the current API type
   */
  public getApiType(): ApiType | null {
    return this.apiType;
  }
}
