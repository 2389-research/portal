/**
 * Media Manager for Expo
 * Handles camera and microphone access, device selection, and media tracks
 */
import { createLogger } from './logger';

// Create logger instance for MediaManager
const logger = createLogger('MediaManager');

export interface MediaDevice {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

export interface MediaOptions {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

// Define possible device change event types
export type DeviceChangeEvent = 'added' | 'removed' | 'changed';

export class MediaManager {
  private stream: MediaStream | null = null;
  private videoEnabled = true;
  private audioEnabled = true;
  private devices: MediaDevice[] = [];
  private currentVideoDevice: string | null = null;
  private currentAudioDevice: string | null = null;
  private currentAudioOutputDevice: string | null = null;
  private isInitialized = false;
  private deviceChangeListenerAdded = false;

  constructor() {
    logger.debug('MediaManager instance created');
  }

  /**
   * Initialize media devices with given options
   */
  public async initialize(
    options: MediaOptions = { video: true, audio: true }
  ): Promise<MediaStream> {
    // If we already have a stream, don't create another permission prompt
    if (this.stream) {
      logger.info('Stream already exists, reusing existing media stream');
      return this.stream;
    }

    // Default both audio and video if not specified
    const mergedOptions: MediaOptions = {
      video: options.video !== undefined ? options.video : true,
      audio: options.audio !== undefined ? options.audio : true,
    };

    try {
      logger.info('Initializing media devices with options:', mergedOptions);

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        logger.error('getUserMedia is not supported in this browser');
        throw new Error('Media devices not supported in this browser. Please try another browser.');
      }

      // Try to get user media with provided options - only make ONE request
      try {
        logger.debug('Requesting user media with constraints:', mergedOptions);

        // Make a single getUserMedia request
        this.stream = await navigator.mediaDevices.getUserMedia(
          mergedOptions as MediaStreamConstraints
        );
        logger.info('Access granted to media devices');
      } catch (mediaError: unknown) {
        logger.error('Error accessing media devices:', mediaError);

        // Type guard for error objects
        const isErrorWithName = (err: unknown): err is { name: string } =>
          typeof err === 'object' && err !== null && 'name' in err;

        const isErrorWithMessage = (err: unknown): err is { message: string } =>
          typeof err === 'object' && err !== null && 'message' in err;

        // Try to be more specific about the error
        if (isErrorWithName(mediaError)) {
          logger.debug('Error name:', mediaError.name);

          if (
            mediaError.name === 'NotAllowedError' ||
            mediaError.name === 'PermissionDeniedError'
          ) {
            throw new Error('Camera/microphone access denied. Please allow access and try again.');
          }
          if (mediaError.name === 'NotFoundError' || mediaError.name === 'DevicesNotFoundError') {
            throw new Error(
              'No camera or microphone found. Please connect a device and try again.'
            );
          }
          if (mediaError.name === 'NotReadableError' || mediaError.name === 'TrackStartError') {
            throw new Error(
              'Could not access camera/microphone. It may be in use by another application.'
            );
          }
          if (mediaError.name === 'OverconstrainedError') {
            throw new Error(
              'The requested media settings cannot be satisfied by the current device.'
            );
          }
        }

        // Default error message
        const errorMessage = isErrorWithMessage(mediaError)
          ? mediaError.message
          : isErrorWithName(mediaError)
            ? mediaError.name
            : 'Unknown error';

        throw new Error(`Media access error: ${errorMessage}`);
      }

      // Update current devices
      logger.debug('Updating device information from current stream');
      if (this.stream.getVideoTracks().length > 0) {
        const videoTrack = this.stream.getVideoTracks()[0];
        this.currentVideoDevice = videoTrack.getSettings().deviceId || null;
        this.videoEnabled = videoTrack.enabled;
        logger.debug('Video track detected:', {
          deviceId: this.currentVideoDevice,
          enabled: this.videoEnabled,
        });
      } else {
        logger.debug('No video tracks available in the stream');
      }

      if (this.stream.getAudioTracks().length > 0) {
        const audioTrack = this.stream.getAudioTracks()[0];
        this.currentAudioDevice = audioTrack.getSettings().deviceId || null;
        this.audioEnabled = audioTrack.enabled;
        logger.debug('Audio track detected:', {
          deviceId: this.currentAudioDevice,
          enabled: this.audioEnabled,
        });
      } else {
        logger.debug('No audio tracks available in the stream');
      }

      // Set up device change listener if not already added
      this.setupDeviceChangeListener();

      // Enumerate available devices
      await this.enumerateDevices();

      this.isInitialized = true;
      logger.info('Media initialization complete');
      return this.stream;
    } catch (error: unknown) {
      logger.error('Error in media initialization:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Setup device change listener to handle device changes
   */
  private setupDeviceChangeListener(): void {
    if (this.deviceChangeListenerAdded) {
      return;
    }

    if (navigator.mediaDevices && 'addEventListener' in navigator.mediaDevices) {
      logger.debug('Setting up device change listener');
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));
      this.deviceChangeListenerAdded = true;
    } else {
      logger.warn('Device change events not supported in this browser');
    }
  }

