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
  const [lastChatCheck, setLastChatCheck] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);

  // Service reference
  const chatManagerRef = useRef<ChatManager | null>(null);

  // Initialize chat when webrtcManager and userId are available
  useEffect(() => {
    if (!userId || !webrtcManager) {
      // Reset chat state when dependencies are not available
      if (chatManagerRef.current) {
        logger.info('Dependencies not available, cleaning up chat manager');
        chatManagerRef.current.dispose();
        chatManagerRef.current = null;
        setChatReady(false);
      }
      return;
    }

    const initChat = async () => {
      try {
        // Ensure webrtcManager is not null and check its state
        if (!webrtcManager) {
          throw new Error('WebRTC manager is not available');
        }

        logger.info('Initializing chat manager');

        // Dispose of existing chat manager if any
        if (chatManagerRef.current) {
          logger.info('Disposing previous chat manager');
          chatManagerRef.current.dispose();
          chatManagerRef.current = null;
        }

        // Create new chat manager
        chatManagerRef.current = new ChatManager(userId, webrtcManager);

        // Initialize as initiator
        logger.info('Attempting to initialize chat data channel');
        const chatInitialized = await chatManagerRef.current.initialize(true);
        logger.info('Chat initialization result:', chatInitialized);

        setChatReady(chatInitialized);

        if (!chatInitialized) {
          const error = 'Chat data channel could not be established';
          logger.warn(error);
          setChatError(error);
          if (onChatError) onChatError(error);
        }

        // Setup message handler
        chatManagerRef.current.onMessage((message) => {
          logger.info('Received message from:', message.sender);

          setChatMessages((prev) => [...prev, message]);

          if (onMessageReceived) {
            onMessageReceived(message);
          }
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to initialize chat';

        logger.error('Chat initialization error:', errorMessage);
        setChatError(errorMessage);
        if (onChatError) onChatError(errorMessage);
      }
    };

    initChat();

    // Set up a periodic check for chat data channel status
    const intervalId = setInterval(() => {
      if (chatManagerRef.current) {
        const isChannelReady = chatManagerRef.current.isReady();

        // If UI state doesn't match reality, update it
        if (chatReady !== isChannelReady) {
          logger.info('Chat ready state mismatch detected, updating UI state', {
            uiReady: chatReady,
            actualReady: isChannelReady,
          });
          setChatReady(isChannelReady);
        }

        setLastChatCheck(Date.now());
      }
    }, 5000);

    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);

      if (chatManagerRef.current) {
        logger.info('Disposing chat manager');
        chatManagerRef.current.dispose();
        chatManagerRef.current = null;
      }

      setChatMessages([]);
      setChatReady(false);
    };
  }, [userId, webrtcManager, logger, onChatError, onMessageReceived]);

  // Send a chat message
  const sendMessage = useCallback(
    (content: string) => {
      if (!chatManagerRef.current) {
        logger.error('Chat manager not initialized in sendMessage');
        return false;
      }

      // Double check that data channel is ready
      if (!chatManagerRef.current.isReady()) {
        logger.error('Chat channel not ready when attempting to send message');
        setChatReady(false); // Update UI state to reflect reality

        // Try to re-establish chat data channel
        const tryReconnect = async () => {
          logger.info('Attempting to re-establish chat data channel');
          if (chatManagerRef.current) {
            const ready = await chatManagerRef.current.waitForReady(5000);
            logger.info('Re-established chat data channel result:', ready);
            setChatReady(ready);

            // If reconnected, try sending the message again
            if (ready) {
              return chatManagerRef.current.sendMessage(content);
            }
          }
          return false;
        };

        tryReconnect();
        return false;
      }

      // If all checks pass, send the message
      const result = chatManagerRef.current.sendMessage(content);
      if (!result) {
        logger.error('Failed to send message, updating chat ready state');
        setChatReady(false);
      }

      return result;
    },
    [logger]
  );

  // Wait for the chat data channel to be ready
  const waitForReady = useCallback(
    async (timeout = 5000) => {
      if (!chatManagerRef.current) {
        return false;
      }

      try {
        const ready = await chatManagerRef.current.waitForReady(timeout);
        setChatReady(ready);
        return ready;
      } catch (error) {
        logger.error('Error waiting for chat channel:', error);
        return false;
      }
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
    waitForReady,

    // Reference to the manager (for advanced use cases)
    chatManager: chatManagerRef.current,
  };
}
