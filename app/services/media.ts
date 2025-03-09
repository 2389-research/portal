/**
 * Media Manager for Expo
 * Handles camera and microphone access
 */

interface MediaDevice {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

interface MediaOptions {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

export class MediaManager {
  private stream: MediaStream | null = null;
  private videoEnabled = true;
  private audioEnabled = true;
  private devices: MediaDevice[] = [];
  private currentVideoDevice: string | null = null;
  private currentAudioDevice: string | null = null;
  private currentAudioOutputDevice: string | null = null;

  /**
   * Initialize media devices
   */
  public async initialize(
    options: MediaOptions = { video: true, audio: true }
  ): Promise<MediaStream> {
    try {
      console.log('[Media] Requesting media access with options:', JSON.stringify(options));

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[Media] getUserMedia is not supported in this browser');
        throw new Error('Media devices not supported in this browser. Please try another browser.');
      }

      // Try to get user media with provided options
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(options);
        console.log('[Media] Access granted to media devices');
      } catch (mediaError: unknown) {
        console.error('[Media] Error accessing media devices:', mediaError);

        // Type guard for error objects
        const isErrorWithName = (err: unknown): err is { name: string } => 
          typeof err === 'object' && err !== null && 'name' in err;
          
        const isErrorWithMessage = (err: unknown): err is { message: string } => 
          typeof err === 'object' && err !== null && 'message' in err;

        // Try to be more specific about the error
        if (isErrorWithName(mediaError)) {
          if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
            throw new Error('Camera/microphone access denied. Please allow access and try again.');
          } else if (
            mediaError.name === 'NotFoundError' ||
            mediaError.name === 'DevicesNotFoundError'
          ) {
            throw new Error('No camera or microphone found. Please connect a device and try again.');
          } else if (
            mediaError.name === 'NotReadableError' ||
            mediaError.name === 'TrackStartError'
          ) {
            throw new Error(
              'Could not access camera/microphone. It may be in use by another application.'
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
      console.log('[Media] Updating device information');
      if (this.stream.getVideoTracks().length > 0) {
        const videoTrack = this.stream.getVideoTracks()[0];
        this.currentVideoDevice = videoTrack.getSettings().deviceId || null;
        console.log('[Media] Video track enabled:', videoTrack.enabled);
      } else {
        console.log('[Media] No video tracks available');
      }

      if (this.stream.getAudioTracks().length > 0) {
        const audioTrack = this.stream.getAudioTracks()[0];
        this.currentAudioDevice = audioTrack.getSettings().deviceId || null;
        console.log('[Media] Audio track enabled:', audioTrack.enabled);
      } else {
        console.log('[Media] No audio tracks available');
      }

      // Enumerate available devices
      await this.enumerateDevices();

      console.log('[Media] Media initialization complete');
      return this.stream;
    } catch (error: unknown) {
      console.error('[Media] Error in media initialization:', error);
      throw error;
    }
  }

  /**
   * Enumerate available media devices
   */
  public async enumerateDevices(): Promise<MediaDevice[]> {
    try {
      const deviceInfos = await navigator.mediaDevices.enumerateDevices();

      this.devices = deviceInfos
        .filter((device) => ['audioinput', 'videoinput', 'audiooutput'].includes(device.kind))
        .map((device) => ({
          deviceId: device.deviceId,
          kind: device.kind as 'audioinput' | 'videoinput' | 'audiooutput',
          label: device.label || `${device.kind} (${device.deviceId.substr(0, 8)}...)`,
        }));

      return this.devices;
    } catch (error: unknown) {
      console.error('Error enumerating devices:', error);
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
      console.error('Media stream not initialized');
      return false;
    }

    try {
      // Stop existing video tracks
      this.stream.getVideoTracks().forEach((track) => track.stop());

      // Get new video stream
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });

      // Add new video track to existing stream
      const newVideoTrack = newStream.getVideoTracks()[0];
      this.stream.addTrack(newVideoTrack);

      // Remove old video tracks
      const oldVideoTracks = this.stream.getVideoTracks();
      if (oldVideoTracks.length > 1) {
        for (let i = 0; i < oldVideoTracks.length - 1; i++) {
          this.stream.removeTrack(oldVideoTracks[i]);
        }
      }

      this.currentVideoDevice = deviceId;
      return true;
    } catch (error: unknown) {
      console.error('Error switching video device:', error);
      return false;
    }
  }

  /**
   * Switch to a different audio input device
   */
  public async switchAudioDevice(deviceId: string): Promise<boolean> {
    if (!this.stream) {
      console.error('Media stream not initialized');
      return false;
    }

    try {
      // Stop existing audio tracks
      this.stream.getAudioTracks().forEach((track) => track.stop());

      // Get new audio stream
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });

      // Add new audio track to existing stream
      const newAudioTrack = newStream.getAudioTracks()[0];
      this.stream.addTrack(newAudioTrack);

      // Remove old audio tracks
      const oldAudioTracks = this.stream.getAudioTracks();
      if (oldAudioTracks.length > 1) {
        for (let i = 0; i < oldAudioTracks.length - 1; i++) {
          this.stream.removeTrack(oldAudioTracks[i]);
        }
      }

      this.currentAudioDevice = deviceId;
      return true;
    } catch (error: unknown) {
      console.error('Error switching audio device:', error);
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
      // @ts-ignore: setSinkId may not be available in all browsers
      if (element.setSinkId) {
        // @ts-ignore
        await element.setSinkId(deviceId);
        this.currentAudioOutputDevice = deviceId;
        return true;
      } else {
        console.warn('setSinkId is not supported in this browser');
        return false;
      }
    } catch (error: unknown) {
      console.error('Error switching audio output device:', error);
      return false;
    }
  }

  /**
   * Toggle video track
   */
  public toggleVideo(): boolean {
    if (!this.stream) {
      console.error('Media stream not initialized');
      return false;
    }

    const videoTracks = this.stream.getVideoTracks();

    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });

    this.videoEnabled = videoTracks.length > 0 ? videoTracks[0].enabled : false;
    return this.videoEnabled;
  }

  /**
   * Toggle audio track
   */
  public toggleAudio(): boolean {
    if (!this.stream) {
      console.error('Media stream not initialized');
      return false;
    }

    const audioTracks = this.stream.getAudioTracks();

    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });

    this.audioEnabled = audioTracks.length > 0 ? audioTracks[0].enabled : false;
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
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.videoEnabled = false;
    this.audioEnabled = false;
  }

  /**
   * Stop a specific media stream
   * @param stream - The media stream to stop
   */
  public stopLocalStream(stream: MediaStream): void {
    if (!stream) {
      console.error('[Media] Cannot stop null stream');
      return;
    }

    console.log('[Media] Stopping specific media stream');
    stream.getTracks().forEach((track) => {
      console.log(`[Media] Stopping ${track.kind} track: ${track.label || 'unlabeled'}`);
      track.stop();
    });

    // If this is the current main stream, reset our state
    if (stream === this.stream) {
      this.stream = null;
      this.videoEnabled = false;
      this.audioEnabled = false;
    }
  }

  /**
   * Request screen sharing stream
   */
  public async getScreenShareStream(): Promise<MediaStream | null> {
    try {
      // @ts-ignore: TypeScript doesn't recognize getDisplayMedia on mediaDevices
      return await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (error: unknown) {
      console.error('Error getting screen share stream:', error);
      return null;
    }
  }
}
