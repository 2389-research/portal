/**
 * Integration tests for FirebaseApiClient
 * These tests verify that all Firebase managers work together correctly
 */

import { FirebaseApiClient } from '../../../api/firebase/FirebaseApiClient';
import { 
  initializeFirebaseEmulator, 
  FIREBASE_EMULATOR_CONFIG, 
  clearFirestoreData,
  createTestUser,
  signOutTestUser,
  TEST_USER,
  generateTestRoomId
} from '../../../api/testing/firebase-integration-utils';
import { SignalingMessage } from '../../../services/signaling';

describe('FirebaseApiClient Integration Tests', () => {
  let apiClient: FirebaseApiClient;
  let emulatorConfig: any;

  beforeAll(async () => {
    // Initialize Firebase emulator
    emulatorConfig = await initializeFirebaseEmulator();
    console.log('Firebase emulators initialized for API client tests');
  });

  beforeEach(async () => {
    // Create a fresh instance for each test
    apiClient = new FirebaseApiClient(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await apiClient.connect();
    
    // Ensure user is signed out before each test
    await signOutTestUser(emulatorConfig.auth);
  });

  afterEach(async () => {
    // Clean up Firestore data after each test
    if (emulatorConfig.db) {
      await clearFirestoreData(emulatorConfig.db);
    }
    
    // Disconnect client
    await apiClient.disconnect();
  });

  describe('Connection', () => {
    test('should connect and disconnect successfully', async () => {
      // First disconnect the pre-connected client
      await apiClient.disconnect();
      
      // Then connect again
      await apiClient.connect();
      // Access the getDb method using type casting
      expect((apiClient as any).getDb()).not.toBeNull();
      
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
      
      // Sign in a test user
      await createTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify authentication state
      expect(apiClient.isSignedIn()).toBe(true);
      expect(apiClient.getCurrentUser()).not.toBeNull();
      expect(apiClient.getCurrentUser()?.email).toBe(TEST_USER.email);
      
      // Clean up listener
      unsubscribe();
    });
    
    test('should sign out', async () => {
      // First sign in
      await createTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
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
      await createTestUser(emulatorConfig.auth);
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
    });
  });

  describe('Signaling', () => {
    test('should send and retrieve signaling messages', async () => {
      // Sign in a test user
      await createTestUser(emulatorConfig.auth);
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
      const signals = await apiClient.getSignals(room.roomId, beforeTime - 1000);
      
      // Should have one message
      expect(signals.length).toBe(1);
      expect(signals[0].type).toBe('offer');
      expect(signals[0].sender).toBe(room.userId);
    });
  });

  describe('Full Integration', () => {
    test('should handle complete user journey', async () => {
      // 1. Connect to Firebase - already done in beforeEach
      
      // 2. Authenticate
      await createTestUser(emulatorConfig.auth);
      await new Promise(resolve => setTimeout(resolve, 500));
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
      const signals = await apiClient.getSignals(roomId, 0);
      expect(signals.length).toBe(1);
      
      // 7. Leave room
      await apiClient.leaveRoom(roomId, userId);
      
      // 8. Sign out
      await apiClient.signOut();
      expect(apiClient.isSignedIn()).toBe(false);
      
      // 9. Disconnect - done in afterEach
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