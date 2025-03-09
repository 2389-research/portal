/**
 * Jest setup file for Firebase integration tests
 * This file configures Jest to work with the Firebase emulator
 */

/* eslint-disable no-undef */

// Set environment variables to enable Firebase emulator mode
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Increase Jest timeout for integration tests
jest.setTimeout(30000);

// Mock Firebase App
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApp: jest.fn(() => ({})),
  FirebaseApp: jest.fn(),
  FirebaseOptions: jest.fn(),
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: null,
    onAuthStateChanged: jest.fn(),
  })),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null);
    return jest.fn(); // Return unsubscribe function
  }),
  signOut: jest.fn(),
  connectAuthEmulator: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
  getDoc: jest.fn(() => ({
    exists: () => true,
    data: () => ({}),
  })),
  setDoc: jest.fn(),
  addDoc: jest.fn(),
  getDocs: jest.fn(() => ({
    empty: false,
    size: 1,
    docs: [
      {
        id: 'test-doc',
        data: () => ({}),
      },
    ],
    forEach: jest.fn(),
  })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  connectFirestoreEmulator: jest.fn(),
  Timestamp: {
    fromMillis: jest.fn((millis) => ({
      toMillis: () => millis,
      toDate: () => new Date(millis),
      _milliseconds: millis,
      // Add these to make comparisons and serialization work
      isEqual: function (other) {
        return other && other._milliseconds === this._milliseconds;
      },
      toString: function () {
        return `Timestamp(seconds=${Math.floor(this._milliseconds / 1000)}, nanoseconds=${(this._milliseconds % 1000) * 1000000})`;
      },
    })),
  },
  writeBatch: jest.fn(() => ({
    delete: jest.fn(),
    commit: jest.fn(),
  })),
}));

// Silence console logs if desired (uncomment to enable)
// global.console.log = jest.fn();
global.console.info = jest.fn();
global.console.debug = jest.fn();

// Don't silence errors and warnings
// global.console.warn = jest.fn();
// global.console.error = jest.fn();

// Export the mocks for use in tests if needed
module.exports = {
  firebaseAppMock: require('firebase/app'),
  firebaseAuthMock: require('firebase/auth'),
  firebaseFirestoreMock: require('firebase/firestore'),
};
