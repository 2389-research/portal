import { useCallback, useEffect, useState } from 'react';
import { ApiProvider } from '../api';
import { createLogger } from '../services/logger';

interface UseAuthOptions {
  onAuthError?: (error: string) => void;
}

/**
 * Hook to manage authentication state for room access
 */
export function useAuth(options: UseAuthOptions = {}) {
  const logger = createLogger('useAuth');
  const { onAuthError } = options;

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      logger.info('Checking authentication status');
      const provider = ApiProvider.getInstance();
      const apiClient = provider.getApiClient();

      if (!apiClient) {
        const error = 'API client not initialized';
        logger.error(error);
        setAuthError(error);
        if (onAuthError) onAuthError(error);
        setAuthChecked(true);
        return false;
      }

      // Check if the user is authenticated (Firebase specific)
      if (apiClient.getProviderName() === 'Firebase' && apiClient.getCurrentUser) {
        const user = apiClient.getCurrentUser();

        if (!user) {
          logger.info('User not authenticated');
          setIsAuthenticated(false);
          setUserId(null);
          setUserName(null);
          setAuthChecked(true);
          return false;
        }

        logger.info('User authenticated:', user.displayName);
        setIsAuthenticated(true);
        setUserId(user.uid);
        setUserName(user.displayName || user.email || 'Anonymous');
        setAuthChecked(true);
        return true;
      }

      // For other API providers, assume authenticated
      logger.info('API provider does not support authentication check, assuming authenticated');
      setIsAuthenticated(true);
      setAuthChecked(true);
      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : 'Authentication check failed';

      logger.error('Auth check error:', errorMessage);
      setAuthError(errorMessage);
      if (onAuthError) onAuthError(errorMessage);
      setAuthChecked(true);
      return false;
    }
  }, [logger, onAuthError]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    // Auth state
    isAuthenticated,
    userId,
    userName,
    authChecked,
    authError,

    // Auth methods
    checkAuth,

    // API client reference
    apiClient: ApiProvider.getInstance().getApiClient(),
  };
}
