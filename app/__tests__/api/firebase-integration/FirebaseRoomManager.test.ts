/**
 * Tests for FirebaseRoomManager using simple mocks
 * 
 * Note: Currently only testing error handling due to mocking challenges.
 * TODO: Add more comprehensive tests for room creation, joining, and leaving.
 * This would require proper mocking of Firebase Firestore functions including Timestamp.
 */

import { FirebaseRoomManager } from '../../../api/firebase/FirebaseRoomManager';
import { FIREBASE_EMULATOR_CONFIG } from '../../../api/testing/firebase-integration-utils';

describe('FirebaseRoomManager Error Handling', () => {
  test('should throw when not connected', async () => {
    // Create a new instance without connecting
    const disconnectedManager = new FirebaseRoomManager(FIREBASE_EMULATOR_CONFIG);
    
    // Attempt operations that require connection
    await expect(disconnectedManager.createRoom('user-123')).rejects.toThrow();
    await expect(disconnectedManager.joinRoom('room-123', 'user-123')).rejects.toThrow();
    await expect(disconnectedManager.leaveRoom('room-123', 'user-123')).rejects.toThrow();
  });
});

