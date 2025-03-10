import { ChatManager, type ChatMessage } from '../../../services/chat/ChatManager';
import {
  DataChannelManager,
  type DataChannelMessage,
} from '../../../services/chat/DataChannelManager';
import type { WebRTCManager } from '../../../services/webrtc';

// Define global setTimeout and clearTimeout if needed
if (typeof global.setTimeout !== 'function') {
  global.setTimeout = jest.fn().mockImplementation((cb) => {
    cb();
    return 1;
  });
}

if (typeof global.clearTimeout !== 'function') {
  global.clearTimeout = jest.fn();
}

// Mock logger
jest.mock('../../../services/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock DataChannelManager
jest.mock('../../../services/chat/DataChannelManager');

describe('ChatManager', () => {
  let chatManager: ChatManager;
  let mockWebRTCManager: jest.Mocked<WebRTCManager>;
  let mockDataChannelManager: jest.Mocked<DataChannelManager>;

  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Create mock for WebRTCManager
    mockWebRTCManager = {
      initialize: jest.fn(),
      createDataChannel: jest.fn(),
      close: jest.fn(),
      setOnDataChannel: jest.fn(),
    } as unknown as jest.Mocked<WebRTCManager>;

    // Set up mock for DataChannelManager
    mockDataChannelManager = {
      initialize: jest.fn().mockResolvedValue(true),
      send: jest.fn(),
      onMessage: jest.fn(),
      isReady: jest.fn(),
      waitForChannelReady: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<DataChannelManager>;

    // Mock the constructor of DataChannelManager
    (DataChannelManager as jest.Mock).mockImplementation(() => mockDataChannelManager);

    // Create the ChatManager instance
    chatManager = new ChatManager(testUserId, mockWebRTCManager);
  });

  //-------------------------------------------------------------------------
  // 1. Message Handling Tests
  //-------------------------------------------------------------------------

  describe('Message Handling', () => {
    test('should send message successfully when channel is ready', () => {
      // Setup mock to indicate channel is ready
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(true);

      // Send a message
      const content = 'Test message content';
      const result = chatManager.sendMessage(content);

      // Verify DataChannelManager.send was called with correct message
      expect(mockDataChannelManager.send).toHaveBeenCalledTimes(1);
      const sentMessage = mockDataChannelManager.send.mock.calls[0][0];
      expect(sentMessage).toMatchObject({
        sender: testUserId,
        content,
      });

      // Verify the returned message
      expect(result).not.toBeNull();
      expect(result?.content).toBe(content);
      expect(result?.sender).toBe(testUserId);
      expect(result?.isLocal).toBe(true);
      expect(typeof result?.id).toBe('string');
      expect(typeof result?.timestamp).toBe('number');
    });

    test('should return null when sending message and channel is not ready', () => {
      // Setup mock to indicate channel is not ready
      mockDataChannelManager.isReady.mockReturnValue(false);

      // Try to send a message
      const result = chatManager.sendMessage('Test message');

      // Verify DataChannelManager.send was not called
      expect(mockDataChannelManager.send).not.toHaveBeenCalled();

      // Verify null was returned
      expect(result).toBeNull();
    });

    test('should return null when message fails to send', () => {
      // Setup mock to indicate channel is ready but send fails
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(false);

      // Try to send a message
      const result = chatManager.sendMessage('Test message');

      // Verify DataChannelManager.send was called
      expect(mockDataChannelManager.send).toHaveBeenCalledTimes(1);

      // Verify null was returned
      expect(result).toBeNull();
    });

    test('should handle incoming messages from data channel', () => {
      // Capture the callback function passed to onMessage
      let messageCallback: ((message: DataChannelMessage) => void) | null = null;
      mockDataChannelManager.onMessage.mockImplementation((callback) => {
        messageCallback = callback;
      });

      // Create a new ChatManager to trigger the onMessage registration
      chatManager = new ChatManager(testUserId, mockWebRTCManager);

      // Verify onMessage was called (at least once)
      expect(mockDataChannelManager.onMessage).toHaveBeenCalled();
      expect(messageCallback).not.toBeNull();

      // Set up message callback to capture received messages
      const receivedMessages: ChatMessage[] = [];
      chatManager.onMessage((message) => {
        receivedMessages.push(message);
      });

      // Simulate a message coming in via the data channel
      const incomingMessage: DataChannelMessage = {
        id: 'msg-123',
        sender: 'remote-user',
        content: 'Hello from remote',
        timestamp: Date.now(),
      };

      // Trigger the message callback
      if (messageCallback) {
        messageCallback(incomingMessage);
      }

      // Verify the message was received and transformed correctly
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0]).toMatchObject({
        id: incomingMessage.id,
        sender: incomingMessage.sender,
        content: incomingMessage.content,
        timestamp: incomingMessage.timestamp,
        isLocal: false,
      });

      // Verify the message was added to the internal messages list
      expect(chatManager.getMessages()).toContainEqual(receivedMessages[0]);
    });

    test('should add messages to the internal list', () => {
      // Setup for sending and receiving messages
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(true);

      // Capture the onMessage callback
      let messageCallback: ((message: DataChannelMessage) => void) | null = null;
      mockDataChannelManager.onMessage.mockImplementation((callback) => {
        messageCallback = callback;
      });

      // Create a new ChatManager
      chatManager = new ChatManager(testUserId, mockWebRTCManager);

      // Send a local message
      const localMessage = chatManager.sendMessage('Local message');

      // Simulate receiving a remote message
      const remoteMessage: DataChannelMessage = {
        id: 'remote-msg-123',
        sender: 'remote-user',
        content: 'Remote message',
        timestamp: Date.now(),
      };

      if (messageCallback) {
        messageCallback(remoteMessage);
      }

      // Get all messages
      const messages = chatManager.getMessages();

      // Verify both messages are in the list
      expect(messages.length).toBe(2);

      // Verify the local message
      const foundLocalMessage = messages.find((msg) => msg.id === localMessage?.id);
      expect(foundLocalMessage).toBeDefined();
      expect(foundLocalMessage?.isLocal).toBe(true);
      expect(foundLocalMessage?.sender).toBe(testUserId);

      // Verify the remote message
      const foundRemoteMessage = messages.find((msg) => msg.id === remoteMessage.id);
      expect(foundRemoteMessage).toBeDefined();
      expect(foundRemoteMessage?.isLocal).toBe(false);
      expect(foundRemoteMessage?.sender).toBe(remoteMessage.sender);
    });
  });

  //-------------------------------------------------------------------------
  // 2. Connection State Tests
  //-------------------------------------------------------------------------

  describe('Connection State', () => {
    test('should initialize as initiator correctly', async () => {
      // Call initialize as initiator
      const result = await chatManager.initialize(true);

      // Verify DataChannelManager.initialize was called with isInitiator=true
      expect(mockDataChannelManager.initialize).toHaveBeenCalledWith(true);

      // Verify the result
      expect(result).toBe(true);
    });

    test('should initialize as non-initiator correctly', async () => {
      // Call initialize as non-initiator
      const result = await chatManager.initialize(false);

      // Verify DataChannelManager.initialize was called with isInitiator=false
      expect(mockDataChannelManager.initialize).toHaveBeenCalledWith(false);

      // Verify the result
      expect(result).toBe(true);
    });

    test('should handle initialization failure', async () => {
      // Setup mock to simulate initialization failure
      mockDataChannelManager.initialize.mockResolvedValue(false);

      // Call initialize
      const result = await chatManager.initialize(true);

      // Verify the result is false
      expect(result).toBe(false);
    });

    test('should check if chat is ready', () => {
      // Test when not ready
      mockDataChannelManager.isReady.mockReturnValue(false);
      expect(chatManager.isReady()).toBe(false);

      // Test when ready
      mockDataChannelManager.isReady.mockReturnValue(true);
      expect(chatManager.isReady()).toBe(true);

      // Verify isReady was called twice
      expect(mockDataChannelManager.isReady).toHaveBeenCalledTimes(2);
    });

    test('should wait for chat to be ready', async () => {
      // Setup mock for waitForChannelReady with default timeout
      mockDataChannelManager.waitForChannelReady.mockResolvedValue(true);

      // Call waitForReady
      const result = await chatManager.waitForReady();

      // Verify waitForChannelReady was called with default timeout
      expect(mockDataChannelManager.waitForChannelReady).toHaveBeenCalledWith(10000);

      // Verify the result
      expect(result).toBe(true);
    });

    test('should wait for chat to be ready with custom timeout', async () => {
      // Setup mock for waitForChannelReady with custom timeout
      mockDataChannelManager.waitForChannelReady.mockResolvedValue(true);

      // Call waitForReady with custom timeout
      const customTimeout = 5000;
      const result = await chatManager.waitForReady(customTimeout);

      // Verify waitForChannelReady was called with custom timeout
      expect(mockDataChannelManager.waitForChannelReady).toHaveBeenCalledWith(customTimeout);

      // Verify the result
      expect(result).toBe(true);
    });

    test('should handle timeout when waiting for ready state', async () => {
      // Setup mock for waitForChannelReady to time out
      mockDataChannelManager.waitForChannelReady.mockResolvedValue(false);

      // Call waitForReady
      const result = await chatManager.waitForReady();

      // Verify the result indicates timeout
      expect(result).toBe(false);
    });
  });

  //-------------------------------------------------------------------------
  // 3. Event Callback Tests
  //-------------------------------------------------------------------------

  describe('Event Callbacks', () => {
    test('should register and trigger message callback', () => {
      // Setup a spy callback
      const messageCallback = jest.fn();

      // Register the callback
      chatManager.onMessage(messageCallback);

      // Setup to send a message
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(true);

      // Send a message
      const sentMessage = chatManager.sendMessage('Test message');

      // Verify callback was called with the sent message
      expect(messageCallback).toHaveBeenCalledTimes(1);
      expect(messageCallback).toHaveBeenCalledWith(sentMessage);
    });

    test('should register and trigger message callback for incoming messages', () => {
      // Capture the data channel message handler
      let dataChannelMessageHandler: ((message: DataChannelMessage) => void) | null = null;
      mockDataChannelManager.onMessage.mockImplementation((handler) => {
        dataChannelMessageHandler = handler;
      });

      // Create a new ChatManager
      chatManager = new ChatManager(testUserId, mockWebRTCManager);

      // Setup a spy callback
      const messageCallback = jest.fn();

      // Register the callback
      chatManager.onMessage(messageCallback);

      // Simulate an incoming message
      const incomingMessage: DataChannelMessage = {
        id: 'msg-456',
        sender: 'remote-user',
        content: 'Hello!',
        timestamp: Date.now(),
      };

      // Trigger the data channel message handler
      if (dataChannelMessageHandler) {
        dataChannelMessageHandler(incomingMessage);
      }

      // Verify callback was called with the received message
      expect(messageCallback).toHaveBeenCalledTimes(1);
      const callbackArg = messageCallback.mock.calls[0][0];
      expect(callbackArg).toMatchObject({
        id: incomingMessage.id,
        sender: incomingMessage.sender,
        content: incomingMessage.content,
        timestamp: incomingMessage.timestamp,
        isLocal: false,
      });
    });

    test('should replace message callback when registered multiple times', () => {
      // Setup two spy callbacks
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();

      // Register the first callback
      chatManager.onMessage(firstCallback);

      // Setup to send a message
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(true);

      // Send a message - should trigger first callback
      chatManager.sendMessage('First message');

      // Verify first callback was called
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).not.toHaveBeenCalled();

      // Register the second callback (replacing the first)
      chatManager.onMessage(secondCallback);

      // Send another message - should trigger second callback only
      chatManager.sendMessage('Second message');

      // Verify first callback was not called again, and second was called
      expect(firstCallback).toHaveBeenCalledTimes(1); // Still just the one call
      expect(secondCallback).toHaveBeenCalledTimes(1);
    });
  });

  //-------------------------------------------------------------------------
  // 4. Error Scenario Tests
  //-------------------------------------------------------------------------

  describe('Error Scenarios', () => {
    test('should handle data channel initialization errors', async () => {
      // Setup mock to simulate initialization error
      mockDataChannelManager.initialize.mockRejectedValue(new Error('Initialization failed'));

      // Call initialize and catch the error
      try {
        await chatManager.initialize(true);
        fail('Expected initialize to throw an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Initialization failed');
      }
    });

    test('should handle send failures gracefully', () => {
      // Setup mock to indicate channel is ready but send fails
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(false);

      // Send a message
      const result = chatManager.sendMessage('Test message');

      // Verify null was returned (indicating failure)
      expect(result).toBeNull();
    });
  });

  //-------------------------------------------------------------------------
  // 5. Channel Management Tests
  //-------------------------------------------------------------------------

  describe('Channel Management', () => {
    test('should close the data channel when close is called', () => {
      // Call close
      chatManager.close();

      // Verify DataChannelManager.close was called
      expect(mockDataChannelManager.close).toHaveBeenCalledTimes(1);
    });

    test('should close the data channel when dispose is called', () => {
      // Call dispose
      chatManager.dispose();

      // Verify DataChannelManager.close was called
      expect(mockDataChannelManager.close).toHaveBeenCalledTimes(1);
    });

    test('should generate unique IDs for messages', () => {
      // Setup for sending multiple messages
      mockDataChannelManager.isReady.mockReturnValue(true);
      mockDataChannelManager.send.mockReturnValue(true);

      // Send multiple messages
      const message1 = chatManager.sendMessage('Message 1');
      const message2 = chatManager.sendMessage('Message 2');
      const message3 = chatManager.sendMessage('Message 3');

      // Verify each message has a unique ID
      const ids = [message1?.id, message2?.id, message3?.id];
      const uniqueIds = new Set(ids);

      // All IDs should be defined
      expect(ids.every((id) => id !== undefined)).toBe(true);

      // Number of unique IDs should equal number of messages
      expect(uniqueIds.size).toBe(3);
    });
  });
});
