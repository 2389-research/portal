import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { createLogger } from '../services/logger';
import { useAuth } from './useAuth';
import { useChat } from './useChat';
import { useMedia } from './useMedia';
import { useSignaling } from './useSignaling';
import { useWebRTC } from './useWebRTC';

export type InitPhase = 'auth' | 'media' | 'webrtc' | 'signaling' | 'chat' | 'complete';

interface UseRoomInitializationOptions {
  skipMediaAccess?: boolean;
}

/**
 * Hook to coordinate room initialization process
 */
export function useRoomInitialization(
  roomId: string | undefined,
  options: UseRoomInitializationOptions = {}
) {
  const logger = createLogger('useRoomInit');
  const router = useRouter();
  const { skipMediaAccess: initialSkipMedia = false } = options;

  // Initialization state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipMediaAccess, setSkipMediaAccess] = useState(initialSkipMedia);
  const [initPhase, setInitPhase] = useState<InitPhase>('auth');

  // Store timeouts for cleanup
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Auth hook
  const auth = useAuth({
    onAuthError: (error) => {
      logger.warn('Authentication error, but continuing:', error);
      // Not fatal, just move to next phase
      moveToPhase('media');
    },
  });

  // Media hook (initialized with skipMediaAccess from state)
  const media = useMedia({
    skipMediaAccess,
    onMediaError: (error) => {
      logger.error('Media error:', error);

      // For timeout, permission, or any other media errors, don't show alerts anymore
      // but let the user handle it through the UI's "Continue Without Camera/Mic" button
      if (error.includes('timed out')) {
        logger.warn('Media initialization timed out, user can continue via UI button');
      } else if (error.includes('denied') || error.includes('permission')) {
        logger.warn('Media access was denied, user can continue via UI button');
      } else {
        logger.warn('Media error occurred, user can continue via UI button:', error);
      }
      
      // Stay in the media phase, but enable the UI to show the skip button
      // We don't automatically move to the signaling phase or show alerts
      // This prevents flickering caused by alerts and allows more UI control
    },
  });

  // WebRTC hook (depends on media.localStream)
  const webrtc = useWebRTC(media.localStream, {
    skipWebRTC: skipMediaAccess,
    onWebRTCError: (error) => {
      logger.error('WebRTC error:', error);
      
      // No alerts, let user continue via UI button
      logger.warn('WebRTC error occurred, user can continue via UI button');
      
      // Stay in current phase, let UI handle the skip action
      // This prevents flickering caused by alerts
    },
  });

  // Signaling hook (depends on auth.apiClient and roomId)
  const signaling = useSignaling(auth.apiClient, roomId, {
    // Don't auto-join, we'll do it manually based on phase
    autoJoin: false,
    onSignalingError: (error) => {
      logger.error('Signaling error:', error);
      setError(`Failed to connect to the room: ${error}`);
      setLoading(false);
    },
    onUserJoined: (userId) => {
      logger.info('User joined:', userId);

      // Create and send WebRTC offer to the new user
      if (webrtc.isInitialized && webrtc.createOffer) {
        (async () => {
          try {
            const result = await webrtc.createOffer();
            if (result && signaling.sendMessage) {
              // Extract the offer and connection ID
              const { offer, connectionId } = result;
              logger.info('Created offer with connection ID:', connectionId);
              
              // Send the offer with the connection ID
              await signaling.sendMessage('webrtc-offer', offer, userId, undefined, undefined, { connectionId });
            }
          } catch (error) {
            logger.error('Error creating offer for new user:', error);
          }
        })();
      }
    },
    onUserLeft: (userId) => {
      logger.info('User left:', userId);

      // Remove the user from remote streams
      if (webrtc.removePeer) {
        webrtc.removePeer(userId);
      }
    },
  });

  // We need to make sure we only pass webrtcManager when it's initialized
  const chat = useChat(signaling.userId, webrtc.isInitialized ? webrtc.webrtcManager : null, {
    onChatError: (error) => {
      logger.warn('Chat error, but continuing:', error);
      // Non-fatal, just move to completion
      moveToPhase('complete');
    },
  });

  // Move to the next initialization phase
  const moveToPhase = useCallback(
    (phase: InitPhase) => {
      logger.info('Moving to phase:', phase);
      setInitPhase(phase);
    },
    [logger]
  );

  // Setup phase timeouts
  useEffect(() => {
    if (!loading || !roomId) return;

    logger.info('Setting up phase timeouts');

    // Phase-specific timeouts - reduced media and WebRTC timeouts
    const phaseTimeouts = {
      auth: 15000, // 15 seconds for auth
      media: 15000, // 15 seconds for media (short since useMedia also has its own timeout)
      webrtc: 10000, // 10 seconds for WebRTC
      signaling: 30000, // 30 seconds for signaling
      chat: 15000, // 15 seconds for chat
    };

    // Create a timeout watcher function
    const watchPhaseTimeout = (phase: Exclude<InitPhase, 'complete'>) => {
      const timeoutId = setTimeout(() => {
        if (initPhase === phase && loading) {
          logger.error(
            `Phase '${phase}' initialization timed out after ${phaseTimeouts[phase] / 1000} seconds`
          );

          // Handle timeout based on the phase
          switch (phase) {
            case 'auth':
              // For auth phase, just log error and continue to next phase
              logger.warn('Auth phase timed out, but continuing with initialization');
              moveToPhase('media');
              break;

            case 'media':
              // For media phase, just log the timeout but don't show alerts
              // The user can use the UI button to skip media
              logger.warn('Media initialization timeout reached - user can continue using UI button');
              break;

            case 'webrtc':
              // For WebRTC phase, just log the timeout but don't show alerts
              // The user can use the UI button to skip WebRTC
              logger.warn('WebRTC initialization timeout reached - user can continue using UI button');
              break;

            case 'signaling':
              // For signaling, this is critical so we stop with an error
              setError(
                'Room initialization timed out during signaling phase. Please try again later.'
              );
              setLoading(false);
              break;

            case 'chat':
              // For chat, we can continue without it
              logger.warn('Chat initialization timed out, but continuing without chat');
              moveToPhase('complete');
              // Don't block the UI on chat initialization
              setLoading(false);
              break;
          }
        }
      }, phaseTimeouts[phase]);

      // Store the timeout for cleanup
      timeoutsRef.current.push(timeoutId);
      return timeoutId;
    };

    // Master timeout as a safety net (2 minutes total)
    const masterTimeoutId = setTimeout(() => {
      if (loading) {
        logger.error('Room initialization timed out after 120 seconds (master timeout)');
        setError('Room initialization timed out. Please try again or skip media access.');
        setLoading(false);
      }
    }, 120000);
    timeoutsRef.current.push(masterTimeoutId);

    // Set phase-specific timeouts based on current phase
    if (initPhase !== 'complete') {
      watchPhaseTimeout(initPhase);
    }

    // Cleanup timeouts on unmount or phase change
    return () => {
      // Clean up any timeouts that were created
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [loading, roomId, initPhase, moveToPhase, logger]);

  // Setup WebRTC signaling handlers
  useEffect(() => {
    if (!signaling.connected || !webrtc.isInitialized) {
      return;
    }

    logger.info('Setting up WebRTC signaling handlers');

    // Handle WebRTC offer
    const handleOffer = async (message: any) => {
      try {
        if (!webrtc.processOffer) return;

        // Extract the connection ID from the message
        const connectionId = message.connectionId || (message.data && message.data.connectionId);
        
        if (!connectionId) {
          logger.warn('Received offer without connection ID, generating a fallback ID');
          // Generate a fallback ID if none was provided (for backward compatibility)
          const fallbackId = Math.random().toString(36).substring(2, 15);
          logger.info('Using fallback connection ID:', fallbackId);
          
          const answer = await webrtc.processOffer(message.data, fallbackId);
          if (answer) {
            // Send answer with the fallback connection ID
            await signaling.sendMessage('webrtc-answer', answer.answer, message.sender, undefined, undefined, { connectionId: fallbackId });
          }
        } else {
          logger.info('Processing offer with connection ID:', connectionId);
          const answer = await webrtc.processOffer(message.data, connectionId);
          
          if (answer) {
            // Send answer with same connection ID from the offer
            await signaling.sendMessage('webrtc-answer', answer.answer, message.sender, undefined, undefined, { connectionId });
          }
        }
      } catch (error) {
        logger.error('Error processing offer:', error);
      }
    };

    // Handle WebRTC answer
    const handleAnswer = async (message: any) => {
      try {
        if (!webrtc.processAnswer) return;
        
        // Extract the connection ID from the message
        const connectionId = message.connectionId || (message.data && message.data.connectionId);
        
        if (!connectionId) {
          logger.warn('Received answer without connection ID, using default connection');
          // For backward compatibility, still process the answer
          await webrtc.processAnswer(message.data, webrtc.webrtcManager?.getCurrentConnectionId() || 'default');
        } else {
          logger.info('Processing answer with connection ID:', connectionId);
          await webrtc.processAnswer(message.data, connectionId);
        }
      } catch (error) {
        logger.error('Error processing answer:', error);
      }
    };

    // Handle ICE candidates
    const handleIceCandidate = async (message: any) => {
      try {
        if (!webrtc.addIceCandidate) return;
        
        // Extract the connection ID from the message
        const connectionId = message.connectionId || (message.data && message.data.connectionId);
        
        if (!connectionId) {
          logger.warn('Received ICE candidate without connection ID, using default connection');
          // For backward compatibility, still process the candidate with the current connection ID
          await webrtc.addIceCandidate(message.data, webrtc.webrtcManager?.getCurrentConnectionId() || 'default');
        } else {
          logger.info('Adding ICE candidate with connection ID:', connectionId);
          await webrtc.addIceCandidate(message.data, connectionId);
        }
      } catch (error) {
        logger.error('Error adding ICE candidate:', error);
      }
    };

    // Register handlers
    signaling.on('webrtc-offer', handleOffer);
    signaling.on('webrtc-answer', handleAnswer);
    signaling.on('ice-candidate', handleIceCandidate);

    // Setup ICE candidate handler
    if (webrtc.setOnIceCandidate) {
      webrtc.setOnIceCandidate(async (candidate, connectionId) => {
        // Send ICE candidate with the connection ID
        await signaling.sendMessage('ice-candidate', candidate, undefined, undefined, undefined, { connectionId });
      });
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      signaling.off('webrtc-offer', handleOffer);
      signaling.off('webrtc-answer', handleAnswer);
      signaling.off('ice-candidate', handleIceCandidate);
    };
  }, [signaling, webrtc, logger]);

  // Main initialization sequence
  useEffect(() => {
    if (!roomId) {
      setError('Invalid room ID');
      setLoading(false);
      return;
    }

    // Define the initialization sequence
    const initializeRoom = async () => {
      try {
        logger.info('Starting room initialization sequence');

        // Auth phase - already managed by useAuth hook
        setInitPhase('auth');

        // Wait for auth check to complete
        if (!auth.authChecked) {
          logger.info('Waiting for auth check to complete');
          // The auth phase timeout will handle this case
          return;
        }

        // Move to next phase once auth is checked
        if (auth.authChecked && initPhase === 'auth') {
          // Move to media phase
          moveToPhase('media');
        }

        // Media phase is handled by useMedia hook
        // WebRTC phase is handled by useWebRTC hook

        // These phases are progressed by the hooks themselves or through timeouts

        // Signaling phase
        if (initPhase === 'signaling') {
          // Join the room if not already connected
          if (!signaling.connected) {
            logger.info('Signaling phase: Joining room');
            const newUserId = await signaling.joinRoom(roomId);
            if (newUserId) {
              logger.info('Joined room with user ID:', newUserId);

              // Complete signaling phase, move to chat or complete
              if (skipMediaAccess) {
                logger.info('Media was skipped, completing initialization');
                moveToPhase('complete');
                setLoading(false);
              } else {
                moveToPhase('chat');
              }
            } else {
              throw new Error('Failed to join room: No user ID returned');
            }
          }
        }

        // Chat phase is handled by useChat hook

        // Complete phase
        if (initPhase === 'complete') {
          logger.info('Room initialization complete');
          setLoading(false);
        }
      } catch (error: unknown) {
        logger.error('Error in room initialization sequence:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Unknown room initialization error';

        setError(errorMessage);
        setLoading(false);
      }
    };

    // Run initialization when phase changes
    initializeRoom();

    // Cleanup function
    return () => {
      // Timeouts are cleaned up in their own effect
    };
  }, [
    roomId,
    initPhase,
    auth.authChecked,
    signaling.connected,
    skipMediaAccess,
    moveToPhase,
    signaling,
    auth,
    logger,
  ]);

  // Auto-progress phases when subsystems are ready
  useEffect(() => {
    // Create a local flag for this render cycle
    let phaseTransitionScheduled = false;

    // Auto-progress from auth to media when auth is checked
    if (initPhase === 'auth' && auth.authChecked && !phaseTransitionScheduled) {
      // Schedule the update for the next tick to break the render cycle
      phaseTransitionScheduled = true;
      const timeoutId = setTimeout(() => moveToPhase('media'), 0);
      timeoutsRef.current.push(timeoutId);
      return;
    }

    // Auto-progress from media to webrtc when media is ready or skipped
    if (initPhase === 'media' && !phaseTransitionScheduled) {
      if (skipMediaAccess) {
        phaseTransitionScheduled = true;
        const timeoutId = setTimeout(() => moveToPhase('signaling'), 0);
        timeoutsRef.current.push(timeoutId);
        return;
      }

      if (media.localStream) {
        phaseTransitionScheduled = true;
        const timeoutId = setTimeout(() => moveToPhase('webrtc'), 0);
        timeoutsRef.current.push(timeoutId);
        return;
      }
    }

    // Auto-progress from webrtc to signaling when webrtc is initialized
    if (initPhase === 'webrtc' && webrtc.isInitialized && !phaseTransitionScheduled) {
      phaseTransitionScheduled = true;
      const timeoutId = setTimeout(() => moveToPhase('signaling'), 0);
      timeoutsRef.current.push(timeoutId);
      return;
    }

    // Auto-progress from chat to complete when chat is ready
    if (initPhase === 'chat' && chat.chatReady && !phaseTransitionScheduled) {
      phaseTransitionScheduled = true;
      const timeoutId = setTimeout(() => {
        moveToPhase('complete');
        setLoading(false);
      }, 0);
      timeoutsRef.current.push(timeoutId);
      return;
    }

    // Auto-complete if chat fails but we've already connected to the room
    if (
      initPhase === 'chat' &&
      chat.chatError &&
      signaling.connected &&
      !phaseTransitionScheduled
    ) {
      phaseTransitionScheduled = true;
      logger.warn('Chat failed, but proceeding with room initialization');
      const timeoutId = setTimeout(() => {
        moveToPhase('complete');
        setLoading(false);
      }, 0);
      timeoutsRef.current.push(timeoutId);
    }
  }, [
    auth.authChecked,
    media.localStream,
    webrtc.isInitialized,
    chat.chatReady,
    chat.chatError,
    signaling.connected,
    skipMediaAccess,
    moveToPhase,
    logger,
    initPhase,
  ]);

  // Handle room exit
  const exitRoom = useCallback(async () => {
    // Cleanup will happen in hooks' effects
    router.replace('/');
  }, [router]);

  return {
    // State
    loading,
    error,
    initPhase,
    skipMediaAccess,
    setSkipMediaAccess,

    // Hooks
    auth,
    media,
    webrtc,
    signaling,
    chat,

    // Actions
    exitRoom,

    // Connection state
    connected: signaling.connected,
  };
}
