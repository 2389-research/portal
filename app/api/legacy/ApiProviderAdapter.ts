/**
 * ApiProvider Adapter
 * Provides backward compatibility with existing code using singleton pattern
 * while using the new dependency injection pattern internally
 */

import { ApiProvider, ApiType } from '../ApiProvider';
import { ApiInterface } from '../ApiInterface';
import { createLogger } from '../../services/logger';

/**
 * Adapter that maintains compatibility with the old singleton pattern
 * while using the new dependency injection pattern internally
 */
export class ApiProviderAdapter {
  private static instance: ApiProviderAdapter;
  private apiProvider: ApiProvider;
  private logger = createLogger('ApiAdapter');

  private constructor() {
    this.apiProvider = new ApiProvider();
  }

  /**
   * Get the API provider instance (singleton pattern for backward compatibility)
   */
  public static getInstance(): ApiProviderAdapter {
    if (!ApiProviderAdapter.instance) {
      ApiProviderAdapter.instance = new ApiProviderAdapter();
    }
    return ApiProviderAdapter.instance;
  }

  /**
   * Initialize API with the given type
   */
  public async initialize(type: ApiType = 'firebase'): Promise<ApiInterface> {
    this.logger.info(`Initializing API with type: ${type}`);
    return this.apiProvider.initialize(type);
  }

  /**
   * Get the current API client
   */
  public getApiClient(): ApiInterface | null {
    return this.apiProvider.getApiClient();
  }

  /**
   * Get the current API type
   */
  public getApiType(): ApiType | null {
    return this.apiProvider.getApiType();
  }
}