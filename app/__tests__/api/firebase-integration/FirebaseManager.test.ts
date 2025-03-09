/**
 * Tests for FirebaseManager class
 * Using mocked Firebase implementations
 */

import { FirebaseManager } from '../../../api/firebase/FirebaseManager';
import { FIREBASE_EMULATOR_CONFIG } from '../../../api/testing/firebase-integration-utils';

// Mock the Firebase modules
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'mock-app' })),
  getApp: jest.fn().mockImplementation(() => {
    throw new Error('No app found');
  }),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({ app: { name: 'mock-app' } })),
}));

describe('FirebaseManager Tests', () => {
  let firebaseManager: FirebaseManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    firebaseManager = new FirebaseManager(FIREBASE_EMULATOR_CONFIG);
  });

  afterEach(async () => {
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
      
      // Verify Firebase functions were called
      expect(require('firebase/app').initializeApp).toHaveBeenCalled();
      expect(require('firebase/firestore').getFirestore).toHaveBeenCalled();
    });

    test('should disconnect from Firebase', async () => {
      // Connect first
      await firebaseManager.connect();
      expect(firebaseManager.getDb()).not.toBeNull();
      
      // Then disconnect
      await firebaseManager.disconnect();
      
      // Db reference should be null after disconnect
      expect(firebaseManager.getDb()).toBeNull();
    });

    test('should try to reuse existing Firebase app', async () => {
      // Mock getApp to return an app on second call
      const getAppMock = require('firebase/app').getApp;
      getAppMock.mockImplementationOnce(() => {
        throw new Error('No app found');
      }).mockImplementationOnce(() => ({ name: 'existing-app' }));
      
      // Connect the first time - should use initializeApp
      await firebaseManager.connect();
      expect(require('firebase/app').initializeApp).toHaveBeenCalled();
      
      // Disconnect
      await firebaseManager.disconnect();
      
      // Reset the mock count to verify next call
      jest.clearAllMocks();
      
      // Connect again - should try to use getApp
      await firebaseManager.connect();
      expect(require('firebase/app').getApp).toHaveBeenCalled();
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
      // Mock initializeApp to throw an error
      const initializeAppMock = require('firebase/app').initializeApp;
      initializeAppMock.mockImplementationOnce(() => {
        throw new Error('Firebase initialization error');
      });
      
      // Attempt to connect
      await expect(firebaseManager.connect())
        .rejects.toThrow(); // Any error is acceptable here
    });
  });
});