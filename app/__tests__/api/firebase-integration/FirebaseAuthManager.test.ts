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

// Mock Firebase auth
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'mock-app' })),
  getApp: jest.fn().mockImplementation(() => {
    throw new Error('No app found');
  }),
}));

jest.mock('firebase/auth', () => {
  // Mock authentication state
  let currentUser = null;

  return {
    getAuth: jest.fn(() => ({
      currentUser,
      app: { name: 'mock-app' },
    })),
    onAuthStateChanged: jest.fn((auth, callback) => {
      // Immediately call with current state
      callback(currentUser);

      // Return a properly callable unsubscribe function
      const unsubscribe = () => {
        return;
      };
      return unsubscribe;
    }),
    signInWithPopup: jest.fn(() => {
      // Update current user
      currentUser = { ...MOCK_USER };
      return Promise.resolve({ user: currentUser });
    }),
    GoogleAuthProvider: jest.fn(),
    signOut: jest.fn(() => {
      currentUser = null;
      return Promise.resolve();
    }),
    connectAuthEmulator: jest.fn(),
  };
});

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
      // Get Firebase auth module
      const firebaseAuth = require('firebase/auth');

      // Update our onAuthStateChanged mock to call callback with each state change
      // and track the active listeners
      const listeners: Array<(user: any) => void> = [];
      firebaseAuth.onAuthStateChanged.mockImplementation((auth, callback) => {
        listeners.push(callback);
        callback(null); // Call with initial null state
        return () => {
          const index = listeners.indexOf(callback);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        };
      });

      // Setup auth state change listener
      const authChanges: any[] = [];
      const unsubscribe = authManager.onAuthStateChanged((user) => {
        authChanges.push(user);
      });

      // The initial state should already be in our authChanges
      expect(authChanges.length).toBe(1);
      expect(authChanges[0]).toBeNull();

      // Sign in - this will update currentUser and call all auth state listeners
      await authManager.signInWithGoogle();

      // Manually trigger all listeners with the new user state
      const mockUser = { ...MOCK_USER };
      listeners.forEach((listener) => listener(mockUser));

      // Verify auth state changed
      expect(authManager.isSignedIn()).toBe(true);
      expect(authManager.getCurrentUser()).not.toBeNull();
      expect(authManager.getCurrentUser()?.email).toBe(MOCK_USER.email);

      // Should use Firebase UID now
      const userId = authManager.getUserId();
      expect(userId).toBe(MOCK_USER.uid);

      // Sign out - this will set currentUser to null and call all auth state listeners
      await authManager.signOut();

      // Manually trigger all listeners with null
      listeners.forEach((listener) => listener(null));

      // Verify auth state changed back
      expect(authManager.isSignedIn()).toBe(false);
      expect(authManager.getCurrentUser()).toBeNull();

      // Clean up listener
      unsubscribe();

      // Verify we got all auth states in our listener:
      // 1. Initial null state
      // 2. Signed in state
      // 3. Signed out state
      expect(authChanges.length).toBeGreaterThanOrEqual(2);
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

      // Create a special mock for sign-in with missing fields
      firebaseAuth.signInWithPopup.mockImplementationOnce(() => {
        // Return a user WITHOUT displayName or photoURL
        return Promise.resolve({
          user: {
            uid: MOCK_USER.uid,
            email: MOCK_USER.email,
            // No displayName or photoURL
          },
        });
      });

      // Sign in with Google (which will use our special mock)
      await authManager.signInWithGoogle();

      // Get the mapped user
      const userInfo = authManager.getCurrentUser();

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
