import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layout, Text } from '@ui-kitten/components';

// Import components and services
import { ApiProvider } from '../../../../../api';
import { MediaManager } from '../../../../../services/media';
import { WebRTCManager } from '../../../../../services/webrtc';
import { SignalingService } from '../../../../../services/signaling';
import { ChatManager, ChatMessage } from '../../../../../services/chat';
import { createLogger } from '../../../../../services/logger';

// Define interface for services that should be disposable
interface Disposable {
  dispose(): void;
}

// Extend service class types with dispose method
declare module '../../../../../services/media' {
  interface MediaManager {
    getLocalStream(audio: boolean, video: boolean): Promise<MediaStream>;
    stopLocalStream(): void;
  }
}

declare module '../../../../../services/signaling' {
  interface SignalingService {
    initialize(): Promise<void>;
    dispose(): void;
  }
}

declare module '../../../../../services/webrtc' {
  interface WebRTCManager {
    dispose(): void;
  }
}

declare module '../../../../../services/chat' {
  interface ChatManager extends Disposable {
    initialize(roomId: boolean | string): Promise<void>;
  }
}

export default function PrivateRoomScreen() {
  // Get URL parameters
  const { uuid, id: roomId, name: displayName } = useLocalSearchParams();
  const router = useRouter();
  const logger = createLogger('PrivateRoom');

  // State for managing room
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initPhase, setInitPhase] = useState<'auth' | 'media' | 'webrtc' | 'signaling' | 'chat' | 'complete'>('auth');

  // State for media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  // State for chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [latestMessage, setLatestMessage] = useState<ChatMessage | null>(null);
  const [showMessageTimeout, setShowMessageTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Service references
  const mediaManager = useRef<MediaManager | null>(null);
  const webrtcManager = useRef<WebRTCManager | null>(null);
  const signalingService = useRef<SignalingService | null>(null);
  const chatManager = useRef<ChatManager | null>(null);

  // Initialize all services and join room
  useEffect(() => {
    if (!roomId || !uuid || !displayName) {
      setError('Invalid parameters: UUID, room ID, and display name are required');
      setLoading(false);
      return;
    }

    logger.info(`Initializing private room with UUID: ${uuid}, roomId: ${roomId}, displayName: ${displayName}`);
    
    // Handle authentication first
    const authenticateUser = async () => {
      try {
        setInitPhase('auth');
        const provider = ApiProvider.getInstance();
        const apiClient = provider.getApiClient();

        if (!apiClient) {
          throw new Error('API client not initialized');
        }

        // Connect to the API
        await apiClient.connect();

        // Check if signInAnonymously method exists (Firebase only)
        if (apiClient.signInAnonymously) {
          // Sign in anonymously with the provided UUID and display name
          const userInfo = await apiClient.signInAnonymously(uuid as string, displayName as string);
          logger.info('Authenticated anonymously:', userInfo);
          setUserId(userInfo.uid);
          setIsAuthenticated(true);
          return true;
        } else {
          throw new Error('Anonymous authentication not supported by the API provider');
        }
      } catch (error) {
        logger.error('Authentication error:', error);
        setError(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
        return false;
      }
    };

    // Initialize media services
    const initializeMedia = async () => {
      try {
        setInitPhase('media');
        mediaManager.current = new MediaManager();
        await mediaManager.current.initialize();
        
        // Get local stream with both audio and video
        const stream = await mediaManager.current.getLocalStream(true, true);
        setLocalStream(stream);
        
        return true;
      } catch (error) {
        logger.error('Media initialization error:', error);
        // Continue without media in private rooms
        return true;
      }
    };

    // Initialize WebRTC manager
    const initializeWebRTC = async () => {
      try {
        setInitPhase('webrtc');
        if (!localStream) {
          logger.warn('No local stream available, skipping WebRTC initialization');
          return true;
        }
        
        webrtcManager.current = new WebRTCManager();
        await webrtcManager.current.initialize(localStream);
        
        return true;
      } catch (error) {
        logger.error('WebRTC initialization error:', error);
        // Continue without WebRTC in private rooms
        return true;
      }
    };

    // Initialize signaling service
    const initializeSignaling = async () => {
      try {
        setInitPhase('signaling');
        const provider = ApiProvider.getInstance();
        const apiClient = provider.getApiClient();
        
        if (!apiClient) {
          throw new Error('API client not initialized');
        }
        
        signalingService.current = new SignalingService(apiClient);
        await signalingService.current.initialize();
        
        // Join the room
        const result = await apiClient.joinRoom(roomId as string);
        logger.info('Joined room:', result);
        
        return true;
      } catch (error) {
        logger.error('Signaling initialization error:', error);
        setError(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
        return false;
      }
    };

    // Initialize chat manager
    const initializeChat = async () => {
      try {
        setInitPhase('chat');
        const provider = ApiProvider.getInstance();
        const apiClient = provider.getApiClient();
        
        if (!apiClient) {
          throw new Error('API client not initialized');
        }
        
        chatManager.current = new ChatManager(apiClient);
        await chatManager.current.initialize(roomId as string);
        
        // Set up chat message listener
        chatManager.current.onMessage((message) => {
          setChatMessages((prev) => [...prev, message]);
          setLatestMessage(message);
          
          // Clear previous timeout if it exists
          if (showMessageTimeout) {
            clearTimeout(showMessageTimeout);
          }
          
          // Set timeout to clear latest message after 10 seconds
          const timeout = setTimeout(() => {
            setLatestMessage(null);
          }, 10000);
          
          setShowMessageTimeout(timeout);
        });
        
        return true;
      } catch (error) {
        logger.error('Chat initialization error:', error);
        // Continue without chat in private rooms
        return true;
      }
    };

    // Execute initialization sequence
    const initializeRoom = async () => {
      // Authentication
      const authSuccess = await authenticateUser();
      if (!authSuccess) return;
      
      // Media
      await initializeMedia();
      
      // WebRTC
      await initializeWebRTC();
      
      // Signaling
      const signalingSuccess = await initializeSignaling();
      if (!signalingSuccess) return;
      
      // Chat
      await initializeChat();
      
      // Complete initialization
      setInitPhase('complete');
      setLoading(false);
      setConnected(true);
    };

    // Start initialization
    initializeRoom();

    // Cleanup function
    return () => {
      if (showMessageTimeout) {
        clearTimeout(showMessageTimeout);
      }
      
      // Leave room and disconnect services
      const cleanup = async () => {
        try {
          const provider = ApiProvider.getInstance();
          const apiClient = provider.getApiClient();
          
          if (apiClient && roomId && userId) {
            await apiClient.leaveRoom(roomId as string, userId);
          }
          
          if (chatManager.current) {
            chatManager.current.dispose();
          }
          
          if (signalingService.current) {
            signalingService.current.dispose();
          }
          
          if (webrtcManager.current) {
            webrtcManager.current.dispose();
          }
          
          if (mediaManager.current && localStream) {
            mediaManager.current.stopLocalStream();
          }
        } catch (error) {
          logger.error('Cleanup error:', error);
        }
      };
      
      cleanup();
    };
  }, [roomId, uuid, displayName, logger, showMessageTimeout, userId, localStream]);

  // Display loading screen
  if (loading) {
    return (
      <Layout style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>
          {initPhase === 'auth' ? 'Authenticating...' : 
           initPhase === 'media' ? 'Initializing camera and microphone...' :
           initPhase === 'webrtc' ? 'Setting up video connection...' :
           initPhase === 'signaling' ? 'Connecting to room...' :
           initPhase === 'chat' ? 'Setting up chat...' :
           initPhase === 'complete' ? 'Almost done...' : 'Loading...'}
        </Text>
      </Layout>
    );
  }

  // Display error screen
  if (error) {
    return (
      <Layout style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Text style={styles.errorSubText}>Please check your connection and try again</Text>
      </Layout>
    );
  }

  // Display room screen
  return (
    <Layout style={styles.container}>
      {/* Video container */}
      <View style={styles.videoContainer}>
        {localStream ? (
          <View style={styles.videoElement}>
            <Video stream={localStream} />
          </View>
        ) : (
          <View style={styles.noVideoContainer}>
            <Text style={styles.noVideoText}>No video available</Text>
          </View>
        )}
      </View>
      
      {/* Display name */}
      <View style={styles.nameContainer}>
        <Text style={styles.nameText}>{displayName}</Text>
      </View>
      
      {/* Chat message display (subtitle style) */}
      {latestMessage && (
        <View style={styles.chatContainer}>
          <Text style={styles.chatText}>
            <Text style={styles.chatSender}>{latestMessage.sender}: </Text>
            {latestMessage.message as string}
          </Text>
        </View>
      )}
    </Layout>
  );
}

// Simple video component
const Video = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 20,
    color: 'white',
    fontSize: 18,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorSubText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoElement: {
    width: '100%',
    height: '100%',
  },
  noVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  noVideoText: {
    color: 'white',
    fontSize: 18,
  },
  nameContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 5,
  },
  nameText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 15,
  },
  chatText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
  },
  chatSender: {
    fontWeight: 'bold',
  },
});