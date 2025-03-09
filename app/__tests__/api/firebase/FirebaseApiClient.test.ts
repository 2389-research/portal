import { FirebaseApiClient } from '../../../api/firebase/FirebaseApiClient';
import { FirebaseAuthManager } from '../../../api/firebase/FirebaseAuthManager';
import { FirebaseRoomManager } from '../../../api/firebase/FirebaseRoomManager';
import { FirebaseSignalingManager } from '../../../api/firebase/FirebaseSignalingManager';

// Mock the Firebase managers
jest.mock('../../../api/firebase/FirebaseAuthManager');
jest.mock('../../../api/firebase/FirebaseRoomManager');
jest.mock('../../../api/firebase/FirebaseSignalingManager');

describe('FirebaseApiClient', () => {
  let apiClient: FirebaseApiClient;
  let mockAuthManager: any;
  let mockRoomManager: any;
  let mockSignalingManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock implementations directly
    mockAuthManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      signInWithGoogle: jest.fn().mockResolvedValue({
        uid: 'test-uid',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: 'https://example.com/photo.jpg',
      }),
      signInAnonymously: jest.fn().mockResolvedValue({
        uid: 'anon-uid',
        displayName: 'Anonymous User',
        email: null,
        photoURL: null,
      }),
      signOut: jest.fn().mockResolvedValue(undefined),
      getUserId: jest.fn().mockReturnValue('test-user-id'),
      getCurrentUser: jest.fn().mockReturnValue({
        uid: 'test-uid',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: 'https://example.com/photo.jpg',
      }),
      isSignedIn: jest.fn().mockReturnValue(true),
      onAuthStateChanged: jest.fn(),
    };
    
    mockRoomManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      createRoom: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn().mockResolvedValue(undefined),
    };
    
    mockSignalingManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendSignal: jest.fn().mockResolvedValue(undefined),
      getSignals: jest.fn().mockResolvedValue([]),
    };

    // Inject mocks into the API client
    apiClient = new FirebaseApiClient({
      apiKey: 'test-api-key',
      authDomain: 'test.firebaseapp.com',
    });
    (apiClient as any).authManager = mockAuthManager;
    (apiClient as any).roomManager = mockRoomManager;
    (apiClient as any).signalingManager = mockSignalingManager;
  });

  describe('connect', () => {
    it('should connect to all Firebase services', async () => {
      // Set up mock implementations
      mockAuthManager.connect.mockResolvedValue();
      mockRoomManager.connect.mockResolvedValue();
      mockSignalingManager.connect.mockResolvedValue();

      // Call connect
      await apiClient.connect();

      // Verify all services were connected
      expect(mockAuthManager.connect).toHaveBeenCalled();
      expect(mockRoomManager.connect).toHaveBeenCalled();
      expect(mockSignalingManager.connect).toHaveBeenCalled();
    });

    it('should handle errors during connect', async () => {
      // Set up a mock implementation that throws
      mockAuthManager.connect.mockRejectedValue(new Error('Connection error'));

      // Call connect and expect it to throw
      await expect(apiClient.connect()).rejects.toThrow('Connection error');
    });
  });

  describe('signInAnonymously', () => {
    it('should call authManager.signInAnonymously with the provided parameters', async () => {
      // Set up mock implementation
      const mockUserInfo = {
        uid: 'test-uid',
        displayName: 'Test User',
        email: null,
        photoURL: null,
      };
      mockAuthManager.signInAnonymously.mockResolvedValue(mockUserInfo);

      // Call signInAnonymously
      const result = await apiClient.signInAnonymously('test-uuid', 'Test Display Name');

      // Verify authManager.signInAnonymously was called with the right parameters
      expect(mockAuthManager.signInAnonymously).toHaveBeenCalledWith('test-uuid', 'Test Display Name');
      expect(result).toEqual(mockUserInfo);
    });

    it('should handle errors during anonymous sign in', async () => {
      // Set up a mock implementation that throws
      mockAuthManager.signInAnonymously.mockRejectedValue(new Error('Anonymous sign in failed'));

      // Call signInAnonymously and expect it to throw
      await expect(apiClient.signInAnonymously('test-uuid')).rejects.toThrow('Anonymous sign in failed');
    });
  });

  describe('createRoom', () => {
    it('should get the user ID and call roomManager.createRoom', async () => {
      // Set up mock implementations
      mockAuthManager.getUserId.mockReturnValue('test-user-id');
      mockRoomManager.createRoom.mockResolvedValue({
        roomId: 'test-room-id',
        userId: 'test-user-id',
        created: Date.now(),
      });

      // Call createRoom
      const result = await apiClient.createRoom();

      // Verify the correct methods were called
      expect(mockAuthManager.getUserId).toHaveBeenCalled();
      expect(mockRoomManager.createRoom).toHaveBeenCalledWith('test-user-id');
      expect(result).toEqual({
        roomId: 'test-room-id',
        userId: 'test-user-id',
        created: expect.any(Number),
      });
    });
  });

  describe('joinRoom', () => {
    it('should get the user ID and call roomManager.joinRoom', async () => {
      // Set up mock implementations
      mockAuthManager.getUserId.mockReturnValue('test-user-id');
      mockRoomManager.joinRoom.mockResolvedValue({
        userId: 'test-user-id',
        joined: Date.now(),
      });

      // Call joinRoom
      const result = await apiClient.joinRoom('test-room-id');

      // Verify the correct methods were called
      expect(mockAuthManager.getUserId).toHaveBeenCalled();
      expect(mockRoomManager.joinRoom).toHaveBeenCalledWith('test-room-id', 'test-user-id');
      expect(result).toEqual({
        userId: 'test-user-id',
        joined: expect.any(Number),
      });
    });
  });

  describe('getProviderName', () => {
    it('should return "Firebase"', () => {
      expect(apiClient.getProviderName()).toBe('Firebase');
    });
  });
});