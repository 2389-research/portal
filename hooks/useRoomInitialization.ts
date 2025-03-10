import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

interface PhaseConfig {
  timeoutMs: number;
  onTimeout: (
    moveToPhase: (phase: InitPhase) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    logger: ReturnType<typeof createLogger>
  ) => void;
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

  // Move to the next initialization phase
  const moveToPhase = useCallback(
    (phase: InitPhase) => {
      logger.info('Moving to phase:', phase);
      setInitPhase(phase);
    },
    [logger]
  );

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
      // Media errors are handled via the UI, user can continue via UI button
      logger.warn('Media error occurred, user can continue via UI button:', error);
    },
  });

  // WebRTC hook (depends on media.localStream)
  const webrtc = useWebRTC(media.localStream, {
    skipWebRTC: skipMediaAccess,
    onWebRTCError: (error) => {
      logger.error('WebRTC error:', error);
      // WebRTC errors are handled via the UI, user can continue via UI button
      logger.warn('WebRTC error occurred, user can continue via UI button');
    },
    // Handle renegotiation needed events
    onRenegotiationNeeded: async (connectionId: string) => {
      logger.info('WebRTC renegotiation needed for connection ID:', connectionId);

      if (webrtc.handleRenegotiation && signaling.connected) {
        try {
          // Generate a new offer for renegotiation
          const result = await webrtc.handleRenegotiation();

          if (result) {
            // Broadcast the renegotiation offer to all peers in the room
            logger.info('Sending renegotiation offer');
            await signaling.sendMessage(
              'webrtc-offer',
              result.offer,
              undefined,
              undefined,
              undefined,
              {
                connectionId: result.connectionId,
                isRenegotiation: true,
              }
            );
          }
        } catch (error) {
          logger.error('Error handling WebRTC renegotiation:', error);
        }
      }
    },
    // Handle track removals
    onTrackRemoved: (trackId: string, peerId: string) => {
      logger.info(`Remote track ${trackId} was removed from peer ${peerId}`);
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
              await signaling.sendMessage('webrtc-offer', offer, userId, undefined, undefined, {
                connectionId,
              });
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
      // Non-fatal, just move to completion if we're in the chat phase
      if (initPhase === 'chat') {
        moveToPhase('complete');
      }
    },
  });

  // Define phase configurations
  const phaseConfigs: Record<Exclude<InitPhase, 'complete'>, PhaseConfig> = {
    auth: {
      timeoutMs: 15000,
      onTimeout: (moveToPhase, setLoading, setError, logger) => {
        logger.warn('Auth phase timed out, but continuing with initialization');
        moveToPhase('media');
      },
    },
    media: {
      timeoutMs: 30000,
      onTimeout: (moveToPhase, setLoading, setError, logger) => {
        logger.warn('Media initialization timeout reached - user can continue using UI button');
      },
    },
    webrtc: {
      timeoutMs: 15000,
      onTimeout: (moveToPhase, setLoading, setError, logger) => {
        logger.warn('WebRTC initialization timeout reached - user can continue using UI button');
      },
    },
    signaling: {
      timeoutMs: 30000,
      onTimeout: (moveToPhase, setLoading, setError, logger) => {
        setError('Room initialization timed out during signaling phase. Please try again later.');
        setLoading(false);
      },
    },
    chat: {
      timeoutMs: 15000,
      onTimeout: (moveToPhase, setLoading, setError, logger) => {
        logger.warn('Chat initialization timed out, but continuing without chat');
        moveToPhase('complete');
        setLoading(false);
      },
    },
  };

  // Setup phase timeouts
  useEffect(() => {
    if (!loading || !roomId) return;

    logger.info('Setting up phase timeouts');

    // Create a timeout watcher function
    const watchPhaseTimeout = (phase: Exclude<InitPhase, 'complete'>) => {
      const { timeoutMs, onTimeout } = phaseConfigs[phase];

      const timeoutId = setTimeout(() => {
        if (initPhase === phase && loading) {
          logger.error(
            `Phase '${phase}' initialization timed out after ${timeoutMs / 1000} seconds`
          );
          onTimeout(moveToPhase, setLoading, setError, logger);
        }
      }, timeoutMs);

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

  // Handle WebRTC signaling messages
  useEffect(() => {
    if (!signaling.connected || !webrtc.isInitialized) {
      return;
    }

    logger.info('Setting up WebRTC signaling handlers');

    const handleSignalingMessage = async (type: string, message: any) => {
      try {
        // Extract the connection ID from the message
        const connectionId = message.connectionId || (message.data && message.data.connectionId);

        // Check if this is a renegotiation
        const isRenegotiation =
          message.isRenegotiation || (message.data && message.data.isRenegotiation);

        switch (type) {
          case 'webrtc-offer':
            if (!webrtc.processOffer) return;

            if (isRenegotiation) {
              logger.info('Received renegotiation offer with connection ID:', connectionId);
            }

            if (!connectionId) {
              logger.warn('Received offer without connection ID, generating a fallback ID');
              // Generate a fallback ID if none was provided (for backward compatibility)
              const fallbackId = Math.random().toString(36).substring(2, 15);
              logger.info('Using fallback connection ID:', fallbackId);

              const answer = await webrtc.processOffer(message.data, fallbackId);
              if (answer) {
                // Send answer with the fallback connection ID
                await signaling.sendMessage(
                  'webrtc-answer',
                  answer.answer,
                  message.sender,
                  undefined,
                  undefined,
                  {
                    connectionId: fallbackId,
                    isRenegotiation,
                  }
                );
              }
            } else {
              logger.info(
                `Processing ${isRenegotiation ? 'renegotiation ' : ''}offer with connection ID:`,
                connectionId
              );
              const answer = await webrtc.processOffer(message.data, connectionId);

              if (answer) {
                // Send answer with same connection ID from the offer
                await signaling.sendMessage(
                  'webrtc-answer',
                  answer.answer,
                  message.sender,
                  undefined,
                  undefined,
                  {
                    connectionId,
                    isRenegotiation,
                  }
                );
              }
            }
            break;

          case 'webrtc-answer':
            if (!webrtc.processAnswer) return;

            if (isRenegotiation) {
              logger.info('Received answer for renegotiation with connection ID:', connectionId);
            }

            if (!connectionId) {
              logger.warn('Received answer without connection ID, using default connection');
              // For backward compatibility, still process the answer
              await webrtc.processAnswer(
                message.data,
                webrtc.webrtcManager?.getCurrentConnectionId() || 'default'
              );
            } else {
              logger.info(
                `Processing ${isRenegotiation ? 'renegotiation ' : ''}answer with connection ID:`,
                connectionId
              );
              await webrtc.processAnswer(message.data, connectionId);

              // If this was a renegotiation, we need to complete the process
              if (isRenegotiation && webrtc.webrtcManager) {
                logger.info('Completing renegotiation after receiving answer');
                await webrtc.webrtcManager.completeRenegotiation();
              }
            }
            break;

          case 'ice-candidate':
            if (!webrtc.addIceCandidate) return;

            if (!connectionId) {
              logger.warn('Received ICE candidate without connection ID, using default connection');
              // For backward compatibility, still process the candidate with the current connection ID
              await webrtc.addIceCandidate(
                message.data,
                webrtc.webrtcManager?.getCurrentConnectionId() || 'default'
              );
            } else {
              logger.info('Adding ICE candidate with connection ID:', connectionId);
              await webrtc.addIceCandidate(message.data, connectionId);
            }
            break;
        }
      } catch (error) {
        logger.error(`Error handling ${type}:`, error);
      }
    };

    // Register handlers
    const handleOffer = (message: any) => handleSignalingMessage('webrtc-offer', message);
    const handleAnswer = (message: any) => handleSignalingMessage('webrtc-answer', message);
    const handleIceCandidate = (message: any) => handleSignalingMessage('ice-candidate', message);

    signaling.on('webrtc-offer', handleOffer);
    signaling.on('webrtc-answer', handleAnswer);
    signaling.on('ice-candidate', handleIceCandidate);

    // Setup ICE candidate handler
    if (webrtc.setOnIceCandidate) {
      webrtc.setOnIceCandidate(async (candidate, connectionId) => {
        // Send ICE candidate with the connection ID
        await signaling.sendMessage('ice-candidate', candidate, undefined, undefined, undefined, {
          connectionId,
        });
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

    // Run room initialization
    const initializeRoom = async () => {
      try {
        logger.info('Current initialization phase:', initPhase);

        switch (initPhase) {
          case 'auth':
            // Wait for auth check to complete
            if (auth.authChecked) {
              moveToPhase('media');
            }
            break;

          case 'signaling':
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
            break;

          case 'complete':
            logger.info('Room initialization complete');
            setLoading(false);
            break;
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
    // Create a function to safely schedule phase transitions
    const schedulePhaseTransition = (nextPhase: InitPhase, shouldSetLoading = false) => {
      // Don't schedule the same phase transition twice
      if (nextPhase === initPhase) {
        logger.debug(`Already in phase ${nextPhase}, not transitioning`);
        return;
      }

      logger.info(`Scheduling transition from ${initPhase} to ${nextPhase}`);

      // Use a timeout to break the render cycle
      const timeoutId = setTimeout(() => {
        moveToPhase(nextPhase);
        if (shouldSetLoading === false) {
          setLoading(false);
        }
      }, 0);

      timeoutsRef.current.push(timeoutId);
    };

    // Use a state variable to prevent multiple transitions in a single effect cycle
    let phaseTransitionScheduled = false;

    // Process transitions in a specific order of priority
    const processPhaseTransitions = () => {
      // 1. Auth → Media transition
      if (initPhase === 'auth' && auth.authChecked && !phaseTransitionScheduled) {
        logger.debug('Auth checked, transitioning to media phase');
        phaseTransitionScheduled = true;
        schedulePhaseTransition('media');
        return;
      }

      // 2. Media → WebRTC/Signaling transition
      if (initPhase === 'media' && !phaseTransitionScheduled) {
        if (skipMediaAccess) {
          logger.debug('Media access skipped, transitioning to signaling phase');
          phaseTransitionScheduled = true;
          schedulePhaseTransition('signaling');
          return;
        }

        if (media.localStream) {
          logger.debug('Local stream available, transitioning to WebRTC phase');
          phaseTransitionScheduled = true;
          schedulePhaseTransition('webrtc');
          return;
        }
      }

      // 3. WebRTC → Signaling transition (only when WebRTC is fully initialized)
      if (initPhase === 'webrtc' && webrtc.isInitialized && !phaseTransitionScheduled) {
        logger.debug('WebRTC initialized, transitioning to signaling phase');
        phaseTransitionScheduled = true;
        schedulePhaseTransition('signaling');
        return;
      }

      // 4. Chat → Complete transition
      if (initPhase === 'chat' && !phaseTransitionScheduled) {
        if (chat.chatReady) {
          logger.debug('Chat ready, completing initialization');
          phaseTransitionScheduled = true;
          schedulePhaseTransition('complete', false);
          return;
        }

        // Handle chat errors but only if we're connected to the room
        if (chat.chatError && signaling.connected) {
          logger.warn('Chat failed, but proceeding with room initialization');
          phaseTransitionScheduled = true;
          schedulePhaseTransition('complete', false);
          return;
        }
      }
    };

    // Process transitions once per render cycle
    processPhaseTransitions();
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
