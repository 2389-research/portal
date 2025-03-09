/**
 * Legacy ApiProvider with Singleton Pattern
 * This provides backward compatibility with existing code
 * Now using the new consolidated FirebaseApiClient implementation
 */

import { createLogger } from '../../services/logger';
import type { ApiInterface } from '../ApiInterface';
import { FirebaseApiClient } from '../FirebaseApiClient';
import { config } from '../config';

// We only support Firebase
export type ApiType = 'firebase';

/**
 * Singleton ApiProvider class for backward compatibility
 */
export class ApiProvider {
  private static instance: ApiProvider;
  private apiClient: ApiInterface | null = null;
  private apiType: ApiType | null = null;
  private logger = createLogger('ApiProvider');

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the API provider instance
   */
  public static getInstance(): ApiProvider {
    if (!ApiProvider.instance) {
      ApiProvider.instance = new ApiProvider();
    }
    return ApiProvider.instance;
  }

  /**
   * Initialize with Firebase (only supported option)
   */
  public async initialize(type: ApiType = 'firebase'): Promise<ApiInterface> {
    this.logger.info(`Initializing API of type: ${type}`);

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

    // Create the consolidated Firebase client that uses manager classes internally
    this.apiClient = new FirebaseApiClient(config.firebase);

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
