/**
 * Tests for FirebaseSignalingManager class
 * Using mocked Firebase implementations
 */

import { FirebaseSignalingManager } from '../../../api/firebase/FirebaseSignalingManager';
import {
  FIREBASE_EMULATOR_CONFIG,
  generateTestRoomId,
} from '../../../api/testing/firebase-integration-utils';
import type { SignalingMessage } from '../../../services/signaling';

// Import Firebase mocks to ensure they're loaded properly
require('../../../api/testing/jest.mock.firebase.js');

describe('FirebaseSignalingManager Tests', () => {
  let signalingManager: FirebaseSignalingManager;
  let testRoomId: string;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    signalingManager = new FirebaseSignalingManager(FIREBASE_EMULATOR_CONFIG);
    
    // Generate a test room ID for each test
    testRoomId = generateTestRoomId();
    
    // Connect to Firebase
    await signalingManager.connect();
  });

  afterEach(async () => {
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

      // Verify db is available
      const db = signalingManager.getDb();
      expect(db).not.toBeNull();

      // Verify Firestore functions were called correctly
      const { collection, addDoc } = require('firebase/firestore');
      expect(collection).toHaveBeenCalled();
      expect(addDoc).toHaveBeenCalled();
      
      // Verify the message data was passed to addDoc
      const addDocCalls = (addDoc as jest.Mock).mock.calls;
      expect(addDocCalls.length).toBeGreaterThan(0);
      
      const messageData = addDocCalls[0][1];
      expect(messageData).toMatchObject({
        type: testMessage.type,
        sender: testMessage.sender,
        receiver: testMessage.receiver,
        roomId: testMessage.roomId,
        data: testMessage.data,
      });
      
      // Verify the timestamp is of the expected type
      expect(typeof messageData.timestamp).toBe('number');
    });

    test('should retrieve signaling messages after timestamp', async () => {
      // Create timestamps for testing
      const baseTime = Date.now();
      const beforeTime = baseTime - 10000; // 10 seconds before
      // const afterTime = baseTime + 10000; // 10 seconds after

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

      // Get all mocked APIs
      const { collection, query, where, orderBy, getDocs } = require('firebase/firestore');
      
      // Reset call counts to verify subsequent queries
      jest.clearAllMocks();

      // Get signals after beforeTime (should get both in real implementation)
      await signalingManager.getSignals(testRoomId, beforeTime - 1000);
      
      // Verify the query was constructed correctly
      expect(collection).toHaveBeenCalled();
      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalled();
      expect(orderBy).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();
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
