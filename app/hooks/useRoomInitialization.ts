import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { createLogger } from '../services/logger';
import { useAuth } from './useAuth';
import { useMedia } from './useMedia';
import { useWebRTC } from './useWebRTC';
import { useSignaling } from './useSignaling';
import { useChat } from './useChat';

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
      
      // Show alert for media error
      Alert.alert(
        'Media Access Error',
        `${error}\n\nWould you like to continue without camera/microphone access?`,
        [
          {
            text: 'No, go back',
            style: 'cancel',
            onPress: () => router.replace('/'),
          },
          {
            text: 'Yes, continue',
            onPress: () => {
              setSkipMediaAccess(true);
              moveToPhase('signaling');
            },
          },
        ]
      );
    },
  });
  
  // WebRTC hook (depends on media.localStream)
  const webrtc = useWebRTC(media.localStream, {
    skipWebRTC: skipMediaAccess,
    onWebRTCError: (error) => {
      logger.error('WebRTC error:', error);
      
      // Show alert for WebRTC error
      Alert.alert(
        'WebRTC Setup Error',
        `${error}\n\nWould you like to continue without video connection?`,
        [
          {
            text: 'No, keep trying',
            style: 'cancel',
          },
          {
            text: 'Yes, skip video',
            onPress: () => {
              setSkipMediaAccess(true);
              moveToPhase('signaling');
            },
          },
        ]
      );
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
            const offer = await webrtc.createOffer();
            if (offer && signaling.sendMessage) {
              await signaling.sendMessage('webrtc-offer', offer, userId);
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

  // Chat hook (depends on signaling.userId and webrtc.webrtcManager)
  const chat = useChat(signaling.userId, webrtc.webrtcManager, {
    onChatError: (error) => {
      logger.warn('Chat error, but continuing:', error);
      // Non-fatal, just move to completion
      moveToPhase('complete');
    },
  });

  // Move to the next initialization phase
  const moveToPhase = useCallback((phase: InitPhase) => {
    logger.info('Moving to phase:', phase);
    setInitPhase(phase);
  }, [logger]);

  // Setup phase timeouts
  useEffect(() => {
    if (!loading || !roomId) return;

    logger.info('Setting up phase timeouts');
    
    // Phase-specific timeouts
    const phaseTimeouts = {
      auth: 30000, // 30 seconds for auth
      media: 30000, // 30 seconds for media
      webrtc: 30000, // 30 seconds for WebRTC
      signaling: 30000, // 30 seconds for signaling
      chat: 20000, // 20 seconds for chat
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
              // For media phase, offer to skip media access
              Alert.alert(
                'Media Initialization Timeout',
                'Camera and microphone are taking too long to initialize. Would you like to continue without media?',
                [
                  { text: 'No, keep trying', style: 'cancel' },
                  {
                    text: 'Yes, skip media',
                    onPress: () => {
                      setSkipMediaAccess(true);
                      moveToPhase('signaling');
                    },
                  },
                ]
              );
              break;

            case 'webrtc':
              // For WebRTC phase, offer to skip WebRTC
              Alert.alert(
                'WebRTC Initialization Timeout',
                'Video connection setup is taking too long. Would you like to continue without video?',
                [
                  { text: 'No, keep trying', style: 'cancel' },
                  {
                    text: 'Yes, skip video',
                    onPress: () => {
                      setSkipMediaAccess(true);
                      moveToPhase('signaling');
                    },
                  },
                ]
              );
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

        const answer = await webrtc.processOffer(message.data);
        if (answer) {
          await signaling.sendMessage('webrtc-answer', answer, message.sender);
        }
      } catch (error) {
        logger.error('Error processing offer:', error);
      }
    };

    // Handle WebRTC answer
    const handleAnswer = async (message: any) => {
      try {
        if (!webrtc.processAnswer) return;
        await webrtc.processAnswer(message.data);
      } catch (error) {
        logger.error('Error processing answer:', error);
      }
    };

    // Handle ICE candidates
    const handleIceCandidate = async (message: any) => {
      try {
        if (!webrtc.addIceCandidate) return;
        await webrtc.addIceCandidate(message.data);
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
      webrtc.setOnIceCandidate(async (candidate) => {
        await signaling.sendMessage('ice-candidate', candidate);
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
    logger
  ]);

  // Auto-progress phases when subsystems are ready
  useEffect(() => {
    // Auto-progress from auth to media when auth is checked
    if (initPhase === 'auth' && auth.authChecked) {
      moveToPhase('media');
      return;
    }
    
    // Auto-progress from media to webrtc when media is ready or skipped
    if (initPhase === 'media') {
      if (skipMediaAccess) {
        moveToPhase('signaling');
        return;
      }
      
      if (media.localStream) {
        moveToPhase('webrtc');
        return;
      }
    }
    
    // Auto-progress from webrtc to signaling when webrtc is initialized
    if (initPhase === 'webrtc' && webrtc.isInitialized) {
      moveToPhase('signaling');
      return;
    }
    
    // Auto-progress from chat to complete when chat is ready
    if (initPhase === 'chat' && chat.chatReady) {
      moveToPhase('complete');
      setLoading(false);
      return;
    }
    
    // Auto-complete if chat fails but we've already connected to the room
    if (initPhase === 'chat' && chat.chatError && signaling.connected) {
      logger.warn('Chat failed, but proceeding with room initialization');
      moveToPhase('complete');
      setLoading(false);
    }
  }, [
    initPhase, 
    auth.authChecked, 
    media.localStream, 
    webrtc.isInitialized, 
    chat.chatReady,
    chat.chatError,
    signaling.connected,
    skipMediaAccess,
    moveToPhase,
    logger
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