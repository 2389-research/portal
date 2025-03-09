/**
 * Firebase Test Utilities
 * Helper functions for Firebase testing with mocks
 */

import type { User } from 'firebase/auth';
import type { UserInfo } from '../ApiInterface';

// Test configuration for Firebase Emulator
export const FIREBASE_EMULATOR_CONFIG = {
  apiKey: 'fake-api-key-for-testing',
  authDomain: 'localhost',
  projectId: 'demo-test-project',
  storageBucket: 'demo-test-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123def456',
};

// Test user credentials
export const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  displayName: 'Test User',
  uid: 'test-user-id',
  photoURL: null,
};

/**
 * Initialize Firebase with test configurations
 * This returns mock objects for app, auth, and db
 */
export async function initializeFirebaseEmulator() {
  // Create mock app
  const app = {
    name: 'test-app',
    options: {},
    automaticDataCollectionEnabled: false,
  };

  // Create mock auth
  const auth = {
    currentUser: null,
    onAuthStateChanged: jest.fn(),
    app: app,
  };

  // Create mock db
  const db = {
    app: app,
    collection: jest.fn(),
    doc: jest.fn(),
  };

  console.log('Mock Firebase setup complete');

  return { app, auth, db };
}

/**
 * Create a test user
 */
export async function createTestUser(auth: any): Promise<any> {
  console.log('Creating mock test user');

  // Create a mock user credential
  const userCredential = {
    user: {
      uid: TEST_USER.uid,
      email: TEST_USER.email,
      displayName: TEST_USER.displayName,
      photoURL: TEST_USER.photoURL,
    },
  };

  // Update the auth mock
  auth.currentUser = userCredential.user;

  return userCredential;
}

/**
 * Sign out the current user
 */
export async function signOutTestUser(auth: any): Promise<void> {
  console.log('Signing out mock test user');
  auth.currentUser = null;
}

/**
 * Map Firebase User to UserInfo interface
 */
export function mapUserToUserInfo(user: User): UserInfo {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

/**
 * Generate a random room ID
 */
export function generateTestRoomId(): string {
  // Generate a 6-character alphanumeric ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Mock function to clear Firestore data
 */
export async function clearFirestoreData(db: any): Promise<void> {
  console.log('Mock clearing Firestore data');
  // In a real implementation, this would clear data
  // Since we're using mocks, it's a no-op
}
