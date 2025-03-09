/**
 * Tests for FirebaseSignalingManager class
 * These tests use the Firebase Firestore emulator
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { FirebaseSignalingManager } from '../../../api/firebase/FirebaseSignalingManager';
import {
  FIREBASE_EMULATOR_CONFIG,
  clearFirestoreData,
  generateTestRoomId,
  initializeFirebaseEmulator,
} from '../../../api/testing/firebase-integration-utils';
import type { SignalingMessage } from '../../../services/signaling';

describe('FirebaseSignalingManager Integration Tests', () => {
  let signalingManager: FirebaseSignalingManager;
  let emulatorConfig: any;
  let testRoomId: string;

  beforeAll(async () => {
    // Initialize Firebase emulator
    emulatorConfig = await initializeFirebaseEmulator();
    console.log('Firebase Firestore emulator initialized for tests');
  });

  beforeEach(async () => {
    // Create a fresh instance for each test
    signalingManager = new FirebaseSignalingManager(FIREBASE_EMULATOR_CONFIG);

    // Connect to Firebase
    await signalingManager.connect();

    // Generate a test room ID for each test
    testRoomId = generateTestRoomId();
  });

  afterEach(async () => {
    // Clean up Firestore data after each test
    if (emulatorConfig.db) {
      await clearFirestoreData(emulatorConfig.db);
    }

    // Disconnect manager
    await signalingManager.disconnect();
  });

  describe('Signaling', () => {
    test('should send a signaling message', async () => {
      // Create a test signaling message
      const testMessage: SignalingMessage = {
        type: 'offer',
        sender: 'sender-123',
        receiver: 'receiver-456',
        roomId: testRoomId,
        data: { sdp: 'test-sdp-data' },
        timestamp: Date.now(),
      };

      // Send the message
      await signalingManager.sendSignal(testRoomId, testMessage);

      // Verify message exists in Firestore
      const db = signalingManager.getDb();
      expect(db).not.toBeNull();

      if (db) {
        // Query the signals collection
        const signalsSnapshot = await getDocs(collection(db, 'rooms', testRoomId, 'signals'));

        // Should have one document
        expect(signalsSnapshot.empty).toBe(false);
        expect(signalsSnapshot.size).toBe(1);

        // Verify signal document structure
        const signalData = signalsSnapshot.docs[0].data();
        expect(signalData).toEqual(
          expect.objectContaining({
            type: testMessage.type,
            sender: testMessage.sender,
            receiver: testMessage.receiver,
            roomId: testMessage.roomId,
            data: testMessage.data,
            timestamp: testMessage.timestamp,
            firestoreTimestamp: expect.anything(), // Timestamp object
          })
        );
      }
    });

    test('should retrieve signaling messages after timestamp', async () => {
      // Create timestamps for testing
      const baseTime = Date.now();
      const beforeTime = baseTime - 10000; // 10 seconds before
      const afterTime = baseTime + 10000; // 10 seconds after

      // Create test messages at different times
      const oldMessage: SignalingMessage = {
        type: 'offer',
        sender: 'sender-123',
        receiver: 'receiver-456',
        roomId: testRoomId,
        data: { sdp: 'old-sdp-data' },
        timestamp: beforeTime,
      };

      const newMessage: SignalingMessage = {
        type: 'answer',
        sender: 'receiver-456',
        receiver: 'sender-123',
        roomId: testRoomId,
        data: { sdp: 'new-sdp-data' },
        timestamp: baseTime,
      };

      // Send both messages
      await signalingManager.sendSignal(testRoomId, oldMessage);
      await signalingManager.sendSignal(testRoomId, newMessage);

      // Get signals after beforeTime - should get both
      const allSignals = await signalingManager.getSignals(testRoomId, beforeTime - 1000);
      expect(allSignals.length).toBe(2);

      // Get signals after baseTime - should only get the new message
      const newSignals = await signalingManager.getSignals(testRoomId, beforeTime + 1000);
      expect(newSignals.length).toBe(1);
      expect(newSignals[0].type).toBe('answer');

      // Get signals after afterTime - should get none
      const noSignals = await signalingManager.getSignals(testRoomId, afterTime);
      expect(noSignals.length).toBe(0);
    });

    test('should handle multiple signal types', async () => {
      // Create various signal types
      const signalTypes = ['offer', 'answer', 'ice-candidate', 'custom-type'];

      // Send a message for each type
      for (const type of signalTypes) {
        const message: SignalingMessage = {
          type,
          sender: 'sender-123',
          receiver: 'receiver-456',
          roomId: testRoomId,
          data: { type },
          timestamp: Date.now(),
        };

        await signalingManager.sendSignal(testRoomId, message);
      }

      // Retrieve all signals
      const signals = await signalingManager.getSignals(testRoomId, 0);

      // Should have one message for each type
      expect(signals.length).toBe(signalTypes.length);

      // Verify all types are present
      const retrievedTypes = signals.map((s) => s.type);
      for (const type of signalTypes) {
        expect(retrievedTypes).toContain(type);
      }
    });
  });

  describe('Error Handling', () => {
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
});
