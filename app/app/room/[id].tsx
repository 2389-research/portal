import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Alert, Clipboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layout, Text, Button, Icon, IconProps, Spinner } from '@ui-kitten/components';

// Define interfaces for the component
interface MediaDevice {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

// Import components
import { VideoGrid } from '../../components/VideoGrid';
import { ChatInterface } from '../../components/ChatInterface';
import { MediaControls } from '../../components/MediaControls';
import { DeviceSettings } from '../../components/DeviceSettings';

// Import services
import { ApiProvider } from '../../api';
import { MediaManager } from '../../services/media';
import { WebRTCManager } from '../../services/webrtc';
import { SignalingService } from '../../services/signaling';
import { ChatManager, ChatMessage } from '../../services/chat/index';
import { createLogger } from '../../services/logger';

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams();
  const router = useRouter();
  const logger = createLogger('Room');

  // State for managing room
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [_userId, setUserId] = useState<string | null>(null); // Prefixed with _ to indicate currently unused
  const [_isAuthenticated, setIsAuthenticated] = useState(false); // Prefixed with _ to indicate currently unused
  const [initPhase, setInitPhase] = useState<'auth' | 'media' | 'webrtc' | 'signaling' | 'chat' | 'complete'>('auth');

  // State for media controls
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // State for media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);

  // State for device selection
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDevice[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDevice[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDevice[]>([]);

  // State for chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatReady, setChatReady] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [_lastChatCheck, setLastChatCheck] = useState(0); // To track periodic checks (currently unused)
  
  // State for error handling
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [skipMediaAccess, setSkipMediaAccess] = useState(false);

  // Service references
  const mediaManager = useRef<MediaManager | null>(null);
  const webrtcManager = useRef<WebRTCManager | null>(null);
  const signalingService = useRef<SignalingService | null>(null);
  const chatManager = useRef<ChatManager | null>(null);

  // Initialize all services and join room
  useEffect(() => {
    if (!roomId) {
      setError('Invalid room ID');
      setLoading(false);
      return;
    }

    // Check for authentication first
    const checkAuth = async () => {
      const provider = ApiProvider.getInstance();
      const apiClient = provider.getApiClient();

      if (!apiClient) {
        setError('API client not initialized');
        setLoading(false);
        return false;
      }

      // Check if the user is authenticated
      if (apiClient.getProviderName() === 'Firebase' && apiClient.getCurrentUser) {
        const user = apiClient.getCurrentUser();

        if (!user) {
          logger.info('User not authenticated');
          setError('Please sign in to join a room');
          setLoading(false);
          return false;
        }

        logger.info('User authenticated:', user.displayName);
        setIsAuthenticated(true);
        return true;
      }

      // Fall back to allow if auth check not possible
      return true;
    };

    // Set multiple timeouts for different initialization phases
    const timeouts: NodeJS.Timeout[] = [];
    
    // Define skipMediaAccess state
    const [skipMediaAccess, setSkipMediaAccess] = useState(false);

    // Define cleanup function for use in useEffect
    const cleanup = async () => {
      try {
        console.log('[Room] Running cleanup');
        
        // Leave the room if we joined
        if (signalingService.current && roomId) {
          await signalingService.current.leaveRoom();
        }
        
        // Dispose chat manager
        if (chatManager.current) {
          chatManager.current.dispose();
        }
        
        // Stop local stream if it's active
        if (mediaManager.current && localStream) {
          mediaManager.current.stopLocalStream(localStream);
        }
        
        // Clear all media state
        setLocalStream(null);
        setRemoteStreams(new Map());
        setScreenShareStream(null);
        
        console.log('[Room] Cleanup complete');
      } catch (error) {
        console.error('[Room] Error during cleanup:', error);
      }
    };
    
    // Master timeout as a safety net (2 minutes total)
    timeouts.push(setTimeout(() => {
      if (loading) {
        logger.error('Room initialization timed out after 120 seconds (master timeout)');
        setError('Room initialization timed out. Please try again or skip media access.');
        setLoading(false);
      }
    }, 120000));
    
    // Phase-specific timeouts
    const phaseTimeouts = {
      auth: 30000,      // 30 seconds for auth (increased from 10s)
      media: 30000,     // 30 seconds for media
      webrtc: 30000,    // 30 seconds for WebRTC
      signaling: 30000, // 30 seconds for signaling (increased from 20s)
      chat: 20000       // 20 seconds for chat
    };
    
    // Create a timeout watcher function
    const watchPhaseTimeout = (phase: 'auth' | 'media' | 'webrtc' | 'signaling' | 'chat') => {
      const timeoutId = setTimeout(() => {
        if (initPhase === phase && loading) {
          logger.error(`Phase '${phase}' initialization timed out after ${phaseTimeouts[phase]/1000} seconds`);
          
          // Handle timeout based on the phase
          switch(phase) {
            case 'auth':
              // For auth phase, just log error and continue to next phase
              logger.warn('Auth phase timed out, but continuing with initialization');
              setInitPhase('media');
              // Don't set error or stop loading, just move to next phase
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
                      setInitPhase('signaling');
                    }
                  }
                ]
              );
              break;
              
            case 'webrtc':
              // For WebRTC phase, offer to skip WebRTC (which means skipping media)
              Alert.alert(
                'WebRTC Initialization Timeout',
                'Video connection setup is taking too long. Would you like to continue without video?',
                [
                  { text: 'No, keep trying', style: 'cancel' },
                  { 
                    text: 'Yes, skip video', 
                    onPress: () => {
                      setSkipMediaAccess(true);
                      setInitPhase('signaling');
                    }
                  }
                ]
              );
              break;
              
            case 'signaling':
              // For signaling, this is critical so we stop with an error
              setError(`Room initialization timed out during signaling phase. Please try again later.`);
              setLoading(false);
              break;
              
            case 'chat':
              // For chat, we can continue without it
              console.warn('[Room] Chat initialization timed out, but continuing without chat');
              setChatReady(false);
              setInitPhase('complete');
              // Don't block the UI on chat initialization
              setLoading(false);
              break;
              
            default:
              // Generic fallback
              setError(`Room initialization timed out during ${phase} phase. Please try again.`);
              setLoading(false);
          }
        }
      }, phaseTimeouts[phase]);
      
      timeouts.push(timeoutId);
      return timeoutId;
    };

