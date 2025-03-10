import type { ChatMessage } from '../../services/chat/ChatManager';
import type { WebRTCManager } from '../../services/webrtc';

// Create the mocks
const mockImplementationChatManager = {
  initialize: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn(),
  onMessage: jest.fn(),
  getMessages: jest.fn().mockReturnValue([]),
  isReady: jest.fn().mockReturnValue(true),
  waitForReady: jest.fn().mockResolvedValue(true),
  close: jest.fn(),
  dispose: jest.fn(),
};

// Mock the underlying ChatManager
jest.mock('../../services/chat/ChatManager', () => {
  return {
    ChatManager: jest.fn().mockImplementation(() => mockImplementationChatManager),
  };
});

// Import the ChatManager after the mock is set up
import { ChatManager } from '../../services/chat';

// Mock logger
jest.mock('../../services/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('ChatManager', () => {
  let mockWebRTCManager: jest.Mocked<WebRTCManager>;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock WebRTCManager
    mockWebRTCManager = {
      initialize: jest.fn(),
      createDataChannel: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<WebRTCManager>;
  });

  describe('Basic Functionality', () => {
    test('should initialize successfully', async () => {
      // Get the mock implementation module
      const { ChatManager: MockImplementation } = require('../../services/chat/ChatManager');

      // Create a ChatManager
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);

      // Call initialize
      const result = await chatManager.initialize(true);

      // Verify the mock implementation was called
      expect(MockImplementation).toHaveBeenCalledWith(testUserId, mockWebRTCManager);

      // Verify result
      expect(result).toBe(true);
    });

    test('should send messages', () => {
      // Create a mock message
      const mockMessage: ChatMessage = {
        id: 'msg-123',
        sender: testUserId,
        content: 'Test message',
        timestamp: Date.now(),
        isLocal: true,
      };

      // Setup the mock to return our message
      mockImplementationChatManager.sendMessage.mockReturnValue(mockMessage);

      // Create ChatManager and send message
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      const result = chatManager.sendMessage('Test message');

      // Verify message was sent through implementation
      expect(mockImplementationChatManager.sendMessage).toHaveBeenCalledWith('Test message');
      expect(result).toBe(mockMessage);
    });

    test('should set message callback', () => {
      // Create a callback
      const callback = jest.fn();

      // Create ChatManager and set callback
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      chatManager.onMessage(callback);

      // Verify callback was set
      expect(mockImplementationChatManager.onMessage).toHaveBeenCalledWith(callback);
    });

    test('should get messages', () => {
      // Create mock messages
      const mockMessages = [
        {
          id: 'msg-1',
          sender: testUserId,
          content: 'Hello',
          timestamp: Date.now() - 1000,
          isLocal: true,
        },
        { id: 'msg-2', sender: 'other-user', content: 'Hi', timestamp: Date.now(), isLocal: false },
      ];

      // Set up mock to return messages
      mockImplementationChatManager.getMessages.mockReturnValue(mockMessages);

      // Create ChatManager and get messages
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      const result = chatManager.getMessages();

      // Verify getMessages was called and returned correct result
      expect(mockImplementationChatManager.getMessages).toHaveBeenCalled();
      expect(result).toBe(mockMessages);
    });

    test('should check if ready', () => {
      // Set up mock to return ready state
      mockImplementationChatManager.isReady.mockReturnValue(true);

      // Create ChatManager and check ready state
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      const result = chatManager.isReady();

      // Verify isReady was called and returned correct result
      expect(mockImplementationChatManager.isReady).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should wait for channel to be ready', async () => {
      // Set up mock to resolve with ready state
      mockImplementationChatManager.waitForReady.mockResolvedValue(true);

      // Create ChatManager and wait for channel
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      const result = await chatManager.waitForChannelReady(5000);

      // Verify waitForReady was called with correct timeout
      expect(mockImplementationChatManager.waitForReady).toHaveBeenCalledWith(5000);
      expect(result).toBe(true);
    });

    test('should close the connection', () => {
      // Create ChatManager and close
      const chatManager = new ChatManager(testUserId, mockWebRTCManager);
      chatManager.close();

      // Verify close was called
      expect(mockImplementationChatManager.close).toHaveBeenCalled();
    });
  });
});
