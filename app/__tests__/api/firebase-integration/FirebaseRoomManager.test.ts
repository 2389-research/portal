/**
 * Tests for FirebaseRoomManager class
 * These tests use the Firebase Firestore emulator
 */

import { FirebaseRoomManager } from '../../../api/firebase/FirebaseRoomManager';
import { 
  initializeFirebaseEmulator, 
  FIREBASE_EMULATOR_CONFIG, 
  clearFirestoreData,
  generateTestRoomId
} from '../../../api/testing/firebase-integration-utils';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

describe('FirebaseRoomManager Integration Tests', () => {
  let roomManager: FirebaseRoomManager;
  let emulatorConfig: any;

  beforeAll(async () => {
    // Initialize Firebase emulator
    emulatorConfig = await initializeFirebaseEmulator();
    console.log('Firebase Firestore emulator initialized for tests');
  });

  beforeEach(async () => {
    // Create a fresh instance for each test
    roomManager = new FirebaseRoomManager(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await roomManager.connect();
  });

  afterEach(async () => {
    // Clean up Firestore data after each test
    if (emulatorConfig.db) {
      await clearFirestoreData(emulatorConfig.db);
    }
    
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
      
      // Verify room exists in Firestore
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      if (db) {
        const roomDoc = await getDoc(doc(db, 'rooms', result.roomId));
        expect(roomDoc.exists()).toBe(true);
        
        // Verify room document structure
        const roomData = roomDoc.data();
        expect(roomData).toEqual({
          created: expect.anything(), // Timestamp object
          createdBy: testUserId,
          active: true,
        });
        
        // Verify user was added to room
        const userDoc = await getDoc(doc(db, 'rooms', result.roomId, 'users', testUserId));
        expect(userDoc.exists()).toBe(true);
        
        // Verify user document structure
        const userData = userDoc.data();
        expect(userData).toEqual({
          joined: expect.anything(), // Timestamp object
          active: true,
        });
      }
    });
  });

  describe('Room Joining', () => {
    test('should join existing room', async () => {
      // Create a new room first
      const creatorId = 'creator-123';
      const { roomId } = await roomManager.createRoom(creatorId);
      
      // Now join with another user
      const joinerId = 'joiner-456';
      const joinResult = await roomManager.joinRoom(roomId, joinerId);
      
      // Verify response structure
      expect(joinResult).toEqual({
        userId: joinerId,
        joined: expect.any(Number),
      });
      
      // Verify both users exist in Firestore
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      if (db) {
        // Verify creator still exists
        const creatorDoc = await getDoc(doc(db, 'rooms', roomId, 'users', creatorId));
        expect(creatorDoc.exists()).toBe(true);
        
        // Verify joiner was added
        const joinerDoc = await getDoc(doc(db, 'rooms', roomId, 'users', joinerId));
        expect(joinerDoc.exists()).toBe(true);
        
        // Verify joiner document structure
        const joinerData = joinerDoc.data();
        expect(joinerData).toEqual({
          joined: expect.anything(), // Timestamp object
          active: true,
        });
      }
    });

    test('should create room if joining non-existent room', async () => {
      // Generate a random room ID that doesn't exist
      const roomId = generateTestRoomId();
      const userId = 'user-123';
      
      // Join the non-existent room
      const result = await roomManager.joinRoom(roomId, userId);
      
      // Verify response structure
      expect(result).toEqual({
        userId,
        joined: expect.any(Number),
      });
      
      // Verify room was created in Firestore
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      if (db) {
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        expect(roomDoc.exists()).toBe(true);
        
        // Verify user was added to room
        const userDoc = await getDoc(doc(db, 'rooms', roomId, 'users', userId));
        expect(userDoc.exists()).toBe(true);
      }
    });
  });

  describe('Room Leaving', () => {
    test('should mark user as inactive when leaving room', async () => {
      // Create and join a room first
      const userId = 'user-123';
      const { roomId } = await roomManager.createRoom(userId);
      
      // Now leave the room
      await roomManager.leaveRoom(roomId, userId);
      
      // Verify room still exists but user is inactive
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      if (db) {
        // Verify room still exists
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        expect(roomDoc.exists()).toBe(true);
        
        // Verify user is marked as inactive
        const userDoc = await getDoc(doc(db, 'rooms', roomId, 'users', userId));
        expect(userDoc.exists()).toBe(true);
        
        const userData = userDoc.data();
        expect(userData?.active).toBe(false);
        expect(userData?.left).toBeDefined(); // Should have left timestamp
      }
    });

    test('should handle multiple users in same room', async () => {
      // Create room with first user
      const user1 = 'user-1';
      const { roomId } = await roomManager.createRoom(user1);
      
      // Join with second user
      const user2 = 'user-2';
      await roomManager.joinRoom(roomId, user2);
      
      // First user leaves
      await roomManager.leaveRoom(roomId, user1);
      
      // Verify first user is inactive but second is still active
      const db = roomManager.getDb();
      expect(db).not.toBeNull();
      
      if (db) {
        // Verify first user is inactive
        const user1Doc = await getDoc(doc(db, 'rooms', roomId, 'users', user1));
        expect(user1Doc.data()?.active).toBe(false);
        
        // Verify second user is still active
        const user2Doc = await getDoc(doc(db, 'rooms', roomId, 'users', user2));
        expect(user2Doc.data()?.active).toBe(true);
      }
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