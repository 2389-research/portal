import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatManager, type ChatMessage } from '../services/chat/index';
import { createLogger } from '../services/logger';
import type { WebRTCManager } from '../services/webrtc';

interface UseChatOptions {
  onChatError?: (error: string) => void;
  onMessageReceived?: (message: ChatMessage) => void;
}

/**
 * Hook to manage chat communication between peers
 */
export function useChat(
  userId: string | null,
  webrtcManager: WebRTCManager | null,
  options: UseChatOptions = {}
) {
  const logger = createLogger('useChat');
  const { onChatError, onMessageReceived } = options;

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastInitAttempt, setLastInitAttempt] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Service reference
  const chatManagerRef = useRef<ChatManager | null>(null);

  // Initialize chat when webrtcManager and userId are available
  useEffect(() => {
    // Skip initialization if dependencies aren't available
    if (!userId || !webrtcManager) {
      logger.debug('Missing dependencies for chat initialization');
      return;
    }

    // Cleanup function to properly dispose resources
    const cleanup = () => {
      if (chatManagerRef.current) {
        logger.info('Disposing chat manager during cleanup');
        chatManagerRef.current.dispose();
        chatManagerRef.current = null;
      }
    };

    // Avoid duplicate initialization attempts within a short time
    const now = Date.now();
    if (now - lastInitAttempt < 5000 && isInitialized) {
      logger.info('Skipping initialization, recently attempted');
      return cleanup;
    }

    // Avoid re-initialization if we already have a working chat manager
    if (chatManagerRef.current && chatReady) {
      logger.info('Chat already initialized and ready');
      return cleanup;
    }

    // Proceed with initialization
    setLastInitAttempt(now);

    const initChat = async () => {
      try {
        // Only create a new ChatManager if needed
        if (!chatManagerRef.current && webrtcManager) {
          logger.info('Creating new chat manager');
          chatManagerRef.current = new ChatManager(userId, webrtcManager);

          // Set up message callback
          chatManagerRef.current.onMessage((message) => {
            logger.debug('Received message:', message.sender);

            // Add new message to state
            setChatMessages((prev) => [...prev, message]);

            // Trigger callback if provided
            if (onMessageReceived) {
              onMessageReceived(message);
            }
          });

          // Monitor ready state changes
          chatManagerRef.current.onReadyStateChange((isReady) => {
            logger.info('Chat ready state changed:', isReady);
            setChatReady(isReady);
          });
        }

        // Initialize the chat data channel
        if (chatManagerRef.current) {
          const isInitiator = true; // Always try as initiator to ensure channel creation
          const result = await chatManagerRef.current.initialize(isInitiator);
          logger.info('Chat initialization result:', result);

          if (result) {
            setIsInitialized(true);
            setChatReady(true);
            setChatError(null);
          } else {
            const error = 'Chat data channel could not be established';
            logger.warn(error);
            setChatError(error);
            setChatReady(false);

            if (onChatError) onChatError(error);
          }
        }
      } catch (error: unknown) {
        // Format error message
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to initialize chat';

        logger.error('Chat initialization error:', errorMessage);
        setChatError(errorMessage);
        setChatReady(false);

        if (onChatError) onChatError(errorMessage);
      }
    };

    // Start chat initialization
    initChat();

    // Clean up on unmount or when dependencies change
    return cleanup;
  }, [
    userId,
    webrtcManager,
    onChatError,
    onMessageReceived,
    logger,
    chatReady,
    lastInitAttempt,
    isInitialized,
  ]);

  // Lazy initialization function for external triggers
  const initializeChat = useCallback(async () => {
    if (!chatManagerRef.current || !chatReady) {
      logger.info('Manual chat initialization requested');
      setLastInitAttempt(Date.now());

      if (chatManagerRef.current) {
        const result = await chatManagerRef.current.waitForReady(5000);
        setChatReady(result);
        return result;
      }
    }
    return chatReady;
  }, [chatReady, logger]);

  // Send a chat message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!chatManagerRef.current) {
        logger.error('Chat manager not initialized in sendMessage');
        return false;
      }

      // Double check that data channel is ready
      if (!chatManagerRef.current.isReady()) {
        logger.warn('Chat channel not ready, attempting to initialize before sending');

        // Try to initialize
        const ready = await chatManagerRef.current.waitForReady(3000);
        if (!ready) {
          logger.error('Could not initialize chat channel for sending');
          setChatReady(false);
          return false;
        }

        // Update ready state
        setChatReady(true);
      }

      // Send the message
      const result = chatManagerRef.current.sendMessage(content);
      return !!result;
    },
    [logger]
  );

  return {
    // Chat state
    chatMessages,
    chatReady,
    chatError,

    // Chat methods
    sendMessage,
    initializeChat,

    // Reference to the manager (for advanced use cases)
    chatManager: chatManagerRef.current,
  };
}