    const initializeRoom = async () => {
      logger.info('Starting initialization sequence');
      try {
        setInitPhase('auth');
        // Start the auth phase timeout
        watchPhaseTimeout('auth');
        
        logger.info('Auth phase: Getting API provider');
        // Get API provider - wrap in try/catch to continue even if auth fails
        let apiClient;
        try {
          const provider = ApiProvider.getInstance();
          apiClient = provider.getApiClient();
          console.log('[Room] API provider type:', provider.getApiType());

          if (!apiClient) {
            console.warn('[Room] API client not initialized, proceeding with limited functionality');
          } else {
            // Check auth status if using Firebase
            if (apiClient.getProviderName() === 'Firebase' && apiClient.getCurrentUser) {
              const user = apiClient.getCurrentUser();
              console.log(
                '[Room] Current user:',
                user ? `${user.displayName} (${user.uid})` : 'Not signed in'
              );
            }
          }
        } catch (authError) {
          console.error('[Room] Auth error (continuing):', authError);
          // We'll still try to continue even with auth issues
        }
        
        // Move to next phase immediately after checking auth
        setInitPhase('media');
        // Start the media phase timeout
        watchPhaseTimeout('media');
        
        // Start initializing signaling early (in parallel with media)
        console.log('[Room] Pre-initializing signaling service');
        if (apiClient) {
          signalingService.current = new SignalingService(apiClient);
        } else {
          console.error('[Room] Cannot initialize signaling without API client');
          setError('Could not initialize app. API client unavailable.');
          setLoading(false);
          return;
        }
        
        // Initialize media (if not skipping)
        let stream = null;
        if (!skipMediaAccess) {
          try {
            console.log('[Room] Media phase: Initializing camera and microphone');
            mediaManager.current = new MediaManager();
            
            // Initialize media with a promise race to avoid hanging
            const mediaPromise = mediaManager.current.initialize({ video: true, audio: true });
            
            // Create a media timeout promise
            const mediaTimeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('Media initialization timed out after 20 seconds'));
              }, 20000);
            });
            
            // Race the media initialization against the timeout
            stream = await Promise.race([mediaPromise, mediaTimeoutPromise]) as MediaStream;
            
            // Show local video as soon as camera is ready, without waiting for other steps
            console.log('[Room] Camera initialized, displaying local stream immediately');
            setLocalStream(stream);
            
            // Start enumerating devices and initializing WebRTC in parallel
            const deviceEnumPromise = (async () => {
              console.log('[Room] Enumerating media devices in background');
              try {
                await mediaManager.current!.enumerateDevices();
                setAudioInputDevices(mediaManager.current!.getAudioInputDevices());
                setVideoInputDevices(mediaManager.current!.getVideoInputDevices());
                setAudioOutputDevices(mediaManager.current!.getAudioOutputDevices());
              } catch (error) {
                console.error('[Room] Error enumerating devices (non-critical):', error);
                // Non-fatal, continue with initialization
              }
            })();
            
            // Begin WebRTC initialization phase
            setInitPhase('webrtc');
            // Start the webrtc phase timeout
            watchPhaseTimeout('webrtc');
            
            console.log('[Room] WebRTC phase: Initializing connection');
            webrtcManager.current = new WebRTCManager();
            
            // Initialize WebRTC with the stream
            await webrtcManager.current.initialize(stream);
            console.log('[Room] WebRTC initialized');
            
            // Setup WebRTC callbacks
            webrtcManager.current.setOnTrack((remoteStream, peerId) => {
              console.log('[Room] Received remote stream from peer:', peerId);
              setRemoteStreams((prev) => {
                const newStreams = new Map(prev);
                newStreams.set(peerId, remoteStream);
                return newStreams;
              });
            });
            
            // Wait for device enumeration to complete (non-blocking for UI)
            deviceEnumPromise.catch(error => {
              console.error('[Room] Device enumeration error (continuing):', error);
            });
            
          } catch (mediaError: unknown) {
            console.error('[Room] Media access error:', mediaError);
            // Store the error but don't throw it yet
            const errorMessage = mediaError instanceof Error 
              ? mediaError.message 
              : typeof mediaError === 'object' && mediaError !== null && 'message' in mediaError
                ? (mediaError as { message: string }).message
                : 'Failed to access camera/microphone';
                
            setMediaError(errorMessage);
            // Don't rethrow, we'll continue with signaling
            console.log('[Room] Continuing without media due to error');
            setSkipMediaAccess(true);
          }
        } else {
          console.log('[Room] Skipping media initialization as requested');
        }

        // Begin signaling phase - this runs whether media succeeded or not
        setInitPhase('signaling');
        // Start the signaling phase timeout
        watchPhaseTimeout('signaling');
        
        console.log('[Room] Signaling phase: Joining room');
        
        // Join room
        console.log('[Room] Joining room:', roomId);
        const newUserId = await signalingService.current.joinRoom(roomId as string);
        setUserId(newUserId);
        console.log('[Room] Joined room with user ID:', newUserId);
        
        // Mark as connected as soon as signaling is established
        setConnected(true);
        
        // Setup signaling handlers
        console.log('[Room] Setting up signaling handlers');
        setupSignalingHandlers();

        // Initialize chat in the background, but don't block UI on it
        if (!skipMediaAccess && webrtcManager.current) {
          // Begin chat initialization phase  
          setInitPhase('chat');
          // Start the chat phase timeout
          watchPhaseTimeout('chat');
          
          console.log('[Room] Chat phase: Initializing chat data channel');
          
          // Initialize chat in the background
          (async () => {
            try {
              chatManager.current = new ChatManager(newUserId, webrtcManager.current!);
              
              // Initialize as initiator with async method
              const chatInitialized = await chatManager.current.initialize(true);
              console.log('[Room] Chat initialization result:', chatInitialized);
              
              // Setup chat message handler
              chatManager.current.onMessage((message) => {
                console.log('[Room] Received chat message from:', message.sender);
                setChatMessages((prev) => [...prev, message]);
              });
              
              // Enable chat based on initialization result
              setChatReady(chatInitialized);
              
              if (!chatInitialized) {
                console.warn('[Room] Chat data channel could not be established, but continuing with room');
              }
            } catch (error: unknown) {
              console.error('[Room] Error initializing chat (non-fatal):', error);
              // Don't block room usage on chat errors
            } finally {
              // Complete initialization
              setInitPhase('complete');
            }
          })();
        } else {
          console.log('[Room] Skipping chat initialization (no WebRTC)');
          setInitPhase('complete');
        }
        
        console.log('[Room] Room initialization complete, UI now active');
      } catch (error: unknown) {
        console.error('[Room] Error initializing room:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : 'Unknown error';
        setError(`Failed to join the room: ${errorMessage}`);
      } finally {
        // Mark loading as complete
        setLoading(false);
      }
    };
    // Check if getUserMedia is supported
    const checkMediaSupport = async () => {
      try {
        console.log('[Room] Checking media support...');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error('[Room] getUserMedia not supported');
          setSkipMediaAccess(true);
          return false;
        }

        console.log('[Room] Media devices API is available');

        // Quick test of permissions - just check if permissions are accessible
        try {
          console.log('[Room] Requesting permission status...');
          // @ts-ignore - Permissions API may not be available in all browsers
          if (navigator.permissions && navigator.permissions.query) {
            // @ts-ignore
            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            console.log('[Room] Camera permission status:', cameraPermission.state);

            // @ts-ignore
            const micPermission = await navigator.permissions.query({ name: 'microphone' });
            console.log('[Room] Microphone permission status:', micPermission.state);

            // If both permissions are denied, skip media access
            if (cameraPermission.state === 'denied' && micPermission.state === 'denied') {
              console.log('[Room] Both camera and microphone permissions are denied');
              setSkipMediaAccess(true);
              return false;
            }
          } else {
            console.log('[Room] Permissions API not available');
          }
        } catch (permErr) {
          console.log('[Room] Error checking permissions:', permErr);
          // Continue despite permission check error - we'll catch it later
        }

        return true;
      } catch (err) {
        console.error('[Room] Error checking media support:', err);
        setSkipMediaAccess(true);
        return false;
      }
    };

    // Run initialization sequence
    const startInitialization = async () => {
      try {
        // Try to check authentication, but don't block on it
        try {
          const isAuthed = await checkAuth();
          if (!isAuthed) {
            // Log warning but still continue
            console.warn('[Room] Authentication check failed, proceeding anyway');
          }
        } catch (authError) {
          console.error('[Room] Auth check error (continuing):', authError);
          // Don't block on auth errors
        }
  
        // Check media support
        let hasMediaSupport = false;
        try {
          hasMediaSupport = await checkMediaSupport();
          console.log('[Room] Media support check result:', hasMediaSupport);
        } catch (mediaCheckError: unknown) {
          console.error('[Room] Error checking media support:', mediaCheckError);
          // Assume no support on error
          hasMediaSupport = false;
        }
  
        if (!hasMediaSupport) {
          console.log('[Room] Proceeding without media support');
          setSkipMediaAccess(true);
        }
        
        // Always use the main initialization flow, which now handles both
        // media and no-media paths
        await initializeRoom();
        
      } catch (error: unknown) {
        console.error('[Room] Fatal error in initialization sequence:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : 'Unknown error';
        setError(`Failed to initialize: ${errorMessage}`);
        setLoading(false);
      }
    };

    startInitialization();

    // Cleanup on unmount
    return () => {
      console.log('[Room] Component unmounting, performing cleanup');
      
      // Clear all timeouts
      timeouts.forEach(id => clearTimeout(id));
      
      // Use an immediately invoked async function to ensure cleanup completes
      (async () => {
        try {
          await cleanup();
        } catch (error) {
          console.error('[Room] Error during cleanup on unmount:', error);
        }
      })();
    };
  }, [roomId, initPhase, loading, logger]);

  // Setup signaling handlers for WebRTC
  const setupSignalingHandlers = () => {
    if (!signalingService.current || !webrtcManager.current) return;

    // Handle WebRTC offer
    signalingService.current.on('webrtc-offer', async (message) => {
      try {
        if (!webrtcManager.current) return;

        const answer = await webrtcManager.current.processOffer(message.data);

        // Send answer back
        await signalingService.current?.sendMessage('webrtc-answer', answer, message.sender);
      } catch (error) {
        console.error('Error processing offer:', error);
      }
    });

    // Handle WebRTC answer
    signalingService.current.on('webrtc-answer', async (message) => {
      try {
        if (!webrtcManager.current) return;

        await webrtcManager.current.processAnswer(message.data);
      } catch (error) {
        console.error('Error processing answer:', error);
      }
    });

    // Handle ICE candidates
    signalingService.current.on('ice-candidate', async (message) => {
      try {
        if (!webrtcManager.current) return;

        await webrtcManager.current.addIceCandidate(message.data);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    // Handle user joined event
    signalingService.current.on('user-joined', async (message) => {
      try {
        if (!webrtcManager.current) return;

        // Create and send offer to the new user
        const offer = await webrtcManager.current.createOffer();
        await signalingService.current?.sendMessage('webrtc-offer', offer, message.sender);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    });

    // Handle user left event
    signalingService.current.on('user-left', (message) => {
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        // Remove streams from the user who left
        // In a real implementation, we would have a mapping of userId to peerId
        return newStreams;
      });
    });

    // Setup ICE candidate handler
    webrtcManager.current.setOnIceCandidate(async (candidate) => {
      await signalingService.current?.sendMessage('ice-candidate', candidate);
    });
  };

  // Handle send chat message
  const handleSendMessage = (content: string) => {
    if (!chatManager.current) {
      console.error('[Room] Chat manager not initialized in handleSendMessage');
      return;
    }
    
    // Double check that data channel is ready
    if (!chatManager.current.isReady()) {
      console.error('[Room] Chat channel not ready when attempting to send message');
      setChatReady(false); // Update UI state to reflect reality
      
      // Try to re-establish chat data channel
      const tryReconnect = async () => {
        console.log('[Room] Attempting to re-establish chat data channel');
        if (chatManager.current) {
          const ready = await chatManager.current.waitForReady(5000);
          console.log('[Room] Re-established chat data channel result:', ready);
          setChatReady(ready);
          
          // If reconnected, try sending the message again
          if (ready) {
            chatManager.current.sendMessage(content);
          }
        }
      };
      
      tryReconnect();
      return;
    }

    // If all checks pass, send the message
    const result = chatManager.current.sendMessage(content);
    if (!result) {
      console.error('[Room] Failed to send message, updating chat ready state');
      setChatReady(false);
    }
  };

  // Handle toggle audio
  const handleToggleAudio = () => {
    if (!mediaManager.current) return;

    const newState = mediaManager.current.toggleAudio();
    setAudioEnabled(newState);
  };

  // Handle toggle video
  const handleToggleVideo = () => {
    if (!mediaManager.current) return;

    const newState = mediaManager.current.toggleVideo();
    setVideoEnabled(newState);
  };

  // Handle screen sharing
  const handleShareScreen = async () => {
    if (!mediaManager.current || !webrtcManager.current) return;

    if (isScreenSharing) {
      // Stop screen sharing
      setIsScreenSharing(false);
      setScreenShareStream(null);

      // TODO: In a complete implementation, we would need to:
      // 1. Stop the screen share track
      // 2. Remove it from the peer connection
      // 3. Notify other participants
    } else {
      // Start screen sharing
      try {
        const stream = await mediaManager.current.getScreenShareStream();
        if (stream) {
          setScreenShareStream(stream);
          setIsScreenSharing(true);

          // TODO: In a complete implementation, we would need to:
          // 1. Add the screen share track to the peer connection
          // 2. Renegotiate with peers
        }
      } catch (error) {
        console.error('Error sharing screen:', error);
        Alert.alert('Screen Sharing Failed', 'Failed to start screen sharing. Please try again.');
      }
    }
  };

  // Handle device selection
  const handleDeviceSelection = async (
    audioDevice: string,
    videoDevice: string,
    audioOutputDevice: string
  ) => {
    if (!mediaManager.current) return;

    // Change audio input device
    if (audioDevice && audioDevice !== mediaManager.current.getCurrentAudioDevice()) {
      await mediaManager.current.switchAudioDevice(audioDevice);
    }

    // Change video input device
    if (videoDevice && videoDevice !== mediaManager.current.getCurrentVideoDevice()) {
      await mediaManager.current.switchVideoDevice(videoDevice);
    }

    // Change audio output device (if supported)
    if (
      audioOutputDevice &&
      audioOutputDevice !== mediaManager.current.getCurrentAudioOutputDevice()
    ) {
      // Find all video elements to apply output device change
      // This is simplified - in a real implementation we would need to handle this differently
      const videoElements = document.querySelectorAll('video');
      for (const element of videoElements) {
        await mediaManager.current.switchAudioOutputDevice(audioOutputDevice, element);
      }
    }

    // Update local stream reference
    if (mediaManager.current) {
      setLocalStream(mediaManager.current.getStream());
    }
  };

  // Handle room leave
  const handleLeaveRoom = async () => {
    await cleanup();
    router.replace('/');
  };

  // Cleanup resources - wrapped in useCallback to avoid dependency issues
  const cleanup = useCallback(async () => {
    console.log('[Room] Starting cleanup...');
    
    // Reset states first to avoid any component updates during cleanup
    setRemoteStreams(new Map());
    setChatMessages([]);
    setChatReady(false);
    
    // Close WebRTC connections first to stop any media streams
    if (webrtcManager.current) {
      console.log('[Room] Closing WebRTC connections');
      try {
        webrtcManager.current.close();
      } catch (error) {
        console.error('[Room] Error closing WebRTC:', error);
      }
      webrtcManager.current = null;
    }

    // Close chat connections
    if (chatManager.current) {
      console.log('[Room] Closing chat manager');
      try {
        chatManager.current.close();
      } catch (error) {
        console.error('[Room] Error closing chat manager:', error);
      }
      chatManager.current = null;
    }

    // Stop media streams
    if (mediaManager.current) {
      console.log('[Room] Stopping media streams');
      try {
        mediaManager.current.stop();
      } catch (error) {
        console.error('[Room] Error stopping media:', error);
      }
      mediaManager.current = null;
    }

    // Stop screen sharing
    if (screenShareStream) {
      console.log('[Room] Stopping screen share');
      try {
        screenShareStream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error('[Room] Error stopping screen share:', error);
      }
      setScreenShareStream(null);
    }
    
    // Leave room via signaling (do this last to ensure all other cleanup completes)
    if (signalingService.current) {
      console.log('[Room] Leaving room via signaling service');
      try {
        await signalingService.current.leaveRoom();
      } catch (error) {
        console.error('[Room] Error leaving room:', error);
      }
      signalingService.current = null;
    }
    
    // Clean up local references
    setLocalStream(null);
    setUserId(null);
    
    console.log('[Room] Cleanup complete');
  }, [
    setRemoteStreams, 
    setChatMessages, 
    setChatReady, 
    setLocalStream, 
    setScreenShareStream, 
    setUserId,
    screenShareStream
  ]);

  // Copy room ID to clipboard
  const copyRoomId = () => {
    Clipboard.setString(roomId as string);
    Alert.alert('Copied', 'Room ID copied to clipboard');
  };

  // Render copy icon
  const renderCopyIcon = (props?: IconProps) => <Icon {...props} name="copy-outline" />;

  // This state is already defined at the top of the component

  // Add a useEffect for periodically checking chat data channel status
  useEffect(() => {
    // Only run this if we're connected and have a chat manager
    if (!connected || !chatManager.current) {
      return;
    }
    
    // Set up an interval to check chat status every 5 seconds
    const intervalId = setInterval(() => {
      if (chatManager.current) {
        // Check if the channel is ready
        const isChannelReady = chatManager.current.isReady();
        
        // If our UI state doesn't match reality, update it
        if (chatReady !== isChannelReady) {
          console.log('[Room] Chat ready state mismatch detected, updating UI state', 
                      {uiReady: chatReady, actualReady: isChannelReady});
          setChatReady(isChannelReady);
        }
        
        setLastChatCheck(Date.now());
      }
    }, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [connected, chatReady]);

  // Use effect to handle media errors
  useEffect(() => {
    if (mediaError && !skipMediaAccess) {
      // If there's a media error, offer to proceed without media
      Alert.alert(
        'Media Access Error',
        `${mediaError}\n\nWould you like to continue without camera/microphone access?`,
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
              setLoading(true);
              // Re-trigger initialization with skipMediaAccess=true
              const initRoom = async () => {
                try {
                  console.log('[Room] Retrying initialization without media');

                  // Get API provider
                  const provider = ApiProvider.getInstance();
                  const apiClient = provider.getApiClient();

                  if (!apiClient) {
                    throw new Error('API client not initialized');
                  }

                  // Skip media, Just initialize signaling
                  console.log('[Room] Initializing signaling service');
                  signalingService.current = new SignalingService(apiClient);

                  // Join room without media
                  console.log('[Room] Joining room without media:', roomId);
                  const newUserId = await signalingService.current.joinRoom(roomId as string);
                  setUserId(newUserId);
                  console.log('[Room] Joined room with user ID:', newUserId);

                  setConnected(true);
                  setLoading(false);
                  setError(null);
                } catch (err: unknown) {
                  console.error('[Room] Error in retry initialization:', err);
                  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                  setError(`Failed to join room: ${errorMessage}`);
                  setLoading(false);
                }
              };

              initRoom();
            },
          },
        ]
      );
    }
  }, [mediaError, roomId, router, skipMediaAccess]);

  if (loading) {
    // Get loading message based on current phase
    let loadingMessage = "Joining room...";
    let detailMessage = "";
    
    switch(initPhase) {
      case 'auth':
        loadingMessage = "Checking authentication...";
        detailMessage = "Verifying your account before joining the room";
        break;
      case 'media':
        loadingMessage = "Initializing camera and microphone...";
        detailMessage = "This may take a moment. Please allow camera/microphone access if prompted";
        break;
      case 'webrtc':
        loadingMessage = "Setting up video connection...";
        detailMessage = "Establishing peer connections for video chat";
        break;
      case 'signaling':
        loadingMessage = "Joining room...";
        detailMessage = "Connecting to the room and other participants";
        break;
      case 'chat':
        loadingMessage = "Setting up chat...";
        detailMessage = "Almost ready! Setting up text chat functionality";
        break;
    }
    
    return (
      <Layout style={styles.loadingContainer}>
        <Spinner size="large" />
        <Text category="h6" style={styles.loadingText}>{loadingMessage}</Text>
        
        <Text category="s1" style={styles.loadingPhase}>
          Phase {
            initPhase === 'auth' ? '1/5' :
            initPhase === 'media' ? '2/5' :
            initPhase === 'webrtc' ? '3/5' :
            initPhase === 'signaling' ? '4/5' :
            initPhase === 'chat' ? '5/5' : ''
          }
        </Text>
        
        <Text category="c1" appearance="hint" style={styles.loadingHint}>
          {detailMessage}
        </Text>

        {(initPhase === 'media' || initPhase === 'webrtc') && (
          <Button
            style={styles.skipButton}
            appearance="outline"
            status="basic"
            onPress={() => {
              console.log('[Room] User manually skipped media access');
              setSkipMediaAccess(true);
              // Move to signaling phase directly
              setInitPhase('signaling');
            }}
          >
            Skip Media Access
          </Button>
        )}
      </Layout>
    );
  }

  if (error) {
    // Check if error is auth related
    const isAuthError = error.includes('sign in') || error.includes('authenticated');

    return (
      <Layout style={styles.errorContainer}>
        <Text category="h5" status="danger">
          Error
        </Text>
        <Text style={styles.errorText}>{error}</Text>

        {isAuthError ? (
          <View style={styles.authErrorContainer}>
            <Text appearance="hint" style={styles.authErrorText}>
              You need to sign in to use this application.
            </Text>

            <View style={styles.loginButtonContainer}>
              <Button
                appearance="outline"
                status="primary"
                onPress={() => router.replace('/')}
                style={styles.errorButton}
              >
                Go to Login
              </Button>
            </View>
          </View>
        ) : (
          <Button onPress={() => router.replace('/')} style={styles.errorButton}>
            Go Back
          </Button>
        )}
      </Layout>
    );
  }

  // Render chat toggle icon
  const renderChatIcon = (props?: IconProps) => <Icon {...props} name="message-circle-outline" />;

  return (
    <Layout style={styles.container}>
      <View style={styles.headerContainer}>
        <Text category="h6">Room: {typeof roomId === 'string' ? roomId : String(roomId)}</Text>
        <View style={styles.headerButtons}>
          <Button
            size="small"
            appearance="ghost"
            accessoryLeft={renderChatIcon}
            onPress={() => setIsChatVisible(!isChatVisible)}
            status={isChatVisible ? 'primary' : 'basic'}
          />
          <Button
            size="small"
            appearance="ghost"
            accessoryLeft={renderCopyIcon}
            onPress={copyRoomId}
          />
        </View>
      </View>

      {skipMediaAccess ? (
        <View style={styles.noMediaContainer}>
          <Text category="h6" style={styles.noMediaTitle}>
            Media access is disabled
          </Text>
          <Text appearance="hint" style={styles.noMediaText}>
            You're in view-only mode without camera or microphone access.
          </Text>
          <Text category="c1" style={styles.permissionInstructions}>
            To enable camera and microphone access:
          </Text>
          <Text category="c1" style={styles.permissionStep}>
            1. Click the camera icon in your browser's address bar
          </Text>
          <Text category="c1" style={styles.permissionStep}>
            2. Select "Allow" for camera and microphone
          </Text>
          <Text category="c1" style={styles.permissionStep}>
            3. Refresh this page
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.contentContainer}>
            {isChatVisible && chatManager.current && (
              <View style={styles.chatSidebar}>
                <ChatInterface
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  isReady={chatReady}
                />
              </View>
            )}

            <View style={styles.gridContainer}>
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                screenShareStream={screenShareStream}
              />
            </View>
          </View>

          <MediaControls
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            onToggleAudio={handleToggleAudio}
            onToggleVideo={handleToggleVideo}
            onShareScreen={handleShareScreen}
            onOpenSettings={() => setShowSettings(true)}
            onLeaveRoom={handleLeaveRoom}
            isScreenSharing={isScreenSharing}
          />

          <DeviceSettings
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            onApply={handleDeviceSelection}
            audioInputDevices={audioInputDevices}
            videoInputDevices={videoInputDevices}
            audioOutputDevices={audioOutputDevices}
            currentAudioDevice={mediaManager.current?.getCurrentAudioDevice() || null}
            currentVideoDevice={mediaManager.current?.getCurrentVideoDevice() || null}
            currentAudioOutputDevice={mediaManager.current?.getCurrentAudioOutputDevice() || null}
          />
        </>
      )}

      <View style={styles.leaveContainer}>
        <Button status="danger" appearance="outline" onPress={handleLeaveRoom}>
          Leave Room
        </Button>
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40, // Add safe area padding for status bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    marginBottom: 8,
  },
  loadingPhase: {
    marginBottom: 16,
    color: '#666',
  },
  loadingHint: {
    textAlign: 'center',
    marginHorizontal: 30,
    marginBottom: 20,
  },
  skipButton: {
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    textAlign: 'center',
    marginVertical: 20,
  },
  authErrorContainer: {
    marginTop: 5,
  },
  authErrorText: {
    textAlign: 'center',
    marginBottom: 15,
  },
  loginButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  errorButton: {
    marginTop: 10,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  chatSidebar: {
    width: 300,
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    height: '100%',
  },
  gridContainer: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomIdText: {
    marginRight: 10,
  },
  noMediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noMediaTitle: {
    marginBottom: 10,
  },
  noMediaText: {
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionInstructions: {
    marginTop: 20,
    marginBottom: 10,
  },
  permissionStep: {
    marginLeft: 20,
    marginBottom: 5,
  },
  leaveContainer: {
    padding: 10,
    alignItems: 'center',
  },
});
