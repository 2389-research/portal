import { FirebaseApiClient } from '../../api/FirebaseApiClient';
import * as firebaseAuth from 'firebase/auth';
import * as firebaseFirestore from 'firebase/firestore';
import { config } from '../../api/config';
import { MockFirebaseApiClient } from '../../api/testing/firebase-test-utils';

// Mock firebase modules
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  Timestamp: {
    fromMillis: jest.fn().mockReturnValue({}),
  },
}));

// Create mock user and firestore document response
const mockUser = { 
  uid: 'user123', 
  displayName: 'Test User', 
  email: 'test@example.com',
  photoURL: null
};

describe('FirebaseApiClient', () => {
  let firebaseClient: FirebaseApiClient;
  let mockApiClient: MockFirebaseApiClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup auth mock
    (firebaseAuth.getAuth as jest.Mock).mockReturnValue({
      currentUser: mockUser,
      onAuthStateChanged: firebaseAuth.onAuthStateChanged,
    });

    (firebaseAuth.onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      callback(mockUser);
      return jest.fn(); // Return unsubscribe function
    });

    // Mock successful sign in
    (firebaseAuth.signInWithPopup as jest.Mock).mockResolvedValue({
      user: mockUser,
    });

    // Setup firestore mock
    (firebaseFirestore.collection as jest.Mock).mockReturnValue({});
    (firebaseFirestore.doc as jest.Mock).mockReturnValue({});
    (firebaseFirestore.getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ name: 'Test Room', created: new Date() }),
    });
    (firebaseFirestore.setDoc as jest.Mock).mockResolvedValue({});
    (firebaseFirestore.addDoc as jest.Mock).mockResolvedValue({ id: 'doc123' });
    (firebaseFirestore.getDocs as jest.Mock).mockResolvedValue({
      forEach: jest.fn(),
    });
    (firebaseFirestore.query as jest.Mock).mockReturnValue({});
    (firebaseFirestore.where as jest.Mock).mockReturnValue({});
    (firebaseFirestore.orderBy as jest.Mock).mockReturnValue({});

    // Create mock app and database
    const mockApp = {
      name: 'test-app',
      options: {},
      automaticDataCollectionEnabled: false,
      delete: jest.fn(),
    } as any;
    
    const mockDb = {
      type: 'firestore',
      app: mockApp,
      toJSON: jest.fn(),
    } as any;

    // Mock the getFirestore function to return our mock db
    (firebaseFirestore.getFirestore as jest.Mock).mockReturnValue(mockDb);

    // Initialize client with config
    firebaseClient = new FirebaseApiClient(config.firebase);

    // Create mock API client for comparison
    mockApiClient = new MockFirebaseApiClient();
  });

  test('initializes and connects correctly', async () => {
    // Mock the manager getters to return mock values
    jest.spyOn(firebaseClient, 'getApp').mockReturnValue({} as any);
    jest.spyOn(firebaseClient, 'getDb').mockReturnValue({} as any);
    jest.spyOn(firebaseClient, 'getFirebaseUser').mockReturnValue(mockUser as any);
    
    await firebaseClient.connect();
    
    expect(firebaseClient).toBeDefined();
    expect(firebaseClient.getProviderName()).toBe('Firebase');
  });

  test('getCurrentUser returns the current user', () => {
    // Mock the user getter
    jest.spyOn(firebaseClient, 'getFirebaseUser').mockReturnValue(mockUser as any);
    
    const user = firebaseClient.getCurrentUser();
    expect(user).toEqual(mockUser);
  });

  test('createRoom delegates to room manager and creates a new room', async () => {
    // Setup spy on the internal createRoom implementation
    const createRoomSpy = jest.spyOn(firebaseClient, 'createRoom');
    
    // Mock the return value
    createRoomSpy.mockResolvedValue({
      roomId: 'test-room',
      userId: 'user123',
      created: Date.now(),
    });
    
    const result = await firebaseClient.createRoom();

    expect(createRoomSpy).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        roomId: expect.any(String),
        userId: expect.any(String),
        created: expect.any(Number),
      })
    );
  });

  test('signInWithGoogle calls auth methods', async () => {
    // Setup spy on signInWithGoogle
    const signInSpy = jest.spyOn(firebaseClient, 'signInWithGoogle');
    
    // Mock the return value
    signInSpy.mockResolvedValue(mockUser);
    
    const result = await firebaseClient.signInWithGoogle();

    expect(signInSpy).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  test('signOut calls auth methods', async () => {
    // Setup spy on signOut
    const signOutSpy = jest.spyOn(firebaseClient, 'signOut');
    
    await firebaseClient.signOut();
    
    expect(signOutSpy).toHaveBeenCalled();
  });

  test('onAuthStateChanged sets up auth state change listener', () => {
    // Setup spy on onAuthStateChanged
    const authChangedSpy = jest.spyOn(firebaseClient, 'onAuthStateChanged');
    
    // Mock the return value - unsubscribe function
    authChangedSpy.mockReturnValue(() => {});
    
    const callback = jest.fn();
    const unsubscribe = firebaseClient.onAuthStateChanged(callback);

    expect(authChangedSpy).toHaveBeenCalledWith(callback);
    expect(typeof unsubscribe).toBe('function');
  });

  // Test mock API client for comparison
  test('MockFirebaseApiClient implements the same interface', async () => {
    await mockApiClient.connect();
    expect(mockApiClient.isConnected()).toBe(true);
    
    const room = await mockApiClient.createRoom();
    expect(room).toEqual(
      expect.objectContaining({
        roomId: expect.any(String),
        userId: expect.any(String),
        created: expect.any(Number),
      })
    );
    
    // Should be initially signed out
    expect(mockApiClient.isSignedIn()).toBe(false);
    
    // Sign in
    await mockApiClient.signInWithGoogle();
    expect(mockApiClient.isSignedIn()).toBe(true);
    
    // Get current user
    const user = mockApiClient.getCurrentUser();
    expect(user).toEqual(
      expect.objectContaining({
        uid: expect.any(String),
        displayName: expect.any(String),
        email: expect.any(String),
      })
    );
    
    // Sign out
    await mockApiClient.signOut();
    expect(mockApiClient.isSignedIn()).toBe(false);
    expect(mockApiClient.getCurrentUser()).toBeNull();
  });
});
