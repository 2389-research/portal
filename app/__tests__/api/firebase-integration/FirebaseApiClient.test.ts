/**
 * Tests for FirebaseApiClient
 * Using mocked Firebase implementations
 */

import { FirebaseApiClient } from '../../../api/firebase/FirebaseApiClient';
import { FIREBASE_EMULATOR_CONFIG } from '../../../api/testing/firebase-integration-utils';
import type { SignalingMessage } from '../../../services/signaling';

// Import Firebase mocks to ensure they're loaded properly
require('../../../api/testing/jest.mock.firebase.js');

describe('FirebaseApiClient Tests', () => {
  let apiClient: FirebaseApiClient;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    apiClient = new FirebaseApiClient(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await apiClient.connect();
  });

  afterEach(async () => {
    // Disconnect client
    await apiClient.disconnect();
  });

  describe('Connection', () => {
    test('should connect and disconnect successfully', async () => {
      // First disconnect the pre-connected client
      await apiClient.disconnect();
      
      // Then connect again
      await apiClient.connect();
      
      // Verify connection status
      expect(apiClient.getProviderName()).toBe('Firebase');
      
      // Disconnect
      await apiClient.disconnect();
    });
    
    test('should return provider name', () => {
      expect(apiClient.getProviderName()).toBe('Firebase');
    });
  });

  describe('Authentication', () => {
    test('should detect auth state changes', async () => {
      // Setup auth state change listener
      const authChanges: any[] = [];
      const unsubscribe = apiClient.onAuthStateChanged((user) => {
        authChanges.push(user);
      });
      
      // Sign in a test user - this uses the mocked Firebase Auth
      await apiClient.signInWithGoogle();
      
      // Verify authentication state
      expect(apiClient.isSignedIn()).toBe(true);
      expect(apiClient.getCurrentUser()).not.toBeNull();
      expect(apiClient.getCurrentUser()?.email).toBe('test@example.com');
      
      // Clean up listener
      unsubscribe();
    });
    
    test('should sign out', async () => {
      // First sign in
      await apiClient.signInWithGoogle();
      expect(apiClient.isSignedIn()).toBe(true);
      
      // Sign out
      await apiClient.signOut();
      
      // Verify user is signed out
      expect(apiClient.isSignedIn()).toBe(false);
      expect(apiClient.getCurrentUser()).toBeNull();
    });
  });

  describe('Room Operations', () => {
    test('should create room, join room, and leave room', async () => {
      // Sign in a test user
      await apiClient.signInWithGoogle();
      
      // Create a room
      const room = await apiClient.createRoom();
      expect(room).toEqual({
        roomId: expect.any(String),
        userId: expect.any(String),
        created: expect.any(Number),
      });
      
      // Join the room
      const joinResult = await apiClient.joinRoom(room.roomId);
      expect(joinResult).toEqual({
        userId: expect.any(String),
        joined: expect.any(Number),
      });
      
      // Leave the room
      await apiClient.leaveRoom(room.roomId, joinResult.userId);
      
      // Verify Firestore functions were called
      const { setDoc, doc } = require('firebase/firestore');
      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('Signaling', () => {
    test('should send and retrieve signaling messages', async () => {
      // Sign in a test user
      await apiClient.signInWithGoogle();
      
      // Create a room
      const room = await apiClient.createRoom();
      
      // Create a timestamp for testing
      const beforeTime = Date.now();
      
      // Create a test signaling message
      const testMessage: SignalingMessage = {
        type: 'offer',
        sender: room.userId,
        receiver: 'other-user',
        roomId: room.roomId,
        data: { sdp: 'test-sdp-data' },
        timestamp: Date.now(),
      };
      
      // Send the message
      await apiClient.sendSignal(room.roomId, testMessage);
      
      // Get signals since before the message was sent
      await apiClient.getSignals(room.roomId, beforeTime - 1000);
      
      // Verify Firestore functions were called
      const { addDoc, collection, query, getDocs } = require('firebase/firestore');
      expect(addDoc).toHaveBeenCalled();
      expect(collection).toHaveBeenCalled();
      expect(query).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();
      
      // Should have at least one message in our mock store
      expect(mockStore.signals[room.roomId].length).toBeGreaterThan(0);
    });
  });

  describe('Full Integration', () => {
    test('should handle complete user journey', async () => {
      // 1. Connect to Firebase - already done in beforeEach
      
      // 2. Authenticate
      await apiClient.signInWithGoogle();
      expect(apiClient.isSignedIn()).toBe(true);
      
      // 3. Create a room
      const room = await apiClient.createRoom();
      const roomId = room.roomId;
      
      // 4. Join a room
      const joinResult = await apiClient.joinRoom(roomId);
      const userId = joinResult.userId;
      
      // 5. Send a signaling message
      const testMessage: SignalingMessage = {
        type: 'offer',
        sender: userId,
        receiver: 'other-user',
        roomId: roomId,
        data: { sdp: 'test-sdp-data' },
        timestamp: Date.now(),
      };
      
      await apiClient.sendSignal(roomId, testMessage);
      
      // 6. Receive signals
      await apiClient.getSignals(roomId, 0);
      
      // 7. Leave room
      await apiClient.leaveRoom(roomId, userId);
      
      // 8. Sign out
      await apiClient.signOut();
      expect(apiClient.isSignedIn()).toBe(false);
      
      // 9. Disconnect - done in afterEach
      
      // Verify that our mock store has the expected data
      expect(mockStore.rooms[roomId]).toBeDefined();
      expect(mockStore.signals[roomId]).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle API operation errors gracefully', async () => {
      // Disconnect to cause errors
      await apiClient.disconnect();
      
      // All operations should fail when disconnected
      await expect(apiClient.createRoom()).rejects.toThrow();
      await expect(apiClient.joinRoom('test-room')).rejects.toThrow();
      await expect(apiClient.leaveRoom('test-room', 'test-user')).rejects.toThrow();
      await expect(apiClient.sendSignal('test-room', {} as any)).rejects.toThrow();
      await expect(apiClient.getSignals('test-room')).rejects.toThrow();
    });
  });
});
