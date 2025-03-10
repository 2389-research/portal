/**
 * Tests for FirebaseSignalingManager using simple mocks
 *
 * Note: Currently only testing error handling due to mocking challenges.
 * TODO: Add more comprehensive tests for sending and retrieving signals.
 * This would require proper mocking of Firebase Firestore functions.
 */

import { FirebaseSignalingManager } from '../../../api/firebase/FirebaseSignalingManager';
import {
  FIREBASE_EMULATOR_CONFIG,
  generateTestRoomId,
} from '../../../api/testing/firebase-integration-utils';
import type { SignalingMessage } from '../../../services/signaling';

describe('FirebaseSignalingManager Error Handling', () => {
  const testRoomId = generateTestRoomId();

  test('should throw when not connected', async () => {
    // Create a new instance without connecting
    const disconnectedManager = new FirebaseSignalingManager(FIREBASE_EMULATOR_CONFIG);

    // Create a test message
    const testMessage: SignalingMessage = {
      type: 'offer',
      sender: 'sender-123',
      receiver: 'receiver-456',
      roomId: testRoomId,
      data: { sdp: 'test-sdp-data' },
      timestamp: Date.now(),
    };

    // Attempt operations that require connection
    await expect(disconnectedManager.sendSignal(testRoomId, testMessage)).rejects.toThrow();
    await expect(disconnectedManager.getSignals(testRoomId)).rejects.toThrow();
  });
});
