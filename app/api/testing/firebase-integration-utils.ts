/**
 * Firebase Integration Test Utilities
 * Helper functions and setup for integration testing with Firebase Emulator
 */

import { FirebaseOptions, getApp, initializeApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  UserCredential,
  Auth,
  signOut as firebaseSignOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator, 
  Firestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  limit,
  DocumentData 
} from 'firebase/firestore';
import { UserInfo } from '../ApiInterface';

// Test configuration for Firebase Emulator
export const FIREBASE_EMULATOR_CONFIG: FirebaseOptions = {
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
  displayName: 'Test User'
};

/**
 * Initialize Firebase with emulator connections
 * This should be called in the test setup
 */
export async function initializeFirebaseEmulator(): Promise<{
  app: ReturnType<typeof getApp>;
  auth: Auth;
  db: Firestore;
}> {
  let app;
  
  // Initialize or get existing Firebase app
  try {
    app = getApp();
    console.log('Using existing Firebase app instance for tests');
  } catch (error) {
    console.log('Initializing new Firebase app for tests');
    app = initializeApp(FIREBASE_EMULATOR_CONFIG, 'emulator-tests');
  }
  
  // Initialize authentication and connect to emulator
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  
  // Initialize Firestore and connect to emulator
  const db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);
  
  console.log('Firebase emulator connections established');
  
  return { app, auth, db };
}

/**
 * Create a test user account in the Firebase Auth emulator
 */
export async function createTestUser(auth: Auth): Promise<UserCredential> {
  try {
    // Try signing in with existing credentials
    return await signInWithEmailAndPassword(auth, TEST_USER.email, TEST_USER.password);
  } catch (error) {
    // If user doesn't exist, create a new one
    console.log('Creating new test user in Auth emulator');
    return await createUserWithEmailAndPassword(auth, TEST_USER.email, TEST_USER.password);
  }
}

/**
 * Sign out the current user
 */
export async function signOutTestUser(auth: Auth): Promise<void> {
  await firebaseSignOut(auth);
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
 * Clear all Firestore collections used in tests
 * This should be called in afterEach or afterAll hooks
 */
export async function clearFirestoreData(db: Firestore): Promise<void> {
  const collectionsToClean = ['rooms'];
  
  for (const collectionName of collectionsToClean) {
    await clearCollection(db, collectionName);
  }
}

/**
 * Clear a specific Firestore collection
 */
async function clearCollection(db: Firestore, collectionName: string): Promise<void> {
  console.log(`Clearing collection: ${collectionName}`);
  
  // Firestore limits batch operations to 500 documents
  const batchSize = 500;
  
  // Query for documents in batches
  const q = query(collection(db, collectionName), limit(batchSize));
  let documentsFound = true;
  
  while (documentsFound) {
    const snapshot = await getDocs(q);
    documentsFound = !snapshot.empty;
    
    if (!documentsFound) {
      console.log(`No more documents in collection: ${collectionName}`);
      break;
    }
    
    // Create and commit a delete batch
    const batch = writeBatch(db);
    snapshot.docs.forEach((document) => {
      batch.delete(doc(db, collectionName, document.id));
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} documents from ${collectionName}`);
  }
}