  /**
   * Handle device change events
   */
  private async handleDeviceChange(): Promise<void> {
    logger.info('Device change event detected');

    // Store previous device lists for comparison
    const previousDevices = [...this.devices];

    // Update devices list
    await this.enumerateDevices();

    // Compare to find changed devices
    this.detectDeviceChanges(previousDevices, this.devices);
  }

  /**
   * Detect which devices were added, removed, or changed
   */
  private detectDeviceChanges(previousDevices: MediaDevice[], currentDevices: MediaDevice[]): void {
    // Find removed devices
    const removedDevices = previousDevices.filter(
      (prev) => !currentDevices.some((curr) => curr.deviceId === prev.deviceId)
    );

    // Find added devices
    const addedDevices = currentDevices.filter(
      (curr) => !previousDevices.some((prev) => prev.deviceId === curr.deviceId)
    );

    // Log changes
    if (removedDevices.length > 0) {
      logger.info('Devices removed:', removedDevices);

      // Check if current devices were removed
      if (
        this.currentVideoDevice &&
        removedDevices.some((device) => device.deviceId === this.currentVideoDevice)
      ) {
        logger.warn('Current video device was disconnected');
      }

      if (
        this.currentAudioDevice &&
        removedDevices.some((device) => device.deviceId === this.currentAudioDevice)
      ) {
        logger.warn('Current audio device was disconnected');
      }

      if (
        this.currentAudioOutputDevice &&
        removedDevices.some((device) => device.deviceId === this.currentAudioOutputDevice)
      ) {
        logger.warn('Current audio output device was disconnected');
      }
    }

    if (addedDevices.length > 0) {
      logger.info('Devices added:', addedDevices);
    }
  }

  /**
   * Enumerate available media devices
   */
  public async enumerateDevices(): Promise<MediaDevice[]> {
    try {
      logger.debug('Enumerating media devices');
      const deviceInfos = await navigator.mediaDevices.enumerateDevices();

      this.devices = deviceInfos
        .filter((device) => ['audioinput', 'videoinput', 'audiooutput'].includes(device.kind))
        .map((device) => ({
          deviceId: device.deviceId,
          kind: device.kind as 'audioinput' | 'videoinput' | 'audiooutput',
          label: device.label || `${device.kind} (${device.deviceId.substr(0, 8)}...)`,
        }));

      logger.debug('Enumerated devices:', {
        audioInputs: this.devices.filter((d) => d.kind === 'audioinput').length,
        videoInputs: this.devices.filter((d) => d.kind === 'videoinput').length,
        audioOutputs: this.devices.filter((d) => d.kind === 'audiooutput').length,
      });

      return this.devices;
    } catch (error: unknown) {
      logger.error('Error enumerating devices:', error);
      return [];
    }
  }

  /**
   * Get available video input devices
   */
  public getVideoInputDevices(): MediaDevice[] {
    return this.devices.filter((device) => device.kind === 'videoinput');
  }

  /**
   * Get available audio input devices
   */
  public getAudioInputDevices(): MediaDevice[] {
    return this.devices.filter((device) => device.kind === 'audioinput');
  }

  /**
   * Get available audio output devices
   */
  public getAudioOutputDevices(): MediaDevice[] {
    return this.devices.filter((device) => device.kind === 'audiooutput');
  }

  /**
   * Switch to a different video device
   */
  public async switchVideoDevice(deviceId: string): Promise<boolean> {
    if (!this.stream) {
      logger.error('Cannot switch video device: Media stream not initialized');
      return false;
    }

    try {
      logger.info(`Switching video device to ${deviceId}`);

      // Stop existing video tracks
      const oldVideoTracks = this.stream.getVideoTracks();
      logger.debug(`Stopping ${oldVideoTracks.length} existing video tracks`);

      oldVideoTracks.forEach((track) => {
        logger.debug(`Stopping video track: ${track.label || 'unlabeled'}`);
        track.stop();
      });

      // Get new video stream
      logger.debug('Requesting new video stream with device:', deviceId);
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });

