/**
 * Shared Firebase mocks for Jest tests
 * This file centralizes all Firebase mocking to ensure consistent behavior
 */

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

// Mock Firebase App module
jest.mock('firebase/app', () => {
  const mockApp = { name: 'mock-app' };

  return {
    initializeApp: jest.fn(() => mockApp),
    getApp: jest.fn().mockImplementation(() => {
      throw new Error('No app found');
    }),
  };
});

// Mock Firebase Auth module
jest.mock('firebase/auth', () => {
  // Mock authentication state
  let currentUser = null;
  const listeners = [];

  // Mock user data
  const mockUser = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null,
  };

  // Mock auth functions
  const mockSignIn = jest.fn().mockImplementation(() => {
    currentUser = mockUser;
    listeners.forEach((listener) => listener(currentUser));
    return Promise.resolve({ user: currentUser });
  });

  const mockSignOut = jest.fn().mockImplementation(() => {
    currentUser = null;
    listeners.forEach((listener) => listener(null));
    return Promise.resolve();
  });

  const mockAuthStateChanged = jest.fn().mockImplementation((auth, callback) => {
    // Add listener
    listeners.push(callback);

    // Call immediately with current state
    callback(currentUser);

    // Return working unsubscribe function
    return jest.fn(() => {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    });
  });

  return {
    getAuth: jest.fn(() => ({
      currentUser,
      app: { name: 'mock-app' },
    })),
    onAuthStateChanged: mockAuthStateChanged,
    signInWithPopup: mockSignIn,
    GoogleAuthProvider: jest.fn(() => ({})),
    signOut: mockSignOut,
    connectAuthEmulator: jest.fn(),
  };
});

// Mock Firebase Firestore module
jest.mock('firebase/firestore', () => {
  // Storage for our mock data
  const mockStore = {
    rooms: {},
    signals: {},
    users: {},
  };

  // Mock document reference
  const mockDoc = jest.fn().mockImplementation((db, collection, id, subcollection, docId) => {
    const path =
      subcollection && docId
        ? `${collection}/${id}/${subcollection}/${docId}`
        : `${collection}/${id}`;

    return {
      id: id || 'mock-doc-id',
      path,
    };
  });

  // Mock collection reference
  const mockCollection = jest
    .fn()
    .mockImplementation((db, collectionPath, docPath, subCollection) => {
      const path = subCollection ? `${collectionPath}/${docPath}/${subCollection}` : collectionPath;

      return {
        id: path.split('/').pop(),
        path,
      };
    });

  // Mock getDoc to return data from our store
  const mockGetDoc = jest.fn().mockImplementation((docRef) => {
    // Parse the path to determine the response
    const pathParts = docRef.path.split('/');
    let mockData = {};
    let exists = false;

    if (pathParts[0] === 'rooms') {
      const roomId = pathParts[1];
      if (mockStore.rooms[roomId]) {
        if (pathParts.length === 2) {
          // Room document
          mockData = mockStore.rooms[roomId];
          exists = true;
        } else if (pathParts.length === 4 && pathParts[2] === 'users') {
          // User in room document
          const userId = pathParts[3];
          if (mockStore.rooms[roomId].users?.[userId]) {
            mockData = mockStore.rooms[roomId].users[userId];
            exists = true;
          }
        }
      }
    }

    return {
      exists: () => exists,
      data: () => mockData || { active: true },
    };
  });

  // Mock setDoc to update our store
  const mockSetDoc = jest.fn().mockImplementation((docRef, data) => {
    const pathParts = docRef.path.split('/');

    if (pathParts[0] === 'rooms') {
      const roomId = pathParts[1];

      // Initialize room if needed
      if (!mockStore.rooms[roomId]) {
        mockStore.rooms[roomId] = {
          users: {},
        };
      }

      // If this is a user document
      if (pathParts.length === 4 && pathParts[2] === 'users') {
        const userId = pathParts[3];
        if (!mockStore.rooms[roomId].users) {
          mockStore.rooms[roomId].users = {};
        }
        mockStore.rooms[roomId].users[userId] = {
          ...data,
        };
      } else {
        // This is a room document
        mockStore.rooms[roomId] = {
          ...mockStore.rooms[roomId],
          ...data,
        };
      }
    }

    return Promise.resolve();
  });

  // Mock addDoc for signals
  const mockAddDoc = jest.fn().mockImplementation((collectionRef, data) => {
    const pathParts = collectionRef.path.split('/');
    if (pathParts.length === 3 && pathParts[0] === 'rooms' && pathParts[2] === 'signals') {
      const roomId = pathParts[1];

      // Initialize signals array for room if needed
      if (!mockStore.signals[roomId]) {
        mockStore.signals[roomId] = [];
      }

      // Add signal with generated ID
      const docId = `signal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      mockStore.signals[roomId].push({
        id: docId,
        ...data,
      });

      return Promise.resolve({ id: docId });
    }

    return Promise.resolve({ id: 'mock-doc-id' });
  });

  // Mock query and related functions
  const mockQuery = jest.fn().mockImplementation((collection) => collection);
  const mockWhere = jest.fn().mockImplementation((query, field, op, value) => query);
  const mockOrderBy = jest.fn().mockImplementation((query, field, direction) => query);

  // Mock getDocs to retrieve data from our store
  const mockGetDocs = jest.fn().mockImplementation((query) => {
    const pathParts = query.path.split('/');

    if (pathParts.length === 3 && pathParts[0] === 'rooms' && pathParts[2] === 'signals') {
      const roomId = pathParts[1];
      const signals = mockStore.signals[roomId] || [];

      return {
        empty: signals.length === 0,
        size: signals.length,
        docs: signals.map((signal) => ({
          id: signal.id,
          data: () => signal,
        })),
        forEach: (callback) =>
          signals.forEach((signal) => callback({ id: signal.id, data: () => signal })),
      };
    }

    return {
      empty: true,
      size: 0,
      docs: [],
      forEach: () => {},
    };
  });

  // Create a proper mock Firestore db object that can be returned by getFirestore
  const mockDb = {
    app: { name: 'mock-app' },
    collection: mockCollection,
    doc: mockDoc,
    // Add other properties that might be accessed
    type: 'firestore',
    toJSON: () => ({ type: 'firestore' }),
  };

  return {
    getFirestore: jest.fn(() => mockDb),
    doc: mockDoc,
    collection: mockCollection,
    getDoc: mockGetDoc,
    getDocs: mockGetDocs,
    setDoc: mockSetDoc,
    addDoc: mockAddDoc,
    query: mockQuery,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: jest.fn((query) => query),
    Timestamp: {
      fromMillis: jest.fn((millis) => ({
        toMillis: () => millis,
        toDate: () => new Date(millis),
      })),
    },
  };
});

// Export mock store for test manipulation if needed
module.exports = {
  getMockStore: () => {
    const firestore = require('firebase/firestore');
    return {
      resetMockData: () => {
        // Reset all mocks
        jest.clearAllMocks();
      },
    };
  },
};
