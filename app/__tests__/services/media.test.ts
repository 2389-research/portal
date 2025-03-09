import { MediaManager } from '../../services/media';

describe('MediaManager', () => {
  let mediaManager: MediaManager;

  // Mock navigator.mediaDevices.getUserMedia
  const mockMediaDevices = {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn(),
  };

  const mockMediaStream = {
    getTracks: jest.fn().mockReturnValue([
      { kind: 'audio', enabled: true, stop: jest.fn() },
      { kind: 'video', enabled: true, stop: jest.fn() },
    ]),
    getAudioTracks: jest
      .fn()
      .mockReturnValue([
        {
          kind: 'audio',
          enabled: true,
          stop: jest.fn(),
          getSettings: () => ({ deviceId: 'audio1' }),
        },
      ]),
    getVideoTracks: jest
      .fn()
      .mockReturnValue([
        {
          kind: 'video',
          enabled: true,
          stop: jest.fn(),
          getSettings: () => ({ deviceId: 'video1' }),
        },
      ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock for getUserMedia
    mockMediaDevices.getUserMedia.mockResolvedValue(mockMediaStream);

    // Setup mock for enumerateDevices
    mockMediaDevices.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'audio1', label: 'Audio 1' },
      { kind: 'audioinput', deviceId: 'audio2', label: 'Audio 2' },
      { kind: 'videoinput', deviceId: 'video1', label: 'Video 1' },
      { kind: 'videoinput', deviceId: 'video2', label: 'Video 2' },
      { kind: 'audiooutput', deviceId: 'output1', label: 'Output 1' },
    ]);

    // Ensure navigator exists in the global object with proper interface
    if (!global.navigator) {
      // Create a navigator mock that implements the Navigator interface
      // Create a partial mock and cast to unknown first to avoid TypeScript errors
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
        configurable: true
      });
    }

    mediaManager = new MediaManager();
  });

  test('should initialize with media stream', async () => {
    const stream = await mediaManager.initialize({ audio: true, video: true });

    expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(stream).toBe(mockMediaStream);
  });

  test('should toggle audio', async () => {
    await mediaManager.initialize({ audio: true, video: true });

    const mockAudioTrack = mockMediaStream.getAudioTracks()[0];
    mockAudioTrack.enabled = true;

    // Toggle audio off
    const result1 = mediaManager.toggleAudio();
    expect(result1).toBe(false);

    // Toggle audio on
    mockAudioTrack.enabled = false;
    const result2 = mediaManager.toggleAudio();
    expect(result2).toBe(true);
  });

  test('should toggle video', async () => {
    await mediaManager.initialize({ audio: true, video: true });

    const mockVideoTrack = mockMediaStream.getVideoTracks()[0];
    mockVideoTrack.enabled = true;

    // Toggle video off
    const result1 = mediaManager.toggleVideo();
    expect(result1).toBe(false);

    // Toggle video on
    mockVideoTrack.enabled = false;
    const result2 = mediaManager.toggleVideo();
    expect(result2).toBe(true);
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
    expect(outputDevices.length).toBe(1);
    expect(outputDevices[0].deviceId).toBe('output1');
  });

  test('should stop all tracks', async () => {
    await mediaManager.initialize({ audio: true, video: true });

    const tracks = mockMediaStream.getTracks();

    mediaManager.stop();

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
  });

  test('should stop a specific stream', async () => {
    await mediaManager.initialize({ audio: true, video: true });
    
    // Create a mock stream for testing the stopLocalStream method
    const specificMockStream = {
      getTracks: jest.fn().mockReturnValue([
        { kind: 'audio', label: 'Test Audio', stop: jest.fn() },
        { kind: 'video', label: 'Test Video', stop: jest.fn() }
      ])
    };
    
    // Call the new method
    mediaManager.stopLocalStream(specificMockStream as unknown as MediaStream);
    
    // Verify tracks were stopped
    const specificTracks = specificMockStream.getTracks();
    expect(specificTracks[0].stop).toHaveBeenCalled();
    expect(specificTracks[1].stop).toHaveBeenCalled();
  });
});
