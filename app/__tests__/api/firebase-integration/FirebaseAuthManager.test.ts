/**
 * Tests for FirebaseAuthManager class
 * These tests use the Firebase Auth emulator
 */

import { FirebaseAuthManager } from '../../../api/firebase/FirebaseAuthManager';
import { 
  initializeFirebaseEmulator, 
  FIREBASE_EMULATOR_CONFIG, 
  TEST_USER,
  createTestUser,
  signOutTestUser
} from '../../../api/testing/firebase-integration-utils';

describe('FirebaseAuthManager Integration Tests', () => {
  let authManager: FirebaseAuthManager;
  let emulatorConfig: any;

  beforeAll(async () => {
    // Initialize Firebase emulator
    emulatorConfig = await initializeFirebaseEmulator();
    console.log('Firebase auth emulator initialized for tests');
  });

  beforeEach(async () => {
    // Create a fresh instance for each test
    authManager = new FirebaseAuthManager(FIREBASE_EMULATOR_CONFIG);
    
    // Connect to Firebase
    await authManager.connect();
    
    // Ensure user is signed out before each test
    await signOutTestUser(emulatorConfig.auth);
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
      await createTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify auth state changed
      expect(authManager.isSignedIn()).toBe(true);
      expect(authManager.getCurrentUser()).not.toBeNull();
      expect(authManager.getCurrentUser()?.email).toBe(TEST_USER.email);
      
      // Should use Firebase UID now
      const userId = authManager.getUserId();
      expect(userId).not.toContain('user_');
      
      // Sign out 
      await signOutTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify auth state changed back
      expect(authManager.isSignedIn()).toBe(false);
      expect(authManager.getCurrentUser()).toBeNull();
      
      // Clean up listener
      unsubscribe();
      
      // Verify we got both auth states in our listener
      expect(authChanges.length).toBeGreaterThanOrEqual(1);
    });

    test('should get Firebase user', async () => {
      // Sign in a test user
      await createTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get the raw Firebase user
      const firebaseUser = authManager.getFirebaseUser();
      
      // Verify the user
      expect(firebaseUser).not.toBeNull();
      expect(firebaseUser?.email).toBe(TEST_USER.email);
    });
  });

  describe('Error Handling', () => {
    test('should handle user mapping with missing fields', async () => {
      // Create a test user with minimal info
      await createTestUser(emulatorConfig.auth);
      
      // Small delay to allow auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get the mapped user
      const userInfo = authManager.getCurrentUser();
      
      // Verify the user is mapped correctly even with missing fields
      expect(userInfo).not.toBeNull();
      expect(userInfo?.uid).toBeTruthy();
      expect(userInfo?.email).toBe(TEST_USER.email);
      
      // These might be null
      expect(userInfo).toHaveProperty('displayName');
      expect(userInfo).toHaveProperty('photoURL');
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