      // Add new video track to existing stream
      const newVideoTrack = newStream.getVideoTracks()[0];
      logger.debug(`Adding new video track: ${newVideoTrack.label || 'unlabeled'}`);

      // Set enabled state to match current state
      newVideoTrack.enabled = this.videoEnabled;

      this.stream.addTrack(newVideoTrack);

      // Remove old video tracks (except the one we just added)
      const currentVideoTracks = this.stream.getVideoTracks();
      if (currentVideoTracks.length > 1) {
        logger.debug(`Removing ${currentVideoTracks.length - 1} redundant video tracks`);
        for (let i = 0; i < currentVideoTracks.length - 1; i++) {
          this.stream.removeTrack(currentVideoTracks[i]);
        }
      }

      this.currentVideoDevice = deviceId;
      logger.info('Video device switched successfully');
      return true;
    } catch (error: unknown) {
      logger.error('Error switching video device:', error);
      return false;
    }
  }

  /**
   * Switch to a different audio input device
   */
  public async switchAudioDevice(deviceId: string): Promise<boolean> {
    if (!this.stream) {
      logger.error('Cannot switch audio device: Media stream not initialized');
      return false;
    }

    try {
      logger.info(`Switching audio device to ${deviceId}`);

      // Stop existing audio tracks
      const oldAudioTracks = this.stream.getAudioTracks();
      logger.debug(`Stopping ${oldAudioTracks.length} existing audio tracks`);

      oldAudioTracks.forEach((track) => {
        logger.debug(`Stopping audio track: ${track.label || 'unlabeled'}`);
        track.stop();
      });

      // Get new audio stream
      logger.debug('Requesting new audio stream with device:', deviceId);
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });

      // Add new audio track to existing stream
      const newAudioTrack = newStream.getAudioTracks()[0];
      logger.debug(`Adding new audio track: ${newAudioTrack.label || 'unlabeled'}`);

      // Set enabled state to match current state
      newAudioTrack.enabled = this.audioEnabled;

      this.stream.addTrack(newAudioTrack);

      // Remove old audio tracks (except the one we just added)
      const currentAudioTracks = this.stream.getAudioTracks();
      if (currentAudioTracks.length > 1) {
        logger.debug(`Removing ${currentAudioTracks.length - 1} redundant audio tracks`);
        for (let i = 0; i < currentAudioTracks.length - 1; i++) {
          this.stream.removeTrack(currentAudioTracks[i]);
        }
      }

