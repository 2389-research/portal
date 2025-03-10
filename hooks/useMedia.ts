import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { createLogger } from '../services/logger';
import { MediaManager } from '../services/media';

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
    // If media access is being skipped, don't even attempt to initialize
    if (skipMediaAccess) {
      logger.info('Skipping media access as requested');
      return;
    }

    // Prevent re-initialization if we already have a media manager or local stream
    if (mediaManagerRef.current && localStream) {
      logger.info('Media already initialized, skipping initialization');
      return;
    }

    const initMedia = async () => {
      try {
        logger.info('Initializing camera and microphone');

        // Only create a new MediaManager if one doesn't exist
        if (!mediaManagerRef.current) {
          logger.info('Creating new MediaManager instance');
          mediaManagerRef.current = new MediaManager();
        } else {
          logger.info('Reusing existing MediaManager instance');
        }

        // Use a reasonable timeout of 15 seconds
        const MEDIA_TIMEOUT_MS = 15000;

        // Initialize media with a promise race to avoid hanging
        const mediaPromise = mediaManagerRef.current.initialize({ video: true, audio: true });

        // Create a media timeout promise
        const mediaTimeoutPromise = new Promise<MediaStream>((_, reject) => {
          setTimeout(() => {
            logger.warn(`Media initialization timed out after ${MEDIA_TIMEOUT_MS / 1000} seconds`);
            reject(
              new Error(`Media initialization timed out after ${MEDIA_TIMEOUT_MS / 1000} seconds`)
            );
          }, MEDIA_TIMEOUT_MS);
        });

        // Race the media initialization against the timeout
        logger.info(`Waiting up to ${MEDIA_TIMEOUT_MS / 1000} seconds for media initialization...`);
        const stream = await Promise.race([mediaPromise, mediaTimeoutPromise]);

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

        // If we can't access media, set skip flag
        setSkipMediaAccess(true);
      }
    };

    // Check if getUserMedia is supported (only once)
    const checkMediaSupport = async () => {
      try {
        logger.info('Checking media support...');

        // Check if the API is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          logger.error('getUserMedia not supported in this browser');
          setSkipMediaAccess(true);

          if (onMediaError) {
            onMediaError('Camera and microphone access is not supported in this browser');
          }
          return false;
        }

        logger.info('Media devices API is available');

        // Check permissions using the Permissions API if available
        try {
          if (navigator.permissions?.query) {
            logger.info('Checking permissions API status...');
            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            const micPermission = await navigator.permissions.query({ name: 'microphone' });

            logger.info(
              `Permission status - Camera: ${cameraPermission.state}, Mic: ${micPermission.state}`
            );

            // If both permissions are denied, skip media access
            if (cameraPermission.state === 'denied' && micPermission.state === 'denied') {
              logger.warn('Both camera and microphone permissions are denied by the browser');
              setSkipMediaAccess(true);

              if (onMediaError) {
                onMediaError(
                  'Camera and microphone access was denied. Please check your browser permissions.'
                );
              }
              return false;
            }
          }
        } catch (permErr) {
          logger.info('Error checking permissions API:', permErr);
          // Continue despite permission check error
        }

        return true;
      } catch (err) {
        logger.error('Error checking media support:', err);
        setSkipMediaAccess(true);

        if (onMediaError) {
          onMediaError('An error occurred while checking media support');
        }
        return false;
      }
    };

    // Main initialization sequence
    const setup = async () => {
      // Only check media support and initialize once
      const setupKey = 'media-setup-attempted';
      if (window.sessionStorage.getItem(setupKey)) {
        logger.info('Media setup already attempted in this session, skipping checks');

        // If we don't have a stream already, directly try to initialize
        if (!localStream && !mediaManagerRef.current) {
          await initMedia();
        }
        return;
      }

      // Mark that we've attempted setup
      window.sessionStorage.setItem(setupKey, 'true');

      // Check support and initialize if supported
      const hasMediaSupport = await checkMediaSupport();
      if (hasMediaSupport) {
        await initMedia();
      }
    };

    // Start the setup process
    setup();

    // Cleanup on unmount or when effects are re-run
    return () => {
      // Only clean up the stream if we're unmounting completely
      // We don't want to stop streams due to re-renders
      if (mediaManagerRef.current && localStream && skipMediaAccess) {
        logger.info('Stopping local stream due to skipMediaAccess change');
        mediaManagerRef.current.stopLocalStream(localStream);
        setLocalStream(null);
      }

      // Always stop screen sharing on unmount
      if (screenShareStream) {
        logger.info('Stopping screen share');
        screenShareStream.getTracks().forEach((track) => track.stop());
        setScreenShareStream(null);
        setIsScreenSharing(false);
      }
    };
  }, [skipMediaAccess, logger, onMediaError, localStream]);

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
        screenShareStream.getTracks().forEach((track) => track.stop());
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
  const switchDevices = useCallback(
    async (audioDevice: string, videoDevice: string, audioOutputDevice: string) => {
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
    },
    [logger]
  );

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
