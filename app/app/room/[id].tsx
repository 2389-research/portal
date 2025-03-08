import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert, Clipboard, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Layout, Text, Card, Button, Icon, IconProps, Spinner } from '@ui-kitten/components';

// Import components
import { VideoGrid } from '../../components/VideoGrid';
import { ChatInterface } from '../../components/ChatInterface';
import { MediaControls } from '../../components/MediaControls';
import { DeviceSettings } from '../../components/DeviceSettings';

// Import services
import { ApiProvider } from '../../api/ApiProvider';
import { MediaManager } from '../../services/media';
import { WebRTCManager } from '../../services/webrtc';
import { SignalingService } from '../../services/signaling';
import { ChatManager, ChatMessage } from '../../services/chat';

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams();
  const router = useRouter();

  // State for managing room
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const [audioInputDevices, setAudioInputDevices] = useState<any[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<any[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<any[]>([]);

  // State for chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatReady, setChatReady] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);

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
          console.log('[Room] User not authenticated');
          setError('Please sign in to join a room');
          setLoading(false);
          return false;
        }

        console.log('[Room] User authenticated:', user.displayName);
        setIsAuthenticated(true);
        return true;
      }

      // Fall back to allow if auth check not possible
      return true;
    };

    // Set a timeout to prevent indefinite loading, but with a longer duration
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.error('[Room] Room initialization timed out after 60 seconds');
        setError('Room initialization timed out. Please try again or skip media access.');
        setLoading(false);
      }
    }, 60000); // Extended to 60 seconds to allow more time for WebRTC

    const initializeRoom = async () => {
      console.log('[Room] PHASE 1: Starting initialization sequence');
      try {
        console.log('[Room] Starting room initialization');

        // Get API provider
        const provider = ApiProvider.getInstance();
        const apiClient = provider.getApiClient();

        console.log('[Room] API provider type:', provider.getApiType());

        if (!apiClient) {
          throw new Error('API client not initialized');
        }

        // Check auth status if using Firebase
        if (apiClient.getProviderName() === 'Firebase' && apiClient.getCurrentUser) {
          const user = apiClient.getCurrentUser();
          console.log(
            '[Room] Current user:',
            user ? `${user.displayName} (${user.uid})` : 'Not signed in'
          );
        }

        // Initialize media (if not skipping)
        let stream = null;
        if (!skipMediaAccess) {
          try {
            console.log('[Room] Initializing media');
            mediaManager.current = new MediaManager();
            stream = await mediaManager.current.initialize({ video: true, audio: true });
            setLocalStream(stream);
            console.log('[Room] Media initialized, got stream:', stream ? 'yes' : 'no');

            // Get device lists
            console.log('[Room] Enumerating devices');
            const devices = await mediaManager.current.enumerateDevices();
            setAudioInputDevices(mediaManager.current.getAudioInputDevices());
            setVideoInputDevices(mediaManager.current.getVideoInputDevices());
            setAudioOutputDevices(mediaManager.current.getAudioOutputDevices());
            console.log(
              '[Room] Found devices:',
              'audio:',
              mediaManager.current.getAudioInputDevices().length,
              'video:',
              mediaManager.current.getVideoInputDevices().length
            );

            // Initialize WebRTC
            console.log('[Room] Initializing WebRTC');
            webrtcManager.current = new WebRTCManager();
            await webrtcManager.current.initialize(stream);
            console.log('[Room] WebRTC initialized');
          } catch (mediaError) {
            console.error('[Room] Media access error:', mediaError);
            // Store the error but don't throw it yet
            setMediaError(mediaError.message || 'Failed to access camera/microphone');
            // We'll let the useEffect handle this error
            throw mediaError;
          }
        } else {
          console.log('[Room] Skipping media initialization');
        }

        // Setup WebRTC callbacks if WebRTC is initialized
        if (webrtcManager.current && !skipMediaAccess) {
          webrtcManager.current.setOnTrack((stream, peerId) => {
            console.log('[Room] Received remote stream from peer:', peerId);
            setRemoteStreams((prev) => {
              const newStreams = new Map(prev);
              newStreams.set(peerId, stream);
              return newStreams;
            });
          });
        }

        // Initialize signaling
        console.log('[Room] Initializing signaling service');
        signalingService.current = new SignalingService(apiClient);

        // Join room
        console.log('[Room] Joining room:', roomId);
        const newUserId = await signalingService.current.joinRoom(roomId as string);
        setUserId(newUserId);
        console.log('[Room] Joined room with user ID:', newUserId);

        // Initialize chat manager if WebRTC is available
        if (!skipMediaAccess && webrtcManager.current) {
          console.log('[Room] Initializing chat manager');
          chatManager.current = new ChatManager(newUserId, webrtcManager.current);
          
          try {
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
            
            // If chat couldn't be initialized but we have WebRTC, log warning but continue
            if (!chatInitialized) {
              console.warn('[Room] Chat data channel could not be established, but continuing with room');
              // We'll still set ready to true so the timeout doesn't occur
              setChatReady(true);
            }
          } catch (error) {
            console.error('[Room] Error initializing chat:', error);
            // Still set chatReady to true so the timeout doesn't occur
            setChatReady(true);
          }
        } else {
          console.log('[Room] Skipping chat initialization (no WebRTC)');
          // Still set chatReady to true so the timeout doesn't occur
          setChatReady(true);
        }

        setConnected(true);

        // Setup signaling handlers
        console.log('[Room] Setting up signaling handlers');
        setupSignalingHandlers();
        console.log('[Room] Room initialization complete');
      } catch (error) {
        console.error('[Room] Error initializing room:', error);
        setError(`Failed to join the room: ${error.message || 'Unknown error'}`);
      } finally {
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
      // First check authentication
      const isAuthed = await checkAuth();
      if (!isAuthed) {
        // If not authenticated, don't proceed
        console.log('[Room] Authentication required');
        setError('Please sign in to join this room');
        setLoading(false);
        return;
      }

      // Then check media support
      const hasMediaSupport = await checkMediaSupport();
      console.log('[Room] Media support check result:', hasMediaSupport);

      if (!hasMediaSupport) {
        console.log('[Room] Proceeding without media support');
        setSkipMediaAccess(true);

        // Skip media initialization entirely
        try {
          console.log('[Room] Starting initialization without media');
          const provider = ApiProvider.getInstance();
          const apiClient = provider.getApiClient();

          if (!apiClient) {
            throw new Error('API client not initialized');
          }

          // Initialize signaling only
          console.log('[Room] Initializing signaling service');
          signalingService.current = new SignalingService(apiClient);

          // Join room without media
          console.log('[Room] Joining room without media:', roomId);
          const newUserId = await signalingService.current.joinRoom(roomId as string);
          setUserId(newUserId);
          console.log('[Room] Joined room with user ID:', newUserId);

          setConnected(true);
          setLoading(false);
        } catch (error) {
          console.error('[Room] Error in no-media initialization:', error);
          setError(`Failed to join room: ${error.message}`);
          setLoading(false);
        }
        return; // Skip the regular initialization
      }

      // Only try to initialize with media if we have support and permission
      await initializeRoom();
    };

    startInitialization();

    // Cleanup on unmount
    return () => {
      console.log('[Room] Component unmounting, performing cleanup');
      clearTimeout(timeoutId);
      
      // Use an immediately invoked async function to ensure cleanup completes
      (async () => {
        try {
          await cleanup();
        } catch (error) {
          console.error('[Room] Error during cleanup on unmount:', error);
        }
      })();
    };
  }, [roomId]);

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
    if (!chatManager.current) return;

    chatManager.current.sendMessage(content);
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

  // Cleanup resources
  const cleanup = async () => {
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
  };

  // Copy room ID to clipboard
  const copyRoomId = () => {
    Clipboard.setString(roomId as string);
    Alert.alert('Copied', 'Room ID copied to clipboard');
  };

  // Render copy icon
  const renderCopyIcon = (props?: IconProps) => <Icon {...props} name="copy-outline" />;

  // State for media error handling
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [skipMediaAccess, setSkipMediaAccess] = useState(false);

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
                } catch (err) {
                  console.error('[Room] Error in retry initialization:', err);
                  setError(`Failed to join room: ${err.message}`);
                  setLoading(false);
                }
              };

              initRoom();
            },
          },
        ]
      );
    }
  }, [mediaError]);

  if (loading) {
    return (
      <Layout style={styles.loadingContainer}>
        <Spinner size="large" />
        <Text style={styles.loadingText}>Joining room...</Text>
        <Text category="c1" appearance="hint" style={styles.loadingHint}>
          This may take a moment. If you're not prompted for camera/microphone access, your browser
          may have already blocked it or the prompt might be hidden.
        </Text>

        <Button
          style={styles.skipButton}
          appearance="outline"
          status="basic"
          onPress={() => {
            console.log('[Room] User manually skipped media access');
            setSkipMediaAccess(true);
            // Continue with initialization
            const provider = ApiProvider.getInstance();
            const apiClient = provider.getApiClient();

            if (!apiClient) {
              setError('API client not initialized');
              setLoading(false);
              return;
            }

            // Skip directly to room joining
            const initRoomWithoutMedia = async () => {
              try {
                console.log('[Room] Manually initializing room without media');

                // Initialize signaling
                signalingService.current = new SignalingService(apiClient);

                // Join room
                console.log('[Room] Joining room:', roomId);
                const newUserId = await signalingService.current.joinRoom(roomId as string);
                setUserId(newUserId);

                setConnected(true);
                setLoading(false);
              } catch (error) {
                console.error('[Room] Error in manual initialization:', error);
                setError(`Failed to join room: ${error.message}`);
                setLoading(false);
              }
            };

            initRoomWithoutMedia();
          }}
        >
          Skip Media Access
        </Button>
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
        <Text category="h6">Room: {roomId}</Text>
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
    marginBottom: 16,
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
