import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../services/logger';
import {
  SignalingService,
  type SignalingMessage as ServiceSignalingMessage,
} from '../services/signaling';

// Import and use the SignalingMessage type from the service
export type SignalingMessage = ServiceSignalingMessage;

export type SignalingEventCallback = (message: SignalingMessage) => void;

interface UseSignalingOptions {
  autoJoin?: boolean;
  onSignalingError?: (error: string) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
}

/**
 * Hook to manage signaling connections for WebRTC
 */
export function useSignaling(
  apiClient: any,
  roomId: string | undefined,
  options: UseSignalingOptions = {}
) {
  const logger = createLogger('useSignaling');
  const { autoJoin = false, onSignalingError, onUserJoined, onUserLeft } = options;

  // Signaling state
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [signalingError, setSignalingError] = useState<string | null>(null);

  // Service reference
  const signalingServiceRef = useRef<SignalingService | null>(null);
  // Event handlers storage
  const eventHandlersRef = useRef<Map<string, Set<SignalingEventCallback>>>(new Map());

  // Initialize signaling service
  useEffect(() => {
    if (!apiClient) {
      const errorMsg = 'Cannot initialize signaling: API client not available';
      logger.error(errorMsg);
      setSignalingError(errorMsg);
      if (onSignalingError) onSignalingError(errorMsg);
      return;
    }

    logger.info('Creating signaling service');
    signalingServiceRef.current = new SignalingService(apiClient);

    // Setup message handling for user joined/left events
    const userJoinedHandler = (message: SignalingMessage) => {
      logger.info('User joined room:', message.sender);
      if (onUserJoined) onUserJoined(message.sender);
    };

    const userLeftHandler = (message: SignalingMessage) => {
      logger.info('User left room:', message.sender);
      if (onUserLeft) onUserLeft(message.sender);
    };

    // Register internal handlers for user events
    if (signalingServiceRef.current) {
      signalingServiceRef.current.on('user-joined', userJoinedHandler);
      signalingServiceRef.current.on('user-left', userLeftHandler);
    }

    // Join room automatically if specified
    if (autoJoin && roomId) {
      joinRoom(roomId);
    }

    // Cleanup on unmount
    return () => {
      leaveRoom();

      // Clear all event handlers
      eventHandlersRef.current.clear();

      // Dispose of signaling service
      signalingServiceRef.current = null;
    };
  }, [apiClient, logger, autoJoin, roomId, onSignalingError, onUserJoined, onUserLeft]);

  // Join a room
  const joinRoom = useCallback(
    async (roomIdToJoin: string) => {
      if (!signalingServiceRef.current) {
        const errorMsg = 'Cannot join room: Signaling service not initialized';
        logger.error(errorMsg);
        setSignalingError(errorMsg);
        if (onSignalingError) onSignalingError(errorMsg);
        return null;
      }

      if (!roomIdToJoin) {
        const errorMsg = 'Cannot join room: No room ID provided';
        logger.error(errorMsg);
        setSignalingError(errorMsg);
        if (onSignalingError) onSignalingError(errorMsg);
        return null;
      }

      try {
        logger.info('Joining room:', roomIdToJoin);
        const newUserId = await signalingServiceRef.current.joinRoom(roomIdToJoin);
        logger.info('Joined room with user ID:', newUserId);

        setUserId(newUserId);
        setConnected(true);
        setSignalingError(null);

        return newUserId;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to join room';

        logger.error('Error joining room:', errorMessage);
        setSignalingError(errorMessage);
        if (onSignalingError) onSignalingError(errorMessage);
        return null;
      }
    },
    [logger, onSignalingError]
  );

  // Leave the current room
  const leaveRoom = useCallback(async () => {
    if (!signalingServiceRef.current || !connected) {
      return true;
    }

    try {
      logger.info('Leaving room');
      await signalingServiceRef.current.leaveRoom();

      setConnected(false);
      setUserId(null);

      return true;
    } catch (error) {
      logger.error('Error leaving room:', error);
      return false;
    }
  }, [connected, logger]);

  // Register an event handler
  const on = useCallback(
    (eventType: string, callback: SignalingEventCallback) => {
      if (!signalingServiceRef.current) {
        logger.warn('Cannot register event handler: Signaling service not initialized');
        return false;
      }

      // Register with signaling service
      signalingServiceRef.current.on(eventType, callback);

      // Store the callback in our ref for potential cleanup
      if (!eventHandlersRef.current.has(eventType)) {
        eventHandlersRef.current.set(eventType, new Set());
      }
      eventHandlersRef.current.get(eventType)?.add(callback);

      return true;
    },
    [logger]
  );

  // Unregister an event handler
  const off = useCallback((eventType: string, callback: SignalingEventCallback) => {
    if (!signalingServiceRef.current) {
      return false;
    }

    // Unregister from signaling service
    signalingServiceRef.current.off(eventType);

    // Remove from our storage
    eventHandlersRef.current.get(eventType)?.delete(callback);

    return true;
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (
      type: string,
      data: any,
      recipient?: string,
      forceRoomId?: string,
      forceSenderId?: string,
      extraFields?: Record<string, any>
    ) => {
      if (!signalingServiceRef.current || !connected) {
        logger.warn('Cannot send message: Not connected to room');
        return false;
      }

      try {
        await signalingServiceRef.current.sendMessage(
          type,
          data,
          recipient,
          forceRoomId,
          forceSenderId,
          extraFields
        );
        return true;
      } catch (error) {
        logger.error('Error sending message:', error);
        return false;
      }
    },
    [connected, logger]
  );

  return {
    // Connection state
    connected,
    userId,
    signalingError,

    // Room methods
    joinRoom,
    leaveRoom,

    // Messaging methods
    sendMessage,
    on,
    off,

    // Reference to the service (for advanced use cases)
    signalingService: signalingServiceRef.current,
  };
}
