import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../services/logger';
import { PeerConnectionManager } from '../services/webrtc';

interface UseWebRTCOptions {
  skipWebRTC?: boolean;
  onWebRTCError?: (error: string) => void;
  onRenegotiationNeeded?: (peerId: string, connectionId: string) => void;
  onTrackRemoved?: (trackId: string, peerId: string) => void;
  onPeerConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
}

/**
 * Hook to manage WebRTC peer connections
 */
export function useWebRTC(localStream: MediaStream | null, options: UseWebRTCOptions = {}) {
  const logger = createLogger('useWebRTC');
  const { 
    skipWebRTC = false, 
    onWebRTCError, 
    onRenegotiationNeeded, 
    onTrackRemoved,
    onPeerConnectionStateChange
  } = options;

  // WebRTC state
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [webrtcError, setWebRTCError] = useState<string | null>(null);
  const [isRenegotiating, setIsRenegotiating] = useState(false);
  const [activeConnections, setActiveConnections] = useState<string[]>([]);

  // Track which peers are being renegotiated
  const renegotiatingPeersRef = useRef<Set<string>>(new Set());

  // Service reference
  const peerManagerRef = useRef<PeerConnectionManager | null>(null);

  // Initialize WebRTC manager when local stream is available
  useEffect(() => {
    // Skip if explicitly told to or if no local stream
    if (skipWebRTC) {
      return;
    }

    // Create peer connection manager if it doesn't exist
    if (!peerManagerRef.current) {
      logger.info('Creating new PeerConnectionManager instance');
      peerManagerRef.current = new PeerConnectionManager();
      
      // Set all callbacks once
      setupPeerManagerCallbacks();
      
      setIsInitialized(true);
    }

    // Update local stream in peer manager if it's available
    if (localStream && peerManagerRef.current) {
      logger.info('Setting local stream in PeerConnectionManager');
      peerManagerRef.current.setLocalStream(localStream);
      
      // Update peer list
      updateActivePeers();
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      // Only close if we're explicitly told to skip WebRTC
      if (peerManagerRef.current && skipWebRTC) {
        logger.info('Closing all WebRTC connections due to skipWebRTC change');
        peerManagerRef.current.closeAllConnections();
        setRemoteStreams(new Map());
        setActiveConnections([]);
        setIsInitialized(false);
      }
    };
  }, [skipWebRTC, localStream]);

  // Setup all callbacks for the peer manager
  const setupPeerManagerCallbacks = useCallback(() => {
    if (!peerManagerRef.current) return;

    // Setup track callback
    peerManagerRef.current.setOnTrack((stream, peerId) => {
      logger.info('Received remote stream from peer:', peerId);
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        newStreams.set(peerId, stream);
        return newStreams;
      });
      
      // Update the list of active connections
      updateActivePeers();
    });

    // Setup negotiation needed callback
    peerManagerRef.current.setOnNegotiationNeeded((peerId, connectionId) => {
      logger.info(`Negotiation needed for peer ${peerId} with connection ID ${connectionId}`);
      
      // Mark this peer as renegotiating
      renegotiatingPeersRef.current.add(peerId);
      setIsRenegotiating(true);

      if (onRenegotiationNeeded) {
        onRenegotiationNeeded(peerId, connectionId);
      } else {
        // Auto-handle renegotiation if no callback is provided
        handleRenegotiation(peerId);
      }
    });

    // Setup track removed callback
    if (onTrackRemoved) {
      peerManagerRef.current.setOnTrackRemoved((trackId, peerId) => {
        logger.info(`Track ${trackId} removed from peer ${peerId}`);
        onTrackRemoved(trackId, peerId);
      });
    }

    // Setup connection state change callback
    if (onPeerConnectionStateChange) {
      peerManagerRef.current.setOnPeerConnectionStateChange((peerId, state) => {
        logger.info(`Connection state changed for peer ${peerId}: ${state}`);
        onPeerConnectionStateChange(peerId, state);
        
        // Update the list of active connections
        updateActivePeers();
      });
    }

    // Setup ICE candidate handler
    peerManagerRef.current.setOnIceCandidate((candidate, peerId, connectionId) => {
      // This will be overridden by the callback set in useRoomInitialization
      logger.debug(`Ice candidate generated for peer ${peerId}, but no handler is set yet`);
    });

  }, [logger, onRenegotiationNeeded, onTrackRemoved, onPeerConnectionStateChange]);

  // Update the list of active peer connections
  const updateActivePeers = useCallback(() => {
    if (!peerManagerRef.current) return;
    
    const peerIds = peerManagerRef.current.getAllPeerIds();
    setActiveConnections(peerIds);
    
    logger.info(`Updated active peers: ${peerIds.length} connections`);
  }, [logger]);

  // Process an incoming WebRTC offer from a specific peer
  const processOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit, connectionId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot process offer: WebRTC not initialized');
        return null;
      }

      try {
        logger.info(`Processing WebRTC offer from peer ${peerId} with connection ID: ${connectionId}`);
        const result = await peerManagerRef.current.processOffer(peerId, offer, connectionId);
        
        // Update active connections
        updateActivePeers();
        
        return result ? {
          answer: result.answer,
          connectionId: result.connectionId,
        } : null;
      } catch (error) {
        logger.error(`Error processing offer from peer ${peerId}:`, error);
        return null;
      }
    },
    [isInitialized, logger, updateActivePeers]
  );

  // Process an incoming WebRTC answer from a specific peer
  const processAnswer = useCallback(
    async (peerId: string, answer: RTCSessionDescriptionInit, connectionId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot process answer: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Processing WebRTC answer from peer ${peerId} with connection ID: ${connectionId}`);
        const success = await peerManagerRef.current.processAnswer(peerId, answer, connectionId);
        
        // If this peer was renegotiating, mark it as complete
        if (renegotiatingPeersRef.current.has(peerId)) {
          renegotiatingPeersRef.current.delete(peerId);
          
          // Only clear isRenegotiating if all renegotiations are complete
          if (renegotiatingPeersRef.current.size === 0) {
            setIsRenegotiating(false);
          }
        }
        
        return success;
      } catch (error) {
        logger.error(`Error processing answer from peer ${peerId}:`, error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Create an offer to establish a connection to a specific peer
  const createOffer = useCallback(
    async (peerId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot create offer: WebRTC not initialized');
        return null;
      }

      try {
        logger.info(`Creating WebRTC offer for peer ${peerId}`);
        const result = await peerManagerRef.current.createOffer(peerId);
        
        // Update active connections
        updateActivePeers();
        
        return result;
      } catch (error) {
        logger.error(`Error creating offer for peer ${peerId}:`, error);
        return null;
      }
    },
    [isInitialized, logger, updateActivePeers]
  );

  // Add an ICE candidate from a specific peer
  const addIceCandidate = useCallback(
    async (peerId: string, candidate: RTCIceCandidateInit, connectionId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot add ICE candidate: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Adding ICE candidate from peer ${peerId} with connection ID: ${connectionId}`);
        
        // Create a proper RTCIceCandidate object
        const iceCandidate = new RTCIceCandidate(candidate);
        
        return await peerManagerRef.current.addIceCandidate(peerId, iceCandidate, connectionId);
      } catch (error) {
        logger.error(`Error adding ICE candidate from peer ${peerId}:`, error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Set ICE candidate handler
  const setOnIceCandidate = useCallback(
    (handler: (candidate: RTCIceCandidateInit, peerId: string, connectionId: string) => void) => {
      if (!peerManagerRef.current) {
        logger.warn('Cannot set ICE candidate handler: WebRTC manager not initialized');
        return false;
      }

      logger.info('Setting ICE candidate handler for all peers');
      
      peerManagerRef.current.setOnIceCandidate((candidate, peerId, connectionId) => {
        handler(candidate, peerId, connectionId);
      });
      
      return true;
    },
    [logger]
  );

  // Create a data channel for a specific peer
  const createDataChannel = useCallback(
    (peerId: string, label: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot create data channel: WebRTC not initialized');
        return null;
      }

      try {
        logger.info(`Creating data channel "${label}" for peer ${peerId}`);
        return peerManagerRef.current.createDataChannel(peerId, label);
      } catch (error) {
        logger.error(`Error creating data channel for peer ${peerId}:`, error);
        return null;
      }
    },
    [isInitialized, logger]
  );

  // Set data channel handler for all peers
  const setOnDataChannel = useCallback(
    (handler: (channel: RTCDataChannel, peerId: string) => void) => {
      if (!peerManagerRef.current) {
        logger.warn('Cannot set data channel handler: WebRTC manager not initialized');
        return false;
      }

      logger.info('Setting data channel handler for all peers');
      peerManagerRef.current.setOnDataChannel(handler);
      return true;
    },
    [logger]
  );

  // Remove a specific peer connection
  const removePeer = useCallback(
    (peerId: string) => {
      // Remove peer from remote streams
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        if (newStreams.has(peerId)) {
          newStreams.delete(peerId);
          logger.info(`Removed remote stream for peer: ${peerId}`);
        }
        return newStreams;
      });

      // Remove the peer connection
      if (peerManagerRef.current) {
        const removed = peerManagerRef.current.removePeerConnection(peerId);
        if (removed) {
          logger.info(`Removed peer connection for ${peerId}`);
          
          // Update active connections
          updateActivePeers();
        }
      }
      
      // Remove from renegotiating peers if it was there
      if (renegotiatingPeersRef.current.has(peerId)) {
        renegotiatingPeersRef.current.delete(peerId);
        
        // Update renegotiating state if needed
        if (renegotiatingPeersRef.current.size === 0) {
          setIsRenegotiating(false);
        }
      }
    },
    [logger, updateActivePeers]
  );

  // Handle renegotiation for a specific peer
  const handleRenegotiation = useCallback(
    async (peerId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn(`Cannot handle renegotiation: WebRTC not initialized`);
        return null;
      }

      try {
        logger.info(`Handling renegotiation for peer ${peerId}`);
        const result = await peerManagerRef.current.handleRenegotiation(peerId);
        
        // If renegotiation was successful, remove the peer from the renegotiating set
        if (result) {
          renegotiatingPeersRef.current.delete(peerId);
          
          // Only clear isRenegotiating if all renegotiations are complete
          if (renegotiatingPeersRef.current.size === 0) {
            setIsRenegotiating(false);
          }
        }
        
        return result;
      } catch (error) {
        logger.error(`Error handling renegotiation for peer ${peerId}:`, error);
        
        // Clear renegotiating state for this peer even on error
        renegotiatingPeersRef.current.delete(peerId);
        if (renegotiatingPeersRef.current.size === 0) {
          setIsRenegotiating(false);
        }
        
        return null;
      }
    },
    [isInitialized, logger]
  );

  // Add a track to all peer connections
  const addTrack = useCallback(
    async (
      track: MediaStreamTrack,
      stream: MediaStream,
      type: 'audio' | 'video' | 'screen' = 'video'
    ) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot add track: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Adding ${type} track to all peer connections`);
        return await peerManagerRef.current.addTrackToAllPeers(track, stream, type);
      } catch (error) {
        logger.error('Error adding track to peer connections:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Remove a track from all peer connections
  const removeTrack = useCallback(
    (trackId: string) => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn('Cannot remove track: WebRTC not initialized');
        return false;
      }

      try {
        logger.info(`Removing track ${trackId} from all peer connections`);
        return peerManagerRef.current.removeTrackFromAllPeers(trackId);
      } catch (error) {
        logger.error('Error removing track from peer connections:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Replace a track in all peer connections
  const replaceTrack = useCallback(
    (oldTrackId: string, newTrack: MediaStreamTrack) => {
      if (!peerManagerRef.current || !isInitialized || !peerManagerRef.current.getAllPeerIds().length) {
        logger.warn('Cannot replace track: WebRTC not initialized or no peer connections');
        return false;
      }

      try {
        logger.info(`Replacing track ${oldTrackId} with ${newTrack.id} on all peer connections`);
        
        // Since we need to replace the track on each peer connection individually,
        // we'll go through each one
        let success = true;
        const failedPeers: string[] = [];
        
        peerManagerRef.current.getAllPeerIds().forEach(peerId => {
          const peerConnection = peerManagerRef.current?.getPeerConnection(peerId);
          if (peerConnection) {
            const result = peerConnection.replaceTrack(oldTrackId, newTrack);
            if (!result) {
              success = false;
              failedPeers.push(peerId);
            }
          }
        });
        
        if (failedPeers.length > 0) {
          logger.warn(`Failed to replace track on peers: ${failedPeers.join(', ')}`);
        }
        
        return success;
      } catch (error) {
        logger.error('Error replacing track on peer connections:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Toggle a track type on all peer connections
  const toggleTrack = useCallback(
    (type: 'audio' | 'video' | 'screen') => {
      if (!peerManagerRef.current || !isInitialized) {
        logger.warn(`Cannot toggle ${type} track: WebRTC not initialized`);
        return false;
      }

      try {
        logger.info(`Toggling ${type} track on all peer connections`);
        return peerManagerRef.current.toggleTrackOnAllPeers(type);
      } catch (error) {
        logger.error(`Error toggling ${type} track on peer connections:`, error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Add a screen share track to all peer connections
  const addScreenShareTrack = useCallback(
    async (stream: MediaStream) => {
      if (!peerManagerRef.current || !isInitialized || !peerManagerRef.current.getAllPeerIds().length) {
        logger.warn('Cannot add screen share: WebRTC not initialized or no peer connections');
        return false;
      }

      try {
        logger.info('Adding screen share track to all peer connections');
        
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          logger.error('No video track found in screen share stream');
          return false;
        }
        
        return await peerManagerRef.current.addTrackToAllPeers(videoTrack, stream, 'screen');
      } catch (error) {
        logger.error('Error adding screen share track to peer connections:', error);
        return false;
      }
    },
    [isInitialized, logger]
  );

  // Remove screen share track from all peer connections
  const removeScreenShareTrack = useCallback(() => {
    if (!peerManagerRef.current || !isInitialized || !peerManagerRef.current.getAllPeerIds().length) {
      logger.warn('Cannot remove screen share: WebRTC not initialized or no peer connections');
      return false;
    }

    try {
      logger.info('Removing screen share track from all peer connections');
      
      // Find and remove all screen tracks on all peer connections
      let success = true;
      
      peerManagerRef.current.getAllPeerIds().forEach(peerId => {
        const peerConnection = peerManagerRef.current?.getPeerConnection(peerId);
        if (peerConnection) {
          const result = peerConnection.removeScreenShareTrack();
          if (!result) {
            success = false;
          }
        }
      });
      
      return success;
    } catch (error) {
      logger.error('Error removing screen share track from peer connections:', error);
      return false;
    }
  }, [isInitialized, logger]);

  return {
    // Stream state
    remoteStreams,
    activeConnections,

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
    peerManager: peerManagerRef.current,
  };
}
