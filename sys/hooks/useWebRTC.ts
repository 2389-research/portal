import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../services/logger';
import { WebRTCManager } from '../services/webrtc';

interface UseWebRTCOptions {
  skipWebRTC?: boolean;
  onWebRTCError?: (error: string) => void;
}

/**
 * Hook to manage WebRTC peer connections
 */
export function useWebRTC(localStream: MediaStream | null, options: UseWebRTCOptions = {}) {
  const logger = createLogger('useWebRTC');
  const { skipWebRTC = false, onWebRTCError } = options;

  // WebRTC state
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [webrtcError, setWebRTCError] = useState<string | null>(null);

  // Service reference
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  // Initialize WebRTC when local stream is available
  useEffect(() => {
    if (skipWebRTC || !localStream) {
      return;
    }

    const initWebRTC = async () => {
      try {
        logger.info('Initializing WebRTC');
        webrtcManagerRef.current = new WebRTCManager();

        // Initialize WebRTC with the local stream
        await webrtcManagerRef.current.initialize(localStream);
        logger.info('WebRTC initialized');
        setIsInitialized(true);

        // Setup WebRTC callbacks
        webrtcManagerRef.current.setOnTrack((remoteStream, peerId) => {
          logger.info('Received remote stream from peer:', peerId);
          setRemoteStreams((prev) => {
            const newStreams = new Map(prev);
            newStreams.set(peerId, remoteStream);
            return newStreams;
          });
        });
      } catch (error: unknown) {
        logger.error('WebRTC initialization error:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to initialize WebRTC';

        setWebRTCError(errorMessage);

        if (onWebRTCError) {
          onWebRTCError(errorMessage);
        }
      }
    };

    initWebRTC();

    // Cleanup on unmount or when local stream changes
    return () => {
      if (webrtcManagerRef.current) {
        logger.info('Closing WebRTC connections');
        webrtcManagerRef.current.close();
        setRemoteStreams(new Map());
        setIsInitialized(false);
      }
    };
  }, [localStream, skipWebRTC, logger, onWebRTCError]);

  // Process an incoming WebRTC offer
  const processOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, connectionId: string) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot process offer: WebRTC not initialized');
        return null;
      }

      try {
        logger.info('Processing WebRTC offer with connection ID:', connectionId);
        const result = await webrtcManagerRef.current.processOffer(offer, connectionId);
        return { 
          answer: result.answer, 
          connectionId: result.connectionId 
        };
      } catch (error) {
        logger.error('Error processing offer:', error);
        return null;
      }
    },
    [isInitialized, logger]
  );

  // Process an incoming WebRTC answer
  const processAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit, connectionId: string) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot process answer: WebRTC not initialized');
        return false;
      }

      try {
        logger.info('Processing WebRTC answer with connection ID:', connectionId);
        await webrtcManagerRef.current.processAnswer(answer, connectionId);
        return true;
      } catch (error) {
        logger.error('Error processing answer:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Create an offer to establish a connection
  const createOffer = useCallback(async () => {
    if (!webrtcManagerRef.current || !isInitialized) {
      logger.warn('Cannot create offer: WebRTC not initialized');
      return null;
    }

    try {
      logger.info('Creating WebRTC offer');
      const result = await webrtcManagerRef.current.createOffer();
      return { 
        offer: result.offer, 
        connectionId: result.connectionId 
      };
    } catch (error) {
      logger.error('Error creating offer:', error);
      return null;
    }
  }, [isInitialized, logger]);

  // Add an ICE candidate from a peer
  const addIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit, connectionId: string) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot add ICE candidate: WebRTC not initialized');
        return false;
      }

      try {
        logger.info('Adding ICE candidate with connection ID:', connectionId);
        // Create a proper RTCIceCandidate object
        const iceCandidate = new RTCIceCandidate(candidate);
        await webrtcManagerRef.current.addIceCandidate(iceCandidate, connectionId);
        return true;
      } catch (error) {
        logger.error('Error adding ICE candidate:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Set ice candidate handler
  const setOnIceCandidate = useCallback(
    (handler: (candidate: RTCIceCandidateInit, connectionId: string) => void) => {
      if (!webrtcManagerRef.current) {
        logger.warn('Cannot set ICE candidate handler: WebRTC not initialized');
        return false;
      }

      logger.info('Setting ICE candidate handler');
      webrtcManagerRef.current.setOnIceCandidate(handler);
      return true;
    },
    [logger]
  );

  // Create a data channel
  const createDataChannel = useCallback(
    (label: string) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot create data channel: WebRTC not initialized');
        return null;
      }

      try {
        logger.info('Creating data channel:', label);
        return webrtcManagerRef.current.createDataChannel(label);
      } catch (error) {
        logger.error('Error creating data channel:', error);
        return null;
      }
    },
    [isInitialized, logger]
  );

  // Set data channel handler
  const setOnDataChannel = useCallback(
    (handler: (channel: RTCDataChannel) => void) => {
      if (!webrtcManagerRef.current) {
        logger.warn('Cannot set data channel handler: WebRTC not initialized');
        return false;
      }

      logger.info('Setting data channel handler');
      // Adapt the handler interface
      webrtcManagerRef.current.setOnDataChannel((channel) => {
        handler(channel);
      });
      return true;
    },
    [logger]
  );

  // Remove a peer from local streams
  const removePeer = useCallback(
    (peerId: string) => {
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        if (newStreams.has(peerId)) {
          newStreams.delete(peerId);
          logger.info('Removed remote stream for peer:', peerId);
        }
        return newStreams;
      });
    },
    [logger]
  );

  return {
    // Stream state
    remoteStreams,

    // Connection state
    isInitialized,
    webrtcError,

    // Connection methods
    processOffer,
    processAnswer,
    createOffer,
    addIceCandidate,
    setOnIceCandidate,

    // Data channel methods
    createDataChannel,
    setOnDataChannel,

    // Peer management
    removePeer,

    // Reference to the manager (for advanced use cases)
    webrtcManager: webrtcManagerRef.current,
  };
}