      this.currentAudioDevice = deviceId;
      logger.info('Audio device switched successfully');
      return true;
    } catch (error: unknown) {
      logger.error('Error switching audio device:', error);
      return false;
    }
  }

  /**
   * Switch to a different audio output device
   * Note: This requires the setSinkId API which is not available on all browsers
   */
  public async switchAudioOutputDevice(
    deviceId: string,
    element: HTMLMediaElement
  ): Promise<boolean> {
    try {
      logger.info(`Switching audio output device to ${deviceId}`);

      // Check if setSinkId is supported
      if (element.setSinkId) {
        logger.debug('setSinkId is supported, setting output device');
        try {
          await element.setSinkId(deviceId);
          this.currentAudioOutputDevice = deviceId;
          logger.info('Audio output device switched successfully');
          return true;
        } catch (setSinkError) {
          logger.error('Error setting audio output device:', setSinkError);
          return false;
        }
      } else {
        logger.warn('setSinkId is not supported in this browser');
        return false;
      }
    } catch (error: unknown) {
      logger.error('Error switching audio output device:', error);
      return false;
    }
  }

  /**
   * Check if setSinkId is supported by the browser
   */
  public isSinkIdSupported(element: HTMLMediaElement): boolean {
    return typeof element.setSinkId === 'function';
  }

  /**
   * Toggle video track
   */
  public toggleVideo(): boolean {
    if (!this.stream) {
      logger.error('Cannot toggle video: Media stream not initialized');
      return false;
    }

    const videoTracks = this.stream.getVideoTracks();
    logger.debug(`Toggling ${videoTracks.length} video tracks`);

    if (videoTracks.length === 0) {
      logger.warn('No video tracks to toggle');
      return false;
    }

    // Toggle enabled state for all video tracks
    const newState = !videoTracks[0].enabled;
    videoTracks.forEach((track) => {
      track.enabled = newState;
      logger.debug(`Set video track ${track.label || track.id} enabled=${newState}`);
    });

    this.videoEnabled = newState;
    logger.info(`Video ${newState ? 'enabled' : 'disabled'}`);
    return this.videoEnabled;
  }

  /**
   * Toggle audio track
   */
  public toggleAudio(): boolean {
    if (!this.stream) {
      logger.error('Cannot toggle audio: Media stream not initialized');
      return false;
    }

    const audioTracks = this.stream.getAudioTracks();
    logger.debug(`Toggling ${audioTracks.length} audio tracks`);

    if (audioTracks.length === 0) {
      logger.warn('No audio tracks to toggle');
      return false;
    }

    // Toggle enabled state for all audio tracks
    const newState = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = newState;
      logger.debug(`Set audio track ${track.label || track.id} enabled=${newState}`);
    });

    this.audioEnabled = newState;
    logger.info(`Audio ${newState ? 'enabled' : 'disabled'}`);
    return this.audioEnabled;
  }

  /**
   * Check if video is enabled
   */
  public isVideoEnabled(): boolean {
    return this.videoEnabled;
  }

  /**
   * Check if audio is enabled
   */
  public isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  /**
   * Check if media is initialized
   */
  public isMediaInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current media stream
   */
  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Get current devices
   */
  public getCurrentVideoDevice(): string | null {
    return this.currentVideoDevice;
  }

  public getCurrentAudioDevice(): string | null {
    return this.currentAudioDevice;
  }

  public getCurrentAudioOutputDevice(): string | null {
    return this.currentAudioOutputDevice;
  }

  /**
   * Stop all media tracks and clean up
   */
  public stop(): void {
    logger.info('Stopping all media tracks');

    if (this.stream) {
      const tracks = this.stream.getTracks();
      logger.debug(`Stopping ${tracks.length} media tracks`);

      tracks.forEach((track) => {
        logger.debug(`Stopping ${track.kind} track: ${track.label || 'unlabeled'}`);
        track.stop();
      });

      this.stream = null;
    } else {
      logger.debug('No stream to stop');
    }

    this.videoEnabled = false;
    this.audioEnabled = false;
    this.isInitialized = false;
    logger.info('Media stopped and resources cleaned up');
  }

  /**
   * Stop a specific media stream
   * @param stream - The media stream to stop
   */
  public stopLocalStream(stream: MediaStream): void {
    if (!stream) {
      logger.error('Cannot stop null stream');
      return;
    }

    logger.info('Stopping specific media stream');
    const tracks = stream.getTracks();
    logger.debug(`Stopping ${tracks.length} tracks from specific stream`);

    tracks.forEach((track) => {
      logger.debug(`Stopping ${track.kind} track: ${track.label || 'unlabeled'}`);
      track.stop();
    });

    // If this is the current main stream, reset our state
    if (stream === this.stream) {
      logger.debug('Stopped stream was the main stream, resetting state');
      this.stream = null;
      this.videoEnabled = false;
      this.audioEnabled = false;
      this.isInitialized = false;
    }
  }

  /**
   * Request screen sharing stream
   */
  public async getScreenShareStream(): Promise<MediaStream | null> {
    try {
      logger.info('Requesting screen sharing');

      // Check if getDisplayMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        logger.error('getDisplayMedia is not supported in this browser');
        return null;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

      logger.info('Screen sharing access granted');
      logger.debug('Screen share stream details:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Add ended event listener to detect when user stops sharing
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          logger.info('Screen sharing ended by user or system');
        });
      });

      return stream;
    } catch (error: unknown) {
      // Type guard for error objects
      const isErrorWithName = (err: unknown): err is { name: string } =>
        typeof err === 'object' && err !== null && 'name' in err;

      if (isErrorWithName(error) && error.name === 'NotAllowedError') {
        logger.warn('Screen sharing permission denied by user');
      } else {
        logger.error('Error getting screen share stream:', error);
      }

      return null;
    }
  }

  /**
   * Check if the browser supports getDisplayMedia for screen sharing
   */
  public isScreenShareSupported(): boolean {
    return !!navigator.mediaDevices?.getDisplayMedia;
  }
}
