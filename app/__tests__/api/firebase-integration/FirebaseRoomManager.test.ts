/**
 * Tests for FirebaseRoomManager class
 * Using mocked Firebase implementations
 */

import { FirebaseRoomManager } from '../../../api/firebase/FirebaseRoomManager';
import { 
  FIREBASE_EMULATOR_CONFIG, 
  generateTestRoomId
} from '../../../api/testing/firebase-integration-utils';

// Import Firebase mocks to ensure they're loaded properly
require('../../../api/testing/jest.mock.firebase.js');

describe('FirebaseRoomManager Tests', () => {
  let roomManager: FirebaseRoomManager;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    roomManager = new FirebaseRoomManager(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await roomManager.connect();
  });

  afterEach(async () => {
    // Disconnect manager
    await roomManager.disconnect();
  });

  describe('Room Creation', () => {
    test('should create a new room with generated ID', async () => {
      // Create a new room
      const testUserId = 'test-user-123';
      const result = await roomManager.createRoom(testUserId);
      
      // Verify response structure
      expect(result).toEqual({
        roomId: expect.any(String),
        userId: testUserId,
        created: expect.any(Number),
      });
      
      // Verify db is available
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      // Verify Firestore functions were called correctly
      const { doc, setDoc } = require('firebase/firestore');
      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('Room Joining', () => {
    test('should join existing room', async () => {
      // Create a new room first
      const creatorId = 'creator-123';
      const { roomId } = await roomManager.createRoom(creatorId);
      
      // Reset mocks to verify just the join calls
      jest.clearAllMocks();
      
      // Now join with another user
      const joinerId = 'joiner-456';
      const joinResult = await roomManager.joinRoom(roomId, joinerId);
      
      // Verify response structure
      expect(joinResult).toEqual({
        userId: joinerId,
        joined: expect.any(Number),
      });
      
      // Verify Firestore functions were called correctly
      const { doc, setDoc } = require('firebase/firestore');
      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });

    test('should create room if joining non-existent room', async () => {
      // Generate a random room ID
      const roomId = generateTestRoomId();
      const userId = 'user-123';
      
      // Mock getDoc to simulate room not existing for the first call
      const { getDoc } = require('firebase/firestore');
      (getDoc as jest.Mock).mockImplementationOnce(() => ({
        exists: () => false
      }));
      
      // Join the non-existent room
      const result = await roomManager.joinRoom(roomId, userId);
      
      // Verify response structure
      expect(result).toEqual({
        userId,
        joined: expect.any(Number),
      });
      
      // Verify Firestore functions were called correctly
      const { doc, setDoc } = require('firebase/firestore');
      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('Room Leaving', () => {
    test('should mark user as inactive when leaving room', async () => {
      // Create and join a room first
      const userId = 'user-123';
      const { roomId } = await roomManager.createRoom(userId);
      
      // Reset mocks to verify just the leave calls
      jest.clearAllMocks();
      
      // Now leave the room
      await roomManager.leaveRoom(roomId, userId);
      
      // Verify Firestore functions were called correctly
      const { doc, setDoc } = require('firebase/firestore');
      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
      
      // Verify the setDoc call included inactive status
      const setDocCalls = (setDoc as jest.Mock).mock.calls;
      expect(setDocCalls.length).toBeGreaterThan(0);
      
      // At least one call should have data with active: false
      const inactiveCallExists = setDocCalls.some(call => {
        const data = call[1];
        return data && data.active === false;
      });
      
      expect(inactiveCallExists).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should throw when not connected', async () => {
      // Create a new instance without connecting
      const disconnectedManager = new FirebaseRoomManager(FIREBASE_EMULATOR_CONFIG);
      
      // Attempt operations that require connection
      await expect(disconnectedManager.createRoom('user-123')).rejects.toThrow();
      await expect(disconnectedManager.joinRoom('room-123', 'user-123')).rejects.toThrow();
      await expect(disconnectedManager.leaveRoom('room-123', 'user-123')).rejects.toThrow();
    });
  });
});
