/**
 * Basic tests for FirebaseApiClient
 * 
 * Note: Due to mocking challenges with Firebase, this test file only verifies
 * basic connection and error handling functionality.
 */

import { FirebaseApiClient } from '../../../api/firebase/FirebaseApiClient';
import { FIREBASE_EMULATOR_CONFIG } from '../../../api/testing/firebase-integration-utils';

describe('FirebaseApiClient Basic Tests', () => {
  let apiClient: FirebaseApiClient;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    apiClient = new FirebaseApiClient(FIREBASE_EMULATOR_CONFIG);
  });

  test('should provide correct provider name', () => {
    expect(apiClient.getProviderName()).toBe('Firebase');
  });

  test('should throw errors when not connected', async () => {
    // Without connecting first, operations should fail
    await expect(apiClient.createRoom()).rejects.toThrow();
    await expect(apiClient.joinRoom('test-room')).rejects.toThrow();
    await expect(apiClient.leaveRoom('test-room', 'test-user')).rejects.toThrow();
    await expect(apiClient.sendSignal('test-room', {} as any)).rejects.toThrow();
    await expect(apiClient.getSignals('test-room')).rejects.toThrow();
  });
});
