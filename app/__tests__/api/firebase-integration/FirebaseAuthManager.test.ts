/**
 * Tests for FirebaseAuthManager class
 * Using mocked Firebase implementations
 */

import { FirebaseAuthManager } from '../../../api/firebase/FirebaseAuthManager';
import { FIREBASE_EMULATOR_CONFIG } from '../../../api/testing/firebase-integration-utils';

// Define mock user data for Firebase Auth
const MOCK_USER = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
};

// Import Firebase mocks to ensure they're loaded properly
require('../../../api/testing/jest.mock.firebase.js');

describe('FirebaseAuthManager Tests', () => {
  let authManager: FirebaseAuthManager;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    authManager = new FirebaseAuthManager(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await authManager.connect();
  });

  afterEach(async () => {
    // Disconnect manager
    await authManager.disconnect();
  });

  describe('Authentication', () => {
    test('should detect unauthenticated state', async () => {
      // User should start as not signed in
      expect(authManager.isSignedIn()).toBe(false);
      expect(authManager.getCurrentUser()).toBeNull();

      // Should still have a user ID for anonymous use
      const userId = authManager.getUserId();
      expect(userId).toBeTruthy();
      expect(userId.startsWith('user_')).toBe(true);
    });

    test('should handle auth state changes', async () => {
      // Setup auth state change listener
      const authChanges: any[] = [];
      const unsubscribe = authManager.onAuthStateChanged((user) => {
        authChanges.push(user);
      });

      // Sign in
      await authManager.signInWithGoogle();

      // Verify auth state changed
      expect(authManager.isSignedIn()).toBe(true);
      expect(authManager.getCurrentUser()).not.toBeNull();
      expect(authManager.getCurrentUser()?.email).toBe(MOCK_USER.email);

      // Should use Firebase UID now
      const userId = authManager.getUserId();
      expect(userId).toBe(MOCK_USER.uid);

      // Sign out
      await authManager.signOut();

      // Verify auth state changed back
      expect(authManager.isSignedIn()).toBe(false);
      expect(authManager.getCurrentUser()).toBeNull();

      // Clean up listener
      unsubscribe();

      // Verify we got both auth states in our listener
      expect(authChanges.length).toBeGreaterThanOrEqual(2); // Initial null state + sign in
    });

    test('should get Firebase user', async () => {
      // Sign in a test user
      await authManager.signInWithGoogle();

      // Get the raw Firebase user
      const firebaseUser = authManager.getFirebaseUser();

      // Verify the user
      expect(firebaseUser).not.toBeNull();
      expect(firebaseUser?.email).toBe(MOCK_USER.email);
    });
  });

  describe('Error Handling', () => {
    test('should handle user mapping with missing fields', async () => {
      // Get Firebase auth module
      const firebaseAuth = require('firebase/auth');
      
      // Mock user with missing fields
      const mockUserWithMissingFields = {
        uid: MOCK_USER.uid,
        email: MOCK_USER.email,
        // No displayName or photoURL
      };
      
      // Mock getAuth to return our custom user
      firebaseAuth.getAuth.mockImplementationOnce(() => ({
        currentUser: mockUserWithMissingFields,
        app: { name: 'mock-app' }
      }));
      
      // Create a new manager to get the mock user
      const newManager = new FirebaseAuthManager(FIREBASE_EMULATOR_CONFIG);
      await newManager.connect();
      
      // Fake a sign-in to ensure the mock user is used
      await newManager.signInWithGoogle();
      
      // Get the mapped user
      const userInfo = newManager.getCurrentUser();

      // Verify the user is mapped correctly even with missing fields
      expect(userInfo).not.toBeNull();
      expect(userInfo?.uid).toBeTruthy();
      expect(userInfo?.email).toBe(MOCK_USER.email);

      // These should be null or undefined
      expect(userInfo?.displayName).toBeFalsy();
      expect(userInfo?.photoURL).toBeFalsy();
    });

    test('should throw when not connected', async () => {
      // Create a new instance without connecting
      const disconnectedManager = new FirebaseAuthManager(FIREBASE_EMULATOR_CONFIG);

      // Attempt operations that require connection
      await expect(disconnectedManager.signInWithGoogle()).rejects.toThrow();

      // These methods check for connection internally
      expect(() => disconnectedManager.onAuthStateChanged(() => {})).toThrow();
    });
  });
});
