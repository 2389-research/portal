// We'll use the logger inside MediaManager for logging
import { MediaManager } from '../../services/media';

// Mock document object for HTMLMediaElement tests
class MockHTMLMediaElement {
  setSinkId?: jest.Mock = jest.fn().mockResolvedValue(undefined);
}

describe('MediaManager', () => {
  let mediaManager: MediaManager;

  // Mock for MediaDeviceInfo
  const createMockMediaDeviceInfo = (
    deviceId: string,
    kind: 'audioinput' | 'videoinput' | 'audiooutput',
    label: string
  ): MediaDeviceInfo => ({
    deviceId,
    kind,
    label,
    groupId: `group-${deviceId}`,
    toJSON: () => ({
      deviceId,
      kind,
      label,
      groupId: `group-${deviceId}`,
    }),
  });

  // Helper to create a mock MediaTrack
  const createMockMediaTrack = (kind: 'audio' | 'video', deviceId: string, label: string) => {
    const track = {
      kind,
      enabled: true,
      label,
      readyState: 'live',
      id: `track-${deviceId}`,
      stop: jest.fn(),
      getSettings: jest.fn().mockReturnValue({ deviceId }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      onended: null,
    };
    return track;
  };

  // Create a complete mock for MediaStream
  const createMockMediaStream = (audioDeviceId?: string, videoDeviceId?: string) => {
    const audioTracks = audioDeviceId
      ? [createMockMediaTrack('audio', audioDeviceId, `Audio ${audioDeviceId}`)]
      : [];

    const videoTracks = videoDeviceId
      ? [createMockMediaTrack('video', videoDeviceId, `Video ${videoDeviceId}`)]
      : [];

    const allTracks = [...audioTracks, ...videoTracks];

    return {
      id: 'mock-stream-id',
      active: true,
      getTracks: jest.fn().mockReturnValue(allTracks),
      getAudioTracks: jest.fn().mockReturnValue(audioTracks),
      getVideoTracks: jest.fn().mockReturnValue(videoTracks),
      addTrack: jest.fn((track) => {
        if (track.kind === 'audio') {
          audioTracks.push(track);
        } else if (track.kind === 'video') {
          videoTracks.push(track);
        }
        allTracks.push(track);
      }),
      removeTrack: jest.fn((track) => {
        const trackIndex = allTracks.indexOf(track);
        if (trackIndex !== -1) {
          allTracks.splice(trackIndex, 1);
        }
        if (track.kind === 'audio') {
          const audioIndex = audioTracks.indexOf(track);
          if (audioIndex !== -1) {
            audioTracks.splice(audioIndex, 1);
          }
        } else if (track.kind === 'video') {
          const videoIndex = videoTracks.indexOf(track);
          if (videoIndex !== -1) {
            videoTracks.splice(videoIndex, 1);
          }
        }
      }),
      clone: jest.fn().mockReturnThis(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  };

  // Default devices for tests
  const defaultDevices = [
    createMockMediaDeviceInfo('audio1', 'audioinput', 'Audio 1'),
    createMockMediaDeviceInfo('audio2', 'audioinput', 'Audio 2'),
    createMockMediaDeviceInfo('video1', 'videoinput', 'Video 1'),
    createMockMediaDeviceInfo('video2', 'videoinput', 'Video 2'),
    createMockMediaDeviceInfo('output1', 'audiooutput', 'Output 1'),
    createMockMediaDeviceInfo('output2', 'audiooutput', 'Output 2'),
  ];

  // Mock navigator.mediaDevices
  const mockMediaDevices = {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn().mockResolvedValue(defaultDevices),
    getDisplayMedia: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  } as {
    getUserMedia: jest.Mock;
    enumerateDevices: jest.Mock;
    getDisplayMedia?: jest.Mock;
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
    dispatchEvent: jest.Mock;
  };

  // We'll directly call the handleDeviceChange method in tests

  // Helper to validate MediaManager state
  const validateManagerState = (
    manager: MediaManager,
    expectations: {
      hasStream?: boolean;
      videoEnabled?: boolean;
      audioEnabled?: boolean;
      hasVideoDevice?: boolean;
      hasAudioDevice?: boolean;
      hasAudioOutputDevice?: boolean;
    }
  ) => {
    const stream = manager.getStream();

    if (expectations.hasStream !== undefined) {
      if (expectations.hasStream) {
        expect(stream).not.toBeNull();
      } else {
        expect(stream).toBeNull();
      }
    }

    if (expectations.videoEnabled !== undefined) {
      expect(manager.isVideoEnabled()).toBe(expectations.videoEnabled);
    }

    if (expectations.audioEnabled !== undefined) {
      expect(manager.isAudioEnabled()).toBe(expectations.audioEnabled);
    }

    if (expectations.hasVideoDevice !== undefined) {
      const videoDevice = manager.getCurrentVideoDevice();
      if (expectations.hasVideoDevice) {
        expect(videoDevice).not.toBeNull();
      } else {
        expect(videoDevice).toBeNull();
      }
    }

    if (expectations.hasAudioDevice !== undefined) {
      const audioDevice = manager.getCurrentAudioDevice();
      if (expectations.hasAudioDevice) {
        expect(audioDevice).not.toBeNull();
      } else {
        expect(audioDevice).toBeNull();
      }
    }

    if (expectations.hasAudioOutputDevice !== undefined) {
      const audioOutputDevice = manager.getCurrentAudioOutputDevice();
      if (expectations.hasAudioOutputDevice) {
        expect(audioOutputDevice).not.toBeNull();
      } else {
        expect(audioOutputDevice).toBeNull();
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockMediaDevices.getUserMedia.mockReset();
    mockMediaDevices.enumerateDevices.mockReset();
    if (mockMediaDevices.getDisplayMedia) {
      mockMediaDevices.getDisplayMedia.mockReset();
    }

    // Default mock implementations
    const defaultStream = createMockMediaStream('audio1', 'video1');
    mockMediaDevices.getUserMedia.mockResolvedValue(defaultStream);
    mockMediaDevices.enumerateDevices.mockResolvedValue(defaultDevices);
    if (mockMediaDevices.getDisplayMedia) {
      mockMediaDevices.getDisplayMedia.mockResolvedValue(
        createMockMediaStream(undefined, 'screen1')
      );
    }

    // Ensure navigator exists in the global object with proper interface
    if (!global.navigator) {
      // Create a navigator mock that implements the Navigator interface
      const navigatorMock = {
        // Add minimum required properties from Navigator interface
        credentials: {},
        doNotTrack: '',
        geolocation: {},
        maxTouchPoints: 0,
        mediaDevices: mockMediaDevices,
        onLine: true,
        serviceWorker: {},
        cookieEnabled: false,
        language: 'en-US',
        languages: ['en-US'],
        userAgent: 'jest',
        vendor: 'jest',
        vendorSub: '',
        productSub: '',
        platform: 'test',
        webdriver: false,
        hardwareConcurrency: 4,
        appCodeName: '',
        appName: '',
        appVersion: '',
        product: '',
        userAgentData: undefined,
        // Add clipboard property with mock functions
        clipboard: { readText: jest.fn(), writeText: jest.fn() },
        // Add any other required navigator methods
        sendBeacon: jest.fn(),
        vibrate: jest.fn(),
        javaEnabled: jest.fn().mockReturnValue(false),
      };

      // Use double casting to avoid TypeScript complaints
      global.navigator = navigatorMock as unknown as Navigator;
    } else {
      // Assign mock to navigator.mediaDevices using Object.defineProperty
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    }

    mediaManager = new MediaManager();
  });

  //-------------------------------------------------------------------------
  // 1. Basic Functionality Tests
  //-------------------------------------------------------------------------

  describe('Basic Functionality', () => {
    test('should initialize with media stream', async () => {
      const stream = await mediaManager.initialize({ audio: true, video: true });

      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
      expect(stream).toBeDefined();
      expect(stream.getAudioTracks().length).toBeGreaterThan(0);
      expect(stream.getVideoTracks().length).toBeGreaterThan(0);

      validateManagerState(mediaManager, {
        hasStream: true,
        videoEnabled: true,
        audioEnabled: true,
        hasVideoDevice: true,
        hasAudioDevice: true,
      });
    });

    test('should toggle audio', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      const mockAudioTrack = mediaManager.getStream()?.getAudioTracks()[0];
      expect(mockAudioTrack).toBeDefined();
      if (mockAudioTrack) {
        mockAudioTrack.enabled = true;

        // Toggle audio off
        const result1 = mediaManager.toggleAudio();
        expect(result1).toBe(false);
        expect(mockAudioTrack.enabled).toBe(false);
        expect(mediaManager.isAudioEnabled()).toBe(false);

        // Toggle audio on
        const result2 = mediaManager.toggleAudio();
        expect(result2).toBe(true);
        expect(mockAudioTrack.enabled).toBe(true);
        expect(mediaManager.isAudioEnabled()).toBe(true);
      }
    });

    test('should toggle video', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      const mockVideoTrack = mediaManager.getStream()?.getVideoTracks()[0];
      expect(mockVideoTrack).toBeDefined();
      if (mockVideoTrack) {
        mockVideoTrack.enabled = true;

        // Toggle video off
        const result1 = mediaManager.toggleVideo();
        expect(result1).toBe(false);
        expect(mockVideoTrack.enabled).toBe(false);
        expect(mediaManager.isVideoEnabled()).toBe(false);

        // Toggle video on
        const result2 = mediaManager.toggleVideo();
        expect(result2).toBe(true);
        expect(mockVideoTrack.enabled).toBe(true);
        expect(mediaManager.isVideoEnabled()).toBe(true);
      }
    });

    test('should enumerate devices', async () => {
      await mediaManager.initialize({ audio: true, video: true });
      await mediaManager.enumerateDevices();

      expect(mockMediaDevices.enumerateDevices).toHaveBeenCalled();

      const audioDevices = mediaManager.getAudioInputDevices();
      expect(audioDevices.length).toBe(2);
      expect(audioDevices[0].deviceId).toBe('audio1');

      const videoDevices = mediaManager.getVideoInputDevices();
      expect(videoDevices.length).toBe(2);
      expect(videoDevices[0].deviceId).toBe('video1');

      const outputDevices = mediaManager.getAudioOutputDevices();
      expect(outputDevices.length).toBe(2);
      expect(outputDevices[0].deviceId).toBe('output1');
    });

    test('should stop all tracks', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      const stream = mediaManager.getStream();
      expect(stream).not.toBeNull();

      if (stream) {
        const tracks = stream.getTracks();
        expect(tracks.length).toBeGreaterThan(0);

        mediaManager.stop();

        for (const track of tracks) {
          expect(track.stop).toHaveBeenCalled();
        }

        validateManagerState(mediaManager, {
          hasStream: false,
          videoEnabled: false,
          audioEnabled: false,
        });
      }
    });

    test('should stop a specific stream', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Create a mock stream for testing the stopLocalStream method
      const specificMockStream = createMockMediaStream('audio-test', 'video-test');

      // Call the method
      mediaManager.stopLocalStream(specificMockStream as unknown as MediaStream);

      // Verify tracks were stopped
      const specificTracks = specificMockStream.getTracks();
      for (const track of specificTracks) {
        expect(track.stop).toHaveBeenCalled();
      }

      // Ensure main stream was not affected
      expect(mediaManager.getStream()).not.toBeNull();
    });
  });

  //-------------------------------------------------------------------------
  // 2. Device Selection Tests
  //-------------------------------------------------------------------------

  describe('Device Selection', () => {
    test('should handle device enumeration errors', async () => {
      const enumerationError = new Error('Permission denied');
      mockMediaDevices.enumerateDevices.mockRejectedValue(enumerationError);

      const devices = await mediaManager.enumerateDevices();

      expect(devices).toEqual([]);
      expect(mockMediaDevices.enumerateDevices).toHaveBeenCalled();
    });

    test('should switch video device successfully', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Set up new stream for device switch
      const newVideoStream = createMockMediaStream(undefined, 'video2');
      mockMediaDevices.getUserMedia.mockResolvedValue(newVideoStream);

      const result = await mediaManager.switchVideoDevice('video2');

      expect(result).toBe(true);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: 'video2' } },
      });
      expect(mediaManager.getCurrentVideoDevice()).toBe('video2');
    });

    test('should handle video device switch failure', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Mock a failure for the device switch
      const switchError = new Error('Device not found');
      mockMediaDevices.getUserMedia.mockRejectedValue(switchError);

      const result = await mediaManager.switchVideoDevice('invalid-device');

      expect(result).toBe(false);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: 'invalid-device' } },
      });
      expect(mediaManager.getCurrentVideoDevice()).not.toBe('invalid-device');
    });

    test('should switch audio device successfully', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Set up new stream for device switch
      const newAudioStream = createMockMediaStream('audio2', undefined);
      mockMediaDevices.getUserMedia.mockResolvedValue(newAudioStream);

      const result = await mediaManager.switchAudioDevice('audio2');

      expect(result).toBe(true);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: 'audio2' } },
      });
      expect(mediaManager.getCurrentAudioDevice()).toBe('audio2');
    });

    test('should handle audio device switch failure', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Mock a failure for the device switch
      const switchError = new Error('Device not found');
      mockMediaDevices.getUserMedia.mockRejectedValue(switchError);

      const result = await mediaManager.switchAudioDevice('invalid-device');

      expect(result).toBe(false);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: 'invalid-device' } },
      });
      expect(mediaManager.getCurrentAudioDevice()).not.toBe('invalid-device');
    });

    test('should handle constraints validation', async () => {
      // Test with complex constraints
      const complexConstraints = {
        audio: {
          deviceId: { exact: 'audio1' },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
        },
        video: {
          deviceId: { exact: 'video1' },
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 },
          frameRate: { ideal: 30 },
        },
      };

      await mediaManager.initialize(complexConstraints);

      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith(complexConstraints);
      validateManagerState(mediaManager, {
        hasStream: true,
        videoEnabled: true,
        audioEnabled: true,
        hasVideoDevice: true,
        hasAudioDevice: true,
      });
    });
  });

  //-------------------------------------------------------------------------
  // 3. Stream Management Tests
  //-------------------------------------------------------------------------

  describe('Stream Management', () => {
    test('should maintain track state across operations', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Initially both tracks should be enabled
      expect(mediaManager.isAudioEnabled()).toBe(true);
      expect(mediaManager.isVideoEnabled()).toBe(true);

      // Disable video
      mediaManager.toggleVideo();
      expect(mediaManager.isVideoEnabled()).toBe(false);

      // Switch audio device while maintaining disabled video state
      const newStream = createMockMediaStream('audio2', 'video1');
      mockMediaDevices.getUserMedia.mockResolvedValue(newStream);

      await mediaManager.switchAudioDevice('audio2');

      // Video should still be disabled after device switch
      expect(mediaManager.isVideoEnabled()).toBe(false);
      expect(mediaManager.isAudioEnabled()).toBe(true);
    });

    test('should handle multiple tracks of the same type', async () => {
      // Create a stream with multiple audio/video tracks
      const multiTrackStream = createMockMediaStream('audio1', 'video1');

      // Add extra tracks manually
      const extraAudioTrack = createMockMediaTrack('audio', 'audio-extra', 'Extra Audio');
      const extraVideoTrack = createMockMediaTrack('video', 'video-extra', 'Extra Video');

      multiTrackStream.addTrack(extraAudioTrack);
      multiTrackStream.addTrack(extraVideoTrack);

      mockMediaDevices.getUserMedia.mockResolvedValue(multiTrackStream);

      await mediaManager.initialize({ audio: true, video: true });

      // Toggle functionality should affect all tracks
      mediaManager.toggleVideo();

      const videoTracks = mediaManager.getStream()?.getVideoTracks() || [];
      expect(videoTracks.length).toBeGreaterThan(1);

      // All video tracks should be disabled
      for (const track of videoTracks) {
        expect(track.enabled).toBe(false);
      }
    });

    test('should properly clean up streams during device switches', async () => {
      // Create a mock stream with tracks that can be properly tracked
      const videoTrack1 = createMockMediaTrack('video', 'video1', 'Video 1');
      const audioTrack1 = createMockMediaTrack('audio', 'audio1', 'Audio 1');

      // Create a mock implementation for the initial getUserMedia call
      mockMediaDevices.getUserMedia.mockImplementationOnce(() => {
        return Promise.resolve({
          id: 'initial-stream',
          active: true,
          getTracks: () => [videoTrack1, audioTrack1],
          getVideoTracks: () => [videoTrack1],
          getAudioTracks: () => [audioTrack1],
          addTrack: jest.fn(),
          removeTrack: jest.fn(),
          clone: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        });
      });

      // For the second call, create a new video stream
      const videoTrack2 = createMockMediaTrack('video', 'video2', 'Video 2');
      mockMediaDevices.getUserMedia.mockImplementationOnce(() => {
        return Promise.resolve({
          id: 'new-video-stream',
          active: true,
          getTracks: () => [videoTrack2],
          getVideoTracks: () => [videoTrack2],
          getAudioTracks: () => [],
          addTrack: jest.fn(),
          removeTrack: jest.fn(),
          clone: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        });
      });

      // Initialize with the first stream
      await mediaManager.initialize({ audio: true, video: true });

      // Switch the video device
      await mediaManager.switchVideoDevice('video2');

      // Check that the stop method was called on the original video track
      expect(videoTrack1.stop).toHaveBeenCalled();

      // The audio track should not have been stopped
      expect(audioTrack1.stop).not.toHaveBeenCalled();
    });
  });

  //-------------------------------------------------------------------------
  // 4. Audio Output Tests
  //-------------------------------------------------------------------------

  describe('Audio Output', () => {
    let mockAudioElement: MockHTMLMediaElement;

    beforeEach(() => {
      mockAudioElement = new MockHTMLMediaElement();
    });

    test('should detect setSinkId support', async () => {
      await mediaManager.initialize({ audio: true });

      // Test with supported browser (mock has setSinkId)
      const result1 = await mediaManager.switchAudioOutputDevice(
        'output1',
        mockAudioElement as unknown as HTMLMediaElement
      );
      expect(result1).toBe(true);
      expect(mockAudioElement.setSinkId?.mock.calls[0][0]).toBe('output1');

      // Test with unsupported browser (remove setSinkId)
-      delete mockAudioElement.setSinkId;
+      mockAudioElement.setSinkId = undefined;
      const result2 = await mediaManager.switchAudioOutputDevice(
        'output1',
        mockAudioElement as unknown as HTMLMediaElement
      );
      expect(result2).toBe(false);
    });

    test('should switch audio output device successfully', async () => {
      await mediaManager.initialize({ audio: true });

      const result = await mediaManager.switchAudioOutputDevice(
        'output2',
        mockAudioElement as unknown as HTMLMediaElement
      );

      expect(result).toBe(true);
      expect(mockAudioElement.setSinkId?.mock.calls[0][0]).toBe('output2');
    });

    test('should handle audio output device switch failure', async () => {
      await mediaManager.initialize({ audio: true });

      // Mock failure in setSinkId
      if (mockAudioElement.setSinkId) {
        mockAudioElement.setSinkId.mockRejectedValue(
          new Error('Cannot switch to specified device')
        );
      }

      const result = await mediaManager.switchAudioOutputDevice(
        'output2',
        mockAudioElement as unknown as HTMLMediaElement
      );

      expect(result).toBe(false);
      expect(mockAudioElement.setSinkId?.mock.calls[0][0]).toBe('output2');
    });

    test('should check if setSinkId is supported', () => {
      // With support
      const supported = mediaManager.isSinkIdSupported(
        mockAudioElement as unknown as HTMLMediaElement
      );
      expect(supported).toBe(true);

      // Without support
      mockAudioElement.setSinkId = undefined;
      const unsupported = mediaManager.isSinkIdSupported(
        mockAudioElement as unknown as HTMLMediaElement
      );
      expect(unsupported).toBe(false);
    });
  });

  //-------------------------------------------------------------------------
  // 5. Screen Sharing Tests
  //-------------------------------------------------------------------------

  describe('Screen Sharing', () => {
    test('should get screen share stream successfully', async () => {
      // Create a local copy with getDisplayMedia defined
      const localMediaDevices = {
        ...mockMediaDevices,
        getDisplayMedia: jest.fn().mockResolvedValue(createMockMediaStream(undefined, 'screen1')),
      };

      // Apply it to navigator
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: localMediaDevices,
        configurable: true,
      });

      const result = await mediaManager.getScreenShareStream();

      expect(result).not.toBeNull();
      expect(localMediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true });

      // Should have video track
      if (result) {
        expect(result.getVideoTracks().length).toBeGreaterThan(0);
      }

      // Restore original mediaDevices
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    });

    test('should handle screen share permission denial', async () => {
      // Create a local copy with getDisplayMedia defined
      const localMediaDevices = {
        ...mockMediaDevices,
        getDisplayMedia: jest.fn().mockRejectedValue(new Error('Permission denied')),
      };

      // Set error name
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      localMediaDevices.getDisplayMedia.mockRejectedValue(permissionError);

      // Apply it to navigator
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: localMediaDevices,
        configurable: true,
      });

      const result = await mediaManager.getScreenShareStream();

      expect(result).toBeNull();
      expect(localMediaDevices.getDisplayMedia).toHaveBeenCalled();

      // Restore original mediaDevices
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    });

    test('should handle screen share constraints', async () => {
      // Create a local copy with getDisplayMedia defined
      const localMediaDevices = {
        ...mockMediaDevices,
        getDisplayMedia: jest.fn().mockResolvedValue(createMockMediaStream(undefined, 'screen1')),
      };

      // Apply it to navigator
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: localMediaDevices,
        configurable: true,
      });

      await mediaManager.getScreenShareStream();

      // Verify default constraints
      expect(localMediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true });

      // Restore original mediaDevices
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    });

    test('should check if screen sharing is supported', () => {
      // Create a local copy with getDisplayMedia defined
      const localMediaDevices = {
        ...mockMediaDevices,
        getDisplayMedia: jest.fn(),
      };

      // Override the global for this test
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: localMediaDevices,
        configurable: true,
      });

      // With support
      const supported = mediaManager.isScreenShareSupported();
      expect(supported).toBe(true);

      // Without support
      const tempMediaDevices = {
        enumerateDevices: localMediaDevices.enumerateDevices,
        getUserMedia: localMediaDevices.getUserMedia,
        addEventListener: localMediaDevices.addEventListener,
        removeEventListener: localMediaDevices.removeEventListener,
        dispatchEvent: localMediaDevices.dispatchEvent,
      };

      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: tempMediaDevices,
        configurable: true,
      });

      const unsupported = mediaManager.isScreenShareSupported();
      expect(unsupported).toBe(false);

      // Restore for other tests
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    });
  });

  //-------------------------------------------------------------------------
  // 6. Error Recovery Tests
  //-------------------------------------------------------------------------

  describe('Error Recovery', () => {
    test('should handle API availability checks', async () => {
      // Create a new object without getUserMedia
      const noGetUserMediaDevices = {
        enumerateDevices: mockMediaDevices.enumerateDevices,
        addEventListener: mockMediaDevices.addEventListener,
        removeEventListener: mockMediaDevices.removeEventListener,
        dispatchEvent: mockMediaDevices.dispatchEvent,
      };

      // Apply to navigator
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: noGetUserMediaDevices,
        configurable: true,
      });

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'Media devices not supported'
      );

      // Restore for other tests
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mockMediaDevices,
        configurable: true,
      });
    });

    test('should handle permission denial errors', async () => {
      // Simulate permission denied
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      mockMediaDevices.getUserMedia.mockRejectedValue(permissionError);

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'Camera/microphone access denied'
      );
    });

    test('should handle device not found errors', async () => {
      // Simulate no device found
      const notFoundError = new Error('Device not found');
      notFoundError.name = 'NotFoundError';
      mockMediaDevices.getUserMedia.mockRejectedValue(notFoundError);

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'No camera or microphone found'
      );
    });

    test('should handle device in use errors', async () => {
      // Simulate device in use
      const inUseError = new Error('Device in use');
      inUseError.name = 'NotReadableError';
      mockMediaDevices.getUserMedia.mockRejectedValue(inUseError);

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'Could not access camera/microphone'
      );
    });

    test('should handle generic errors', async () => {
      // Simulate other errors
      const genericError = new Error('Something went wrong');
      genericError.name = 'OtherError';
      mockMediaDevices.getUserMedia.mockRejectedValue(genericError);

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'Media access error'
      );
    });

    test('should handle overconstrained errors', async () => {
      // Simulate overconstrained error
      const constraintError = new Error('Constraint not satisfied');
      constraintError.name = 'OverconstrainedError';
      mockMediaDevices.getUserMedia.mockRejectedValue(constraintError);

      await expect(mediaManager.initialize({ audio: true, video: true })).rejects.toThrow(
        'The requested media settings cannot be satisfied'
      );
    });

    test('should handle initialization state', async () => {
      expect(mediaManager.isMediaInitialized()).toBe(false);

      await mediaManager.initialize({ audio: true, video: true });
      expect(mediaManager.isMediaInitialized()).toBe(true);

      mediaManager.stop();
      expect(mediaManager.isMediaInitialized()).toBe(false);
    });
  });

  //-------------------------------------------------------------------------
  // 7. Device Change Detection Tests
  //-------------------------------------------------------------------------

  describe('Device Change Detection', () => {
    test('should setup device change listener', async () => {
      await mediaManager.initialize({ audio: true, video: true });

      // Check that the event listener was added
      expect(mockMediaDevices.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });

    test('should handle device changes properly', async () => {
      // First setup with the initial devices
      await mediaManager.initialize({ audio: true, video: true });
      await mediaManager.enumerateDevices();

      const initialAudioDevices = mediaManager.getAudioInputDevices();
      expect(initialAudioDevices.length).toBe(2);

      // Now simulate a device change event with different devices
      const newDevices = [
        ...defaultDevices,
        createMockMediaDeviceInfo('audio3', 'audioinput', 'New Audio Device'),
      ];

      // Update the mock to return new devices list
      mockMediaDevices.enumerateDevices.mockResolvedValue(newDevices);

      // Call the handleDeviceChange method directly (since we can't trigger the event easily)
      // Get private method with type assertion
      const mediaManagerAny = mediaManager as any;
      await mediaManagerAny.handleDeviceChange();

      // Check that we have the updated devices
      const updatedAudioDevices = mediaManager.getAudioInputDevices();
      expect(updatedAudioDevices.length).toBe(3);
      expect(updatedAudioDevices[2].deviceId).toBe('audio3');
    });
  });
});
