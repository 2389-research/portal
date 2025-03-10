import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../services/logger';
import { WebRTCManager } from '../services/webrtc';

interface UseWebRTCOptions {
  skipWebRTC?: boolean;
  onWebRTCError?: (error: string) => void;
  onRenegotiationNeeded?: (connectionId: string) => void;
  onTrackRemoved?: (trackId: string, peerId: string) => void;
}

/**
 * Hook to manage WebRTC peer connections
 */
export function useWebRTC(localStream: MediaStream | null, options: UseWebRTCOptions = {}) {
  const logger = createLogger('useWebRTC');
  const { skipWebRTC = false, onWebRTCError, onRenegotiationNeeded, onTrackRemoved } = options;

  // WebRTC state
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [webrtcError, setWebRTCError] = useState<string | null>(null);
  const [isRenegotiating, setIsRenegotiating] = useState(false);

  // Service reference
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  // Initialize WebRTC when local stream is available
  useEffect(() => {
    // Skip if explicitly told to or if no local stream
    if (skipWebRTC || !localStream) {
      return;
    }

    // Don't re-initialize if already set up
    if (webrtcManagerRef.current && isInitialized) {
      logger.info('WebRTC already initialized, skipping initialization');
      return;
    }

    const initWebRTC = async () => {
      try {
        logger.info('Initializing WebRTC');

        // Only create a new WebRTCManager if it doesn't exist
        if (!webrtcManagerRef.current) {
          logger.info('Creating new WebRTCManager instance');
          webrtcManagerRef.current = new WebRTCManager();
        } else {
          logger.info('Reusing existing WebRTCManager instance');
        }

        // Initialize WebRTC with the local stream
        await webrtcManagerRef.current.initialize(localStream);
        logger.info('WebRTC initialized successfully');
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

        // Setup negotiation needed callback
        webrtcManagerRef.current.setOnNegotiationNeeded(() => {
          const connectionId = webrtcManagerRef.current?.getCurrentConnectionId() || 'unknown';
          logger.info('Negotiation needed for connection:', connectionId);
          setIsRenegotiating(true);

          if (onRenegotiationNeeded) {
            onRenegotiationNeeded(connectionId);
          } else {
            // Auto-handle renegotiation if no callback is provided
            handleRenegotiation();
          }
        });

        // Setup track removed callback
        if (onTrackRemoved) {
          webrtcManagerRef.current.setOnTrackRemoved((trackId, peerId) => {
            logger.info(`Track ${trackId} removed from peer ${peerId}`);
            onTrackRemoved(trackId, peerId);
          });
        }
      } catch (error: unknown) {
        logger.error('WebRTC initialization error:', error);

        // Format error message
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to initialize WebRTC';

        // Log more details for debugging
        if (errorMessage.includes('so many PeerConnections')) {
          logger.error('Too many PeerConnection instances created - browser limit reached');
        }

        setWebRTCError(errorMessage);

        if (onWebRTCError) {
          onWebRTCError(errorMessage);
        }
      }
    };

    // Track if WebRTC initialization has been attempted
    const webrtcInitKey = 'webrtc-init-attempted';

    // Check if this is the first initialization attempt
    if (!window.sessionStorage.getItem(webrtcInitKey)) {
      logger.info('First WebRTC initialization attempt');
      window.sessionStorage.setItem(webrtcInitKey, 'true');
    } else if (!isInitialized) {
      logger.info('Subsequent WebRTC initialization attempt');
    }

    // Attempt initialization
    initWebRTC();

    // Cleanup on unmount or when dependencies change
    return () => {
      // Only close if we're explicitly told to skip WebRTC or if component is unmounting completely
      if (webrtcManagerRef.current && skipWebRTC) {
        logger.info('Closing WebRTC connections due to skipWebRTC change');
        webrtcManagerRef.current.close();
        setRemoteStreams(new Map());
        setIsInitialized(false);
      }
    };
  }, [
    localStream,
    skipWebRTC,
    logger,
    onWebRTCError,
    onRenegotiationNeeded,
    onTrackRemoved,
    isInitialized,
  ]);

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
          connectionId: result.connectionId,
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
        connectionId: result.connectionId,
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

  // Handle renegotiation automatically
  const handleRenegotiation = useCallback(async () => {
    if (!webrtcManagerRef.current || !isInitialized) {
      logger.warn('Cannot handle renegotiation: WebRTC not initialized');
      return null;
    }

    try {
      logger.info('Handling renegotiation automatically');
      const result = await webrtcManagerRef.current.handleRenegotiation();
      setIsRenegotiating(false);
      return result;
    } catch (error) {
      logger.error('Error handling renegotiation:', error);
      setIsRenegotiating(false);
      return null;
    }
  }, [isInitialized, logger]);

  // Add a track to the peer connection
  const addTrack = useCallback(
    async (
      track: MediaStreamTrack,
      stream: MediaStream,
      type: 'audio' | 'video' | 'screen' = 'video'
    ) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot add track: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Adding ${type} track to WebRTC connection`);
        return await webrtcManagerRef.current.addTrack(track, stream, type);
      } catch (error) {
        logger.error('Error adding track:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Remove a track from the peer connection
  const removeTrack = useCallback(
    (trackId: string) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot remove track: WebRTC not initialized');
        return false;
      }

      try {
        logger.info('Removing track from WebRTC connection:', trackId);
        return webrtcManagerRef.current.removeTrack(trackId);
      } catch (error) {
        logger.error('Error removing track:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Replace an existing track with a new one
  const replaceTrack = useCallback(
    (oldTrackId: string, newTrack: MediaStreamTrack) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot replace track: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Replacing track ${oldTrackId} with ${newTrack.id}`);
        return webrtcManagerRef.current.replaceTrack(oldTrackId, newTrack);
      } catch (error) {
        logger.error('Error replacing track:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Toggle a track type (audio/video/screen)
  const toggleTrack = useCallback(
    (type: 'audio' | 'video' | 'screen') => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn(`Cannot toggle ${type} track: WebRTC not initialized`);
        return false;
      }

      try {
        logger.info(`Toggling ${type} track`);
        return webrtcManagerRef.current.toggleTrack(type);
      } catch (error) {
        logger.error(`Error toggling ${type} track:`, error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Add a screen share track
  const addScreenShareTrack = useCallback(
    async (stream: MediaStream) => {
      if (!webrtcManagerRef.current || !isInitialized) {
        logger.warn('Cannot add screen share: WebRTC not initialized');
        return false;
      }

      try {
        logger.info('Adding screen share track to WebRTC connection');
        return await webrtcManagerRef.current.addScreenShareTrack(stream);
      } catch (error) {
        logger.error('Error adding screen share track:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Remove screen share track
  const removeScreenShareTrack = useCallback(() => {
    if (!webrtcManagerRef.current || !isInitialized) {
      logger.warn('Cannot remove screen share: WebRTC not initialized');
      return false;
    }

    try {
      logger.info('Removing screen share track from WebRTC connection');
      return webrtcManagerRef.current.removeScreenShareTrack();
    } catch (error) {
      logger.error('Error removing screen share track:', error);
      return false;
    }
  }, [isInitialized, logger]);

  return {
    // Stream state
    remoteStreams,

    // Connection state
    isInitialized,
    webrtcError,
    isRenegotiating,

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

    // Track management
    addTrack,
    removeTrack,
    replaceTrack,
    toggleTrack,

    // Screen share
    addScreenShareTrack,
    removeScreenShareTrack,

    // Renegotiation
    handleRenegotiation,

    // Reference to the manager (for advanced use cases)
    webrtcManager: webrtcManagerRef.current,
  };
}
