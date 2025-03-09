import { SignalingService, SignalingMessage } from '../../services/signaling';
import { ApiInterface, JoinRoomResponse, RoomResponse } from '../../api/ApiInterface';

// Mock for createLogger
jest.mock('../../services/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

// Mock for Date.now
const mockTimestamp = 1234567890;
const originalDateNow = Date.now;
Date.now = jest.fn(() => mockTimestamp);

/**
 * Mock implementation of ApiInterface for testing
 */
class MockApiClient implements ApiInterface {
  private messageQueue: SignalingMessage[] = [];
  private mockUserId = 'test-user-id';
  private mockRoomId = 'test-room-id';
  private connected = false;
  private joinedRooms: Set<string> = new Set();

  async connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  getProviderName(): string {
    return 'MockApi';
  }

  async createRoom(): Promise<RoomResponse> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    this.joinedRooms.add(this.mockRoomId);
    return Promise.resolve({
      roomId: this.mockRoomId,
      userId: this.mockUserId,
      created: Date.now()
    });
  }

  async joinRoom(roomId: string): Promise<JoinRoomResponse> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    
    if (roomId === 'invalid-room') {
      throw new Error('Room not found');
    }
    
    this.joinedRooms.add(roomId);
    return Promise.resolve({
      userId: this.mockUserId,
      joined: Date.now()
    });
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    if (roomId === 'error-room') {
      throw new Error('Failed to leave room');
    }
    this.joinedRooms.delete(roomId);
    return Promise.resolve();
  }

  async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    
    if (roomId === 'error-room') {
      throw new Error('Failed to send signal');
    }
    
    this.messageQueue.push(message);
    return Promise.resolve();
  }

  async getSignals(roomId: string, since?: number): Promise<SignalingMessage[]> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    
    if (roomId === 'error-room') {
      throw new Error('Failed to get signals');
    }
    
    if (since) {
      return this.messageQueue.filter(msg => (msg.timestamp || 0) > since);
    }
    return [...this.messageQueue];
  }

  // Testing helper methods
  clearMessages(): void {
    this.messageQueue = [];
  }
  
  addTestMessage(message: SignalingMessage): void {
    this.messageQueue.push(message);
  }
  
  getQueuedMessages(): SignalingMessage[] {
    return [...this.messageQueue];
  }
}

