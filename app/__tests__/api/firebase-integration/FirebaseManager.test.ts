/**
 * Tests for FirebaseManager class
 * These tests use the Firebase emulator
 */

import { FirebaseManager } from '../../../api/firebase/FirebaseManager';
import { 
  initializeFirebaseEmulator, 
  FIREBASE_EMULATOR_CONFIG, 
  clearFirestoreData 
} from '../../../api/testing/firebase-integration-utils';

describe('FirebaseManager Integration Tests', () => {
  let firebaseManager: FirebaseManager;
  let emulatorConfig: any;

  beforeAll(async () => {
    // Initialize Firebase emulator
    emulatorConfig = await initializeFirebaseEmulator();
    console.log('Firebase emulator initialized for tests');
  });

  beforeEach(() => {
    // Create a fresh instance for each test
    firebaseManager = new FirebaseManager(FIREBASE_EMULATOR_CONFIG);
  });

  afterEach(async () => {
    // Clean up Firestore data after each test
    if (emulatorConfig.db) {
      await clearFirestoreData(emulatorConfig.db);
    }
    
    // Disconnect manager
    await firebaseManager.disconnect();
  });

  describe('Connection', () => {
    test('should connect to Firebase successfully', async () => {
      // Connect to Firebase
      await firebaseManager.connect();
      
      // Verify app and db are initialized
      expect(firebaseManager.getApp()).not.toBeNull();
      expect(firebaseManager.getDb()).not.toBeNull();
    });

    test('should disconnect from Firebase', async () => {
      // Connect first
      await firebaseManager.connect();
      expect(firebaseManager.getDb()).not.toBeNull();
      
      // Then disconnect
      await firebaseManager.disconnect();
      
      // Db reference should be null after disconnect
      expect(firebaseManager.getDb()).toBeNull();
      
      // App reference should still exist (Firebase doesn't support deleting apps)
      expect(firebaseManager.getApp()).not.toBeNull();
    });

    test('should reuse existing Firebase app if available', async () => {
      // Connect the first time
      await firebaseManager.connect();
      const firstApp = firebaseManager.getApp();
      
      // Disconnect
      await firebaseManager.disconnect();
      
      // Connect again
      await firebaseManager.connect();
      const secondApp = firebaseManager.getApp();
      
      // App references should be the same
      expect(secondApp).toBe(firstApp);
    });
  });

  describe('ID Generation', () => {
    test('should generate random IDs with prefix', () => {
      // Access protected method through type assertion
      const generateRandomId = (firebaseManager as any).generateRandomId.bind(firebaseManager);
      
      // Generate IDs with different prefixes
      const userIdA = generateRandomId('user');
      const userIdB = generateRandomId('user');
      const roomId = generateRandomId('room');
      
      // Verify format
      expect(userIdA).toMatch(/^user_[a-zA-Z0-9]{12}$/);
      expect(userIdB).toMatch(/^user_[a-zA-Z0-9]{12}$/);
      expect(roomId).toMatch(/^room_[a-zA-Z0-9]{12}$/);
      
      // Verify uniqueness
      expect(userIdA).not.toEqual(userIdB);
      expect(userIdA).not.toEqual(roomId);
    });
    
    test('should generate IDs with custom length', () => {
      // Access protected method through type assertion
      const generateRandomId = (firebaseManager as any).generateRandomId.bind(firebaseManager);
      
      // Generate IDs with different lengths
      const shortId = generateRandomId('test', 6);
      const longId = generateRandomId('test', 20);
      
      // Verify format and length
      expect(shortId).toMatch(/^test_[a-zA-Z0-9]{6}$/);
      expect(longId).toMatch(/^test_[a-zA-Z0-9]{20}$/);
    });
  });

  describe('Error Handling', () => {
    test('should handle connection errors', async () => {
      // Create instance with invalid config to force error
      const badManager = new FirebaseManager({
        // @ts-ignore - intentionally bad config
        apiKey: null, 
        projectId: null,
      });
      
      // Attempt to connect
      await expect(badManager.connect())
        .rejects.toThrow(); // Any error is acceptable here
    });
  });
});