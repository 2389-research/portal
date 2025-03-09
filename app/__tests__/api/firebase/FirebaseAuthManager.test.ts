import { FirebaseAuthManager } from '../../../api/firebase/FirebaseAuthManager';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInAnonymously,
  User,
} from 'firebase/auth';

// Mocks
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({
    name: 'test-app',
  })),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
  signInAnonymously: jest.fn(),
}));

describe('FirebaseAuthManager', () => {
  let authManager: FirebaseAuthManager;
  let mockAuth: any;
  let mockUser: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock user
    mockUser = {
      uid: 'test-uid',
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: 'https://example.com/photo.jpg',
      isAnonymous: false,
    };

    // Mock auth
    mockAuth = {
      currentUser: null,
    };

    // Mock getAuth
    (getAuth as jest.Mock).mockReturnValue(mockAuth);

    // Mock onAuthStateChanged to immediately call the callback
    (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      callback(mockAuth.currentUser);
      return () => {}; // Return a mock unsubscribe function
    });

    // Create auth manager instance
    authManager = new FirebaseAuthManager({
      apiKey: 'test-api-key',
      authDomain: 'test.firebaseapp.com',
    });
  });

  describe('signInWithGoogle', () => {
    it('should sign in with Google and return user info', async () => {
      // Mock signInWithPopup to return a user
      (signInWithPopup as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      // Connect first
      await authManager.connect();

      // Sign in with Google
      const userInfo = await authManager.signInWithGoogle();

      // Check that signInWithPopup was called
      expect(signInWithPopup).toHaveBeenCalled();
      expect(getAuth).toHaveBeenCalled();

      // Check returned user info
      expect(userInfo).toEqual({
        uid: mockUser.uid,
        displayName: mockUser.displayName,
        email: mockUser.email,
        photoURL: mockUser.photoURL,
      });
    });

    it('should handle error from Google sign in', async () => {
      // Mock signInWithPopup to throw an error
      (signInWithPopup as jest.Mock).mockRejectedValue(new Error('Google sign in failed'));

      // Connect first
      await authManager.connect();

      // Sign in with Google should throw
      await expect(authManager.signInWithGoogle()).rejects.toThrow('Google sign in failed');
    });
  });

  describe('signInAnonymously', () => {
    it('should sign in anonymously and return user info', async () => {
      // Mock anonymous user
      const anonymousUser = {
        uid: 'anon-uid',
        displayName: null,
        email: null,
        photoURL: null,
        isAnonymous: true,
      };

      // Mock signInAnonymously to return an anonymous user
      (signInAnonymously as jest.Mock).mockResolvedValue({
        user: anonymousUser,
      });

      // Connect first
      await authManager.connect();

      // Sign in anonymously
      const userInfo = await authManager.signInAnonymously();

      // Check that signInAnonymously was called
      expect(signInAnonymously).toHaveBeenCalled();
      expect(getAuth).toHaveBeenCalled();

      // Check returned user info
      expect(userInfo).toEqual({
        uid: anonymousUser.uid,
        displayName: null,
        email: null,
        photoURL: null,
      });
    });

    it('should sign in anonymously with a display name', async () => {
      // Mock anonymous user
      const anonymousUser = {
        uid: 'anon-uid',
        displayName: null,
        email: null,
        photoURL: null,
        isAnonymous: true,
      };

      // Mock signInAnonymously to return an anonymous user
      (signInAnonymously as jest.Mock).mockResolvedValue({
        user: anonymousUser,
      });

      // Connect first
      await authManager.connect();

      // Sign in anonymously with a display name
      const userInfo = await authManager.signInAnonymously(undefined, 'Custom Display Name');

      // Check that signInAnonymously was called
      expect(signInAnonymously).toHaveBeenCalled();
      expect(getAuth).toHaveBeenCalled();

      // Check returned user info with custom display name
      expect(userInfo).toEqual({
        uid: anonymousUser.uid,
        displayName: 'Custom Display Name',
        email: null,
        photoURL: null,
      });
    });

    it('should sign out first if current anonymous user uid does not match provided uuid', async () => {
      // Mock existing anonymous user
      const existingAnonymousUser = {
        uid: 'existing-anon-uid',
        displayName: null,
        email: null,
        photoURL: null,
        isAnonymous: true,
      };

      // Mock new anonymous user
      const newAnonymousUser = {
        uid: 'new-anon-uid',
        displayName: null,
        email: null,
        photoURL: null,
        isAnonymous: true,
      };

      // Set current user to anonymous
      mockAuth.currentUser = existingAnonymousUser;

      // Mock signInAnonymously to return a new anonymous user
      (signInAnonymously as jest.Mock).mockResolvedValue({
        user: newAnonymousUser,
      });

      // Connect first (this will set the currentUser)
      await authManager.connect();

      // Manually set the user in the auth manager (for test purposes)
      (authManager as any).user = existingAnonymousUser;

      // Sign in anonymously with a different UUID
      await authManager.signInAnonymously('different-uuid');

      // Should sign out first
      expect(signOut).toHaveBeenCalled();
      expect(signInAnonymously).toHaveBeenCalled();
    });

    it('should handle error from anonymous sign in', async () => {
      // Mock signInAnonymously to throw an error
      (signInAnonymously as jest.Mock).mockRejectedValue(new Error('Anonymous sign in failed'));

      // Connect first
      await authManager.connect();

      // Sign in anonymously should throw
      await expect(authManager.signInAnonymously()).rejects.toThrow('Anonymous sign in failed');
    });
  });

  describe('signOut', () => {
    it('should sign out successfully', async () => {
      // Connect first
      await authManager.connect();

      // Sign out
      await authManager.signOut();

      // Check that signOut was called
      expect(signOut).toHaveBeenCalled();
      expect(getAuth).toHaveBeenCalled();
    });

    it('should handle error from sign out', async () => {
      // Mock signOut to throw an error
      (signOut as jest.Mock).mockRejectedValue(new Error('Sign out failed'));

      // Connect first
      await authManager.connect();

      // Sign out should throw
      await expect(authManager.signOut()).rejects.toThrow('Sign out failed');
    });
  });

  describe('getCurrentUser', () => {
    it('should return null if no user is signed in', () => {
      // No user is signed in
      expect(authManager.getCurrentUser()).toBeNull();
    });

    it('should return user info if user is signed in', async () => {
      // Mock user is signed in
      (authManager as any).user = mockUser;

      // Get current user
      const userInfo = authManager.getCurrentUser();

      // Check returned user info
      expect(userInfo).toEqual({
        uid: mockUser.uid,
        displayName: mockUser.displayName,
        email: mockUser.email,
        photoURL: mockUser.photoURL,
      });
    });
  });

  describe('isSignedIn', () => {
    it('should return false if no user is signed in', () => {
      // No user is signed in
      expect(authManager.isSignedIn()).toBe(false);
    });

    it('should return true if user is signed in', async () => {
      // Mock user is signed in
      (authManager as any).user = mockUser;

      // Check if signed in
      expect(authManager.isSignedIn()).toBe(true);
    });
  });

  describe('getUserId', () => {
    it('should return user ID if user is signed in', async () => {
      // Mock user is signed in
      (authManager as any).user = mockUser;

      // Get user ID
      const userId = authManager.getUserId();

      // Check returned user ID
      expect(userId).toBe(mockUser.uid);
    });

    it('should generate a random ID if no user is signed in', () => {
      // Mock the generateRandomId method
      (authManager as any).generateRandomId = jest.fn().mockReturnValue('user-random-id');
      
      // No user is signed in
      const userId = authManager.getUserId();

      // Check that generateRandomId was called and the value returned
      expect((authManager as any).generateRandomId).toHaveBeenCalledWith('user');
      expect(userId).toBe('user-random-id');
    });
  });
});