import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { MediaManager } from '../services/media';
import { createLogger } from '../services/logger';

export interface MediaDevice {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

interface UseMediaOptions {
  skipMediaAccess?: boolean;
  onMediaError?: (error: string) => void;
}

/**
 * Hook to manage media streams, devices, and controls
 */
export function useMedia(options: UseMediaOptions = {}) {
  const logger = createLogger('useMedia');
  const { skipMediaAccess: initialSkipMedia = false, onMediaError } = options;

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [skipMediaAccess, setSkipMediaAccess] = useState(initialSkipMedia);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Device lists
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDevice[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDevice[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDevice[]>([]);
  
  // Service reference
  const mediaManagerRef = useRef<MediaManager | null>(null);
  
  // Initialize media
  useEffect(() => {
    if (skipMediaAccess) {
      logger.info('Skipping media access as requested');
      return;
    }

    const initMedia = async () => {
      try {
        logger.info('Initializing camera and microphone');
        mediaManagerRef.current = new MediaManager();

        // Initialize media with a promise race to avoid hanging
        const mediaPromise = mediaManagerRef.current.initialize({ video: true, audio: true });

        // Create a media timeout promise
        const mediaTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Media initialization timed out after 20 seconds'));
          }, 20000);
        });

        // Race the media initialization against the timeout
        const stream = (await Promise.race([mediaPromise, mediaTimeoutPromise])) as MediaStream;

        // Set local stream as soon as camera is ready
        logger.info('Camera initialized, setting local stream');
        setLocalStream(stream);

        // Get device lists
        try {
          logger.info('Enumerating media devices');
          await mediaManagerRef.current.enumerateDevices();
          setAudioInputDevices(mediaManagerRef.current.getAudioInputDevices());
          setVideoInputDevices(mediaManagerRef.current.getVideoInputDevices());
          setAudioOutputDevices(mediaManagerRef.current.getAudioOutputDevices());
        } catch (error) {
          logger.error('Error enumerating devices (non-critical):', error);
          // Non-fatal, continue with initialization
        }
      } catch (error: unknown) {
        logger.error('Media access error:', error);
        // Format error message
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : 'Failed to access camera/microphone';

        setMediaError(errorMessage);
        
        if (onMediaError) {
          onMediaError(errorMessage);
        }
        
        setSkipMediaAccess(true);
      }
    };

    // Check if getUserMedia is supported
    const checkMediaSupport = async () => {
      try {
        logger.info('Checking media support...');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          logger.error('getUserMedia not supported');
          setSkipMediaAccess(true);
          return false;
        }

        logger.info('Media devices API is available');

        // Quick test of permissions
        try {
          logger.info('Requesting permission status...');
          if (navigator.permissions?.query) {
            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            logger.info('Camera permission status:', cameraPermission.state);

            const micPermission = await navigator.permissions.query({ name: 'microphone' });
            logger.info('Microphone permission status:', micPermission.state);

            // If both permissions are denied, skip media access
            if (cameraPermission.state === 'denied' && micPermission.state === 'denied') {
              logger.info('Both camera and microphone permissions are denied');
              setSkipMediaAccess(true);
              return false;
            }
          } else {
            logger.info('Permissions API not available');
          }
        } catch (permErr) {
          logger.info('Error checking permissions:', permErr);
          // Continue despite permission check error - we'll catch it later
        }

        return true;
      } catch (err) {
        logger.error('Error checking media support:', err);
        setSkipMediaAccess(true);
        return false;
      }
    };

    const setup = async () => {
      const hasMediaSupport = await checkMediaSupport();
      if (hasMediaSupport) {
        await initMedia();
      }
    };

    setup();

    // Cleanup on unmount
    return () => {
      if (mediaManagerRef.current && localStream) {
        logger.info('Stopping local stream');
        mediaManagerRef.current.stopLocalStream(localStream);
        setLocalStream(null);
      }

      // Stop screen sharing
      if (screenShareStream) {
        logger.info('Stopping screen share');
        screenShareStream.getTracks().forEach(track => track.stop());
        setScreenShareStream(null);
        setIsScreenSharing(false);
      }
    };
  }, [skipMediaAccess, logger, onMediaError]);

  // Handle toggle audio
  const toggleAudio = useCallback(() => {
    if (!mediaManagerRef.current) return false;

    const newState = mediaManagerRef.current.toggleAudio();
    setAudioEnabled(newState);
    return newState;
  }, []);

  // Handle toggle video
  const toggleVideo = useCallback(() => {
    if (!mediaManagerRef.current) return false;

    const newState = mediaManagerRef.current.toggleVideo();
    setVideoEnabled(newState);
    return newState;
  }, []);

  // Handle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (!mediaManagerRef.current) return false;

    if (isScreenSharing) {
      // Stop screen sharing
      setIsScreenSharing(false);
      setScreenShareStream(null);
      
      // Stop all tracks
      if (screenShareStream) {
        screenShareStream.getTracks().forEach(track => track.stop());
      }
      
      return false;
    } else {
      // Start screen sharing
      try {
        const stream = await mediaManagerRef.current.getScreenShareStream();
        if (stream) {
          setScreenShareStream(stream);
          setIsScreenSharing(true);
          return true;
        }
      } catch (error) {
        logger.error('Error sharing screen:', error);
        Alert.alert('Screen Sharing Failed', 'Failed to start screen sharing. Please try again.');
      }
      
      return false;
    }
  }, [isScreenSharing, screenShareStream, logger]);

  // Device selection
  const switchDevices = useCallback(async (
    audioDevice: string,
    videoDevice: string,
    audioOutputDevice: string
  ) => {
    if (!mediaManagerRef.current) return false;

    try {
      // Change audio input device
      if (audioDevice && audioDevice !== mediaManagerRef.current.getCurrentAudioDevice()) {
        await mediaManagerRef.current.switchAudioDevice(audioDevice);
      }

      // Change video input device
      if (videoDevice && videoDevice !== mediaManagerRef.current.getCurrentVideoDevice()) {
        await mediaManagerRef.current.switchVideoDevice(videoDevice);
      }

      // Change audio output device (if supported)
      if (
        audioOutputDevice &&
        audioOutputDevice !== mediaManagerRef.current.getCurrentAudioOutputDevice()
      ) {
        // Find all video elements to apply output device change
        const videoElements = document.querySelectorAll('video');
        for (const element of videoElements) {
          await mediaManagerRef.current.switchAudioOutputDevice(audioOutputDevice, element);
        }
      }

      // Update local stream reference
      if (mediaManagerRef.current) {
        setLocalStream(mediaManagerRef.current.getStream());
      }
      
      return true;
    } catch (error) {
      logger.error('Error switching devices:', error);
      return false;
    }
  }, [logger]);

  return {
    // Stream states
    localStream,
    screenShareStream,
    
    // Media controls
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    
    // Device management
    audioInputDevices,
    videoInputDevices,
    audioOutputDevices,
    switchDevices,
    
    // Access control
    skipMediaAccess,
    setSkipMediaAccess,
    mediaError,
    
    // Reference to the manager (for advanced use cases)
    mediaManager: mediaManagerRef.current,
  };
}