describe('SignalingService', () => {
  let signaling: SignalingService;
  let mockApiClient: MockApiClient;
  
  // Setup interval spy
  let setIntervalSpy: jest.SpyInstance;
  let clearIntervalSpy: jest.SpyInstance;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock timestamp for consistent testing
    (Date.now as jest.Mock).mockReturnValue(mockTimestamp);
    
    // Setup interval spies
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    // Create mock API client
    mockApiClient = new MockApiClient();
    mockApiClient.connect();
    
    // Create signaling service with mock API client
    signaling = new SignalingService(mockApiClient);
  });

  afterEach(() => {
    // Restore spies
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    
    // Clean up any remaining polling
    if (signaling) {
      // Call private leaveRoom to clean up resources
      signaling.leaveRoom().catch(() => {});
    }
    
    // Clear mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
  });

  describe('Room operations', () => {
    test('should join a room successfully', async () => {
      const userId = await signaling.joinRoom('test-room-id');
      
      expect(userId).toBe('test-user-id');
      expect(signaling.getRoomId()).toBe('test-room-id');
      expect(signaling.getUserId()).toBe('test-user-id');
      expect(setIntervalSpy).toHaveBeenCalled();
    });

    test('should throw error when joining invalid room', async () => {
      await expect(signaling.joinRoom('invalid-room')).rejects.toThrow();
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
    });

    test('should create a room successfully', async () => {
      const result = await signaling.createRoom();
      
      expect(result.roomId).toBe('test-room-id');
      expect(result.userId).toBe('test-user-id');
      expect(signaling.getRoomId()).toBe('test-room-id');
      expect(signaling.getUserId()).toBe('test-user-id');
      expect(setIntervalSpy).toHaveBeenCalled();
    });

    test('should leave room successfully', async () => {
      // First join a room
      await signaling.joinRoom('test-room-id');
      
      // Then leave it
      await signaling.leaveRoom();
      
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    test('should handle error when leaving room', async () => {
      // First join an error-prone room
      jest.spyOn(mockApiClient, 'joinRoom').mockResolvedValueOnce({
        userId: 'test-user-id',
        joined: Date.now()
      });
      
      await signaling.joinRoom('error-room');
      
      // Then try to leave it (should handle error gracefully)
      await signaling.leaveRoom();
      
      // Should reset state even if API call fails
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
    });

    test('should validate room ID before joining', async () => {
      // Empty room ID
      await expect(signaling.joinRoom('')).rejects.toThrow();
      
      // Null room ID
      await expect(signaling.joinRoom(null as unknown as string)).rejects.toThrow();
    });
  });

  describe('Message polling', () => {
    beforeEach(async () => {
      // Join a room to enable polling
      await signaling.joinRoom('test-room-id');
      
      // Clear any messages
      mockApiClient.clearMessages();
      
      // Ensure setInterval was called
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    test('should start polling when joining a room', () => {
      // Already verified in beforeEach
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    test('should stop polling when leaving a room', async () => {
      await signaling.leaveRoom();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    test('should update lastMessageTime when receiving messages', async () => {
      // Add test messages with increasing timestamps
      const message1: SignalingMessage = {
        type: 'test',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: 1000
      };
      
      const message2: SignalingMessage = {
        type: 'test',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: 2000
      };
      
      mockApiClient.addTestMessage(message1);
      mockApiClient.addTestMessage(message2);
      
      // Mock getSignals to return our test messages
      const getSignalsSpy = jest.spyOn(mockApiClient, 'getSignals');
      getSignalsSpy.mockResolvedValueOnce([message1, message2]);
      
      // Manually trigger polling
      await (signaling as any).pollMessages();
      
      // Should have updated the lastMessageTime to the highest timestamp
      expect(getSignalsSpy).toHaveBeenCalledWith('test-room-id', mockTimestamp);
      expect((signaling as any).lastMessageTime).toBe(2000);
    });

    test('should not update lastMessageTime when no messages', async () => {
      // Set initial lastMessageTime
      (signaling as any).lastMessageTime = 5000;
      
      // Mock getSignals to return empty array
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([]);
      
      // Manually trigger polling
      await (signaling as any).pollMessages();
      
      // Should not have updated the lastMessageTime
      expect((signaling as any).lastMessageTime).toBe(5000);
    });

    test('should handle errors during polling', async () => {
      // Mock API error
      jest.spyOn(mockApiClient, 'getSignals').mockRejectedValueOnce(new Error('Network error'));
      
      // Set initial lastMessageTime
      (signaling as any).lastMessageTime = 5000;
      
      // Trigger polling, should not throw
      await expect((signaling as any).pollMessages()).resolves.not.toThrow();
      
      // Should keep lastMessageTime the same
      expect((signaling as any).lastMessageTime).toBe(5000);
    });
  });

  describe('Message handling', () => {
    let mockHandler: jest.Mock;
    
    beforeEach(async () => {
      // Join a room
      await signaling.joinRoom('test-room-id');
      
      // Setup mock handler
      mockHandler = jest.fn();
      signaling.on('test-event', mockHandler);
      
      // Clear any messages
      mockApiClient.clearMessages();
    });

    test('should register and handle message events', async () => {
      const message: SignalingMessage = {
        type: 'test-event',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Handler should have been called
      expect(mockHandler).toHaveBeenCalledWith(message);
    });

    test('should filter out own messages', async () => {
      // Create message from self (using the userId set during joinRoom)
      const message: SignalingMessage = {
        type: 'test-event',
        sender: 'test-user-id', // Same as the user ID returned by joinRoom
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Handler should NOT have been called (own message)
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should filter out messages for other receivers', async () => {
      // Create message intended for another user
      const message: SignalingMessage = {
        type: 'test-event',
        sender: 'other-user',
        receiver: 'not-this-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Handler should NOT have been called (different receiver)
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should handle targeted messages correctly', async () => {
      // Create message intended specifically for this user
      const message: SignalingMessage = {
        type: 'test-event',
        sender: 'other-user',
        receiver: 'test-user-id', // Same as userId from joinRoom
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Handler should have been called (message for this user)
      expect(mockHandler).toHaveBeenCalledWith(message);
    });

    test('should handle multiple message types', async () => {
      // Create handlers for two different message types
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      signaling.on('event1', handler1);
      signaling.on('event2', handler2);
      
      // Create messages of different types
      const message1: SignalingMessage = {
        type: 'event1',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data1' },
        timestamp: mockTimestamp + 1
      };
      
      const message2: SignalingMessage = {
        type: 'event2',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data2' },
        timestamp: mockTimestamp + 2
      };
      
      // Add messages to queue
      mockApiClient.addTestMessage(message1);
      mockApiClient.addTestMessage(message2);
      
      // Mock getSignals to return our test messages
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message1, message2]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Both handlers should have been called with their respective messages
      expect(handler1).toHaveBeenCalledWith(message1);
      expect(handler2).toHaveBeenCalledWith(message2);
    });

    test('should handle errors in message handlers', async () => {
      // Create a handler that throws an error
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      
      signaling.on('error-event', errorHandler);
      
      // Create a message that will trigger the error handler
      const message: SignalingMessage = {
        type: 'error-event',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling - should not throw despite handler error
      await expect((signaling as any).pollMessages()).resolves.not.toThrow();
      
      // Handler should have been called
      expect(errorHandler).toHaveBeenCalled();
    });

    test('should remove message handler with off()', async () => {
      // Register handler
      signaling.on('test-event', mockHandler);
      
      // Then remove it
      signaling.off('test-event');
      
      // Create a message
      const message: SignalingMessage = {
        type: 'test-event',
        sender: 'other-user',
        roomId: 'test-room-id',
        data: { test: 'data' },
        timestamp: mockTimestamp + 1
      };
      
      // Add message to queue
      mockApiClient.addTestMessage(message);
      
      // Mock getSignals to return our test message
      jest.spyOn(mockApiClient, 'getSignals').mockResolvedValueOnce([message]);
      
      // Trigger polling
      await (signaling as any).pollMessages();
      
      // Handler should NOT have been called (was removed)
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should clear all handlers when leaving room', async () => {
      // Register multiple handlers
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      signaling.on('event1', handler1);
      signaling.on('event2', handler2);
      
      // Leave room
      await signaling.leaveRoom();
      
      // Check that messageHandlers map is empty
      expect((signaling as any).messageHandlers.size).toBe(0);
    });
  });

  describe('Message sending', () => {
    beforeEach(async () => {
      // Join a room
      await signaling.joinRoom('test-room-id');
      
      // Clear any messages
      mockApiClient.clearMessages();
    });

    test('should send message correctly', async () => {
      // Spy on sendSignal method
      const sendSignalSpy = jest.spyOn(mockApiClient, 'sendSignal');
      
      // Send a message
      await signaling.sendMessage('test-type', { foo: 'bar' });
      
      // Check that sendSignal was called with correct parameters
      expect(sendSignalSpy).toHaveBeenCalledWith('test-room-id', {
        type: 'test-type',
        sender: 'test-user-id',
        roomId: 'test-room-id',
        data: { foo: 'bar' },
        timestamp: mockTimestamp
      });
    });

    test('should send message with receiver', async () => {
      // Spy on sendSignal method
      const sendSignalSpy = jest.spyOn(mockApiClient, 'sendSignal');
      
      // Send a message with receiver
      await signaling.sendMessage('test-type', { foo: 'bar' }, 'other-user');
      
      // Check that sendSignal was called with correct parameters
      expect(sendSignalSpy).toHaveBeenCalledWith('test-room-id', {
        type: 'test-type',
        sender: 'test-user-id',
        receiver: 'other-user',
        roomId: 'test-room-id',
        data: { foo: 'bar' },
        timestamp: mockTimestamp
      });
    });

    test('should throw when sending message while not in room', async () => {
      // Leave room first
      await signaling.leaveRoom();
      
      // Try to send message
      await expect(signaling.sendMessage('test-type', { foo: 'bar' }))
        .rejects.toThrow('Not connected to a room');
    });

    test('should handle send errors', async () => {
      // Mock sendSignal to throw error
      jest.spyOn(mockApiClient, 'sendSignal').mockRejectedValueOnce(new Error('Send error'));
      
      // Try to send message
      await expect(signaling.sendMessage('test-type', { foo: 'bar' }))
        .rejects.toThrow('Send error');
    });

    test('should send with forced room ID and user ID', async () => {
      // Spy on sendSignal method
      const sendSignalSpy = jest.spyOn(mockApiClient, 'sendSignal');
      
      // Send a message with forced room and user IDs
      await signaling.sendMessage('test-type', { foo: 'bar' }, undefined, 'forced-room', 'forced-user');
      
      // Check that sendSignal was called with correct parameters
      expect(sendSignalSpy).toHaveBeenCalledWith('forced-room', {
        type: 'test-type',
        sender: 'forced-user',
        roomId: 'forced-room',
        data: { foo: 'bar' },
        timestamp: mockTimestamp
      });
    });
  });

  describe('Error scenarios', () => {
    test('should handle API errors when joining room', async () => {
      // Mock API to throw error
      jest.spyOn(mockApiClient, 'joinRoom').mockRejectedValueOnce(new Error('API error'));
      
      // Try to join room
      await expect(signaling.joinRoom('test-room-id')).rejects.toThrow('Signaling error: API error');
      
      // Should not have set room or user ID
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
    });

    test('should handle API errors when creating room', async () => {
      // Mock API to throw error
      jest.spyOn(mockApiClient, 'createRoom').mockRejectedValueOnce(new Error('API error'));
      
      // Try to create room
      await expect(signaling.createRoom()).rejects.toThrow('API error');
      
      // Should not have set room or user ID
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
    });

    test('should handle network failures during polling', async () => {
      // First join a room
      await signaling.joinRoom('test-room-id');
      
      // Mock getSignals to simulate network failure
      jest.spyOn(mockApiClient, 'getSignals').mockRejectedValueOnce(new Error('Network failure'));
      
      // Manually trigger polling - should not throw
      await expect((signaling as any).pollMessages()).resolves.not.toThrow();
    });

    test('should handle API errors when leaving room', async () => {
      // First join a room
      await signaling.joinRoom('test-room-id');
      
      // Mock leaveRoom to throw error
      jest.spyOn(mockApiClient, 'leaveRoom').mockRejectedValueOnce(new Error('API error'));
      
      // Leave room - should not throw
      await expect(signaling.leaveRoom()).resolves.not.toThrow();
      
      // Should still have cleared state
      expect(signaling.getRoomId()).toBeNull();
      expect(signaling.getUserId()).toBeNull();
    });
  });
});