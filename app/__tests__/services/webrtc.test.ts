import { WebRTCManager } from '../../services/webrtc';

// Mock for createLogger
jest.mock('../../services/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('WebRTCManager', () => {
  let webrtcManager: WebRTCManager;

  // Mock for RTCPeerConnection
  const mockPeerConnection = {
    addTrack: jest.fn(),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    createDataChannel: jest.fn(),
    onicecandidate: null,
    onnegotiationneeded: null,
    ontrack: null,
    ondatachannel: null,
    iceConnectionState: 'new',
    connectionState: 'new',
  };

  // Mock RTCPeerConnection constructor
  global.RTCPeerConnection = jest.fn().mockImplementation(() => mockPeerConnection);

  // Mock for RTCSessionDescription constructor
  global.RTCSessionDescription = jest.fn().mockImplementation((desc) => desc);

  // Helper to create a mock MediaTrack
  const createMockMediaTrack = (kind: 'audio' | 'video', id: string, label: string) => {
    return {
      kind,
      enabled: true,
      label,
      readyState: 'live',
      id,
      stop: jest.fn(),
      getSettings: jest.fn().mockReturnValue({ deviceId: id }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      onended: null,
    };
  };

  // Create a mock MediaStream
  const createMockMediaStream = (id: string, audioTrackId?: string, videoTrackId?: string) => {
    const audioTracks = audioTrackId
      ? [createMockMediaTrack('audio', audioTrackId, `Audio ${audioTrackId}`)]
      : [];

    const videoTracks = videoTrackId
      ? [createMockMediaTrack('video', videoTrackId, `Video ${videoTrackId}`)]
      : [];

    const allTracks = [...audioTracks, ...videoTracks];

    return {
      id,
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

  // Mock for RTCDataChannel
  const createMockDataChannel = (label: string) => {
    return {
      label,
      readyState: 'connecting',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: jest.fn(),
      close: jest.fn(),
    };
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset the mock RTCPeerConnection
    Object.values(mockPeerConnection).forEach((value) => {
      if (typeof value === 'function' && value.mockClear) {
        value.mockClear();
      }
    });

    // Create a fresh WebRTCManager instance
    webrtcManager = new WebRTCManager();
  });

  //-------------------------------------------------------------------------
  // 1. Connection Lifecycle Tests
  //-------------------------------------------------------------------------

  describe('Connection Lifecycle', () => {
    test('should initialize with local media stream', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Verify RTCPeerConnection was created
      expect(global.RTCPeerConnection).toHaveBeenCalled();

      // Verify tracks were added
      expect(mockPeerConnection.addTrack).toHaveBeenCalledTimes(2); // One audio, one video

      // Verify local stream is stored
      expect(webrtcManager.getLocalStream()).toBe(mockLocalStream);
    });

    test('should close the peer connection and clean up resources', async () => {
      // Initialize first
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Add a remote stream to verify cleanup
      const mockRemoteStream = createMockMediaStream(
        'remote-stream-id',
        'remote-audio',
        'remote-video'
      );
      (webrtcManager as any).remoteStreams.set('remote-peer', mockRemoteStream);

      // Now close
      webrtcManager.close();

      // Verify peer connection was closed
      expect(mockPeerConnection.close).toHaveBeenCalled();

      // Verify local stream tracks were stopped
      const localTracks = mockLocalStream.getTracks();
      localTracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });

      // Verify state was cleaned up
      expect(webrtcManager.getLocalStream()).toBeNull();
      expect(webrtcManager.getRemoteStreams().size).toBe(0);
    });

    test('should handle ICE candidate events', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockIceCandidateCallback = jest.fn();

      // Set up ICE candidate handler
      webrtcManager.setOnIceCandidate(mockIceCandidateCallback);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Simulate ICE candidate event
      const mockIceCandidate = { candidate: 'mock-candidate' };
      mockPeerConnection.onicecandidate?.({ candidate: mockIceCandidate } as any);

      // Verify callback was called with the candidate
      expect(mockIceCandidateCallback).toHaveBeenCalledWith(mockIceCandidate);
    });

    test('should add ICE candidate to peer connection', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Add ICE candidate
      const mockIceCandidate = { candidate: 'mock-candidate' } as unknown as RTCIceCandidate;
      await webrtcManager.addIceCandidate(mockIceCandidate);

      // Verify addIceCandidate was called
      expect(mockPeerConnection.addIceCandidate).toHaveBeenCalledWith(mockIceCandidate);
    });

    test('should throw error when adding ICE candidate to uninitialized connection', async () => {
      // Don't initialize

      // Try to add ICE candidate
      const mockIceCandidate = { candidate: 'mock-candidate' } as unknown as RTCIceCandidate;
      await expect(webrtcManager.addIceCandidate(mockIceCandidate)).rejects.toThrow(
        'Peer connection not initialized'
      );
    });
  });

  //-------------------------------------------------------------------------
  // 2. Data Channel Operations Tests
  //-------------------------------------------------------------------------

  describe('Data Channel Operations', () => {
    test('should create data channel successfully', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockDataChannel = createMockDataChannel('test-channel');

      // Mock createDataChannel to return our mock channel
      mockPeerConnection.createDataChannel.mockReturnValue(mockDataChannel);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Create data channel
      const dataChannel = webrtcManager.createDataChannel('test-channel');

      // Verify createDataChannel was called with correct parameters
      expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('test-channel', {
        ordered: true,
        maxRetransmits: 30,
      });

      // Verify returned data channel
      expect(dataChannel).toBe(mockDataChannel);
    });

    test('should return null when creating data channel on uninitialized connection', () => {
      // Don't initialize

      // Try to create data channel
      const dataChannel = webrtcManager.createDataChannel('test-channel');

      // Verify null is returned
      expect(dataChannel).toBeNull();
    });

    test('should handle data channel received from remote peer', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockDataChannel = createMockDataChannel('remote-channel');
      const mockDataChannelCallback = jest.fn();

      // Set up data channel handler
      webrtcManager.setOnDataChannel(mockDataChannelCallback);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Simulate data channel event
      mockPeerConnection.ondatachannel?.({ channel: mockDataChannel } as any);

      // Verify callback was called with the channel
      expect(mockDataChannelCallback).toHaveBeenCalledWith(mockDataChannel);
    });

    test('should handle data channel events', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockDataChannel = createMockDataChannel('test-channel');

      // Mock createDataChannel to return our mock channel
      mockPeerConnection.createDataChannel.mockReturnValue(mockDataChannel);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Create data channel
      webrtcManager.createDataChannel('test-channel');

      // Verify event handlers were set up
      expect(mockDataChannel.onopen).toBeDefined();
      expect(mockDataChannel.onclose).toBeDefined();
      expect(mockDataChannel.onerror).toBeDefined();

      // Test the handlers (they just log, so no assertions needed)
      mockDataChannel.onopen?.({} as any);
      mockDataChannel.onclose?.({} as any);
      mockDataChannel.onerror?.({ error: new Error('test error') } as any);
    });

    test('should handle error when creating data channel', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Mock createDataChannel to throw an error
      mockPeerConnection.createDataChannel.mockImplementation(() => {
        throw new Error('Failed to create data channel');
      });

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Create data channel - should handle error
      const dataChannel = webrtcManager.createDataChannel('test-channel');

      // Verify null is returned when there's an error
      expect(dataChannel).toBeNull();
    });
  });

  //-------------------------------------------------------------------------
  // 3. Media Stream Integration Tests
  //-------------------------------------------------------------------------

  describe('Media Stream Integration', () => {
    test('should handle track events from remote peer', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockRemoteStream = createMockMediaStream(
        'remote-stream-id',
        'remote-audio',
        'remote-video'
      );
      const mockTrackCallback = jest.fn();

      // Set up track handler
      webrtcManager.setOnTrack(mockTrackCallback);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Simulate track event
      mockPeerConnection.ontrack?.({
        streams: [mockRemoteStream],
      } as any);

      // Verify callback was called with stream and peer ID
      expect(mockTrackCallback).toHaveBeenCalledWith(mockRemoteStream, 'remote-stream-id');

      // Verify remote stream was stored
      expect(webrtcManager.getRemoteStreams().get('remote-stream-id')).toBe(mockRemoteStream);
    });

    test('should get local stream', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Get local stream
      const localStream = webrtcManager.getLocalStream();

      // Verify local stream is returned
      expect(localStream).toBe(mockLocalStream);
    });

    test('should get remote streams', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Add mock remote streams
      const mockRemoteStream1 = createMockMediaStream(
        'remote-stream-1',
        'remote-audio-1',
        'remote-video-1'
      );
      const mockRemoteStream2 = createMockMediaStream(
        'remote-stream-2',
        'remote-audio-2',
        'remote-video-2'
      );

      (webrtcManager as any).remoteStreams.set('remote-stream-1', mockRemoteStream1);
      (webrtcManager as any).remoteStreams.set('remote-stream-2', mockRemoteStream2);

      // Get remote streams
      const remoteStreams = webrtcManager.getRemoteStreams();

      // Verify remote streams are returned
      expect(remoteStreams.size).toBe(2);
      expect(remoteStreams.get('remote-stream-1')).toBe(mockRemoteStream1);
      expect(remoteStreams.get('remote-stream-2')).toBe(mockRemoteStream2);
    });
  });

  //-------------------------------------------------------------------------
  // 4. Negotiation Tests
  //-------------------------------------------------------------------------

  describe('Negotiation', () => {
    test('should handle negotiation needed events', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockNegotiationNeededCallback = jest.fn();

      // Set up negotiation needed handler
      webrtcManager.setOnNegotiationNeeded(mockNegotiationNeededCallback);

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Simulate negotiation needed event
      mockPeerConnection.onnegotiationneeded?.({} as any);

      // Verify callback was called
      expect(mockNegotiationNeededCallback).toHaveBeenCalled();
    });

    test('should create offer successfully', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Create offer
      const offer = await webrtcManager.createOffer();

      // Verify createOffer was called
      expect(mockPeerConnection.createOffer).toHaveBeenCalled();

      // Verify setLocalDescription was called with the offer
      expect(mockPeerConnection.setLocalDescription).toHaveBeenCalledWith({
        type: 'offer',
        sdp: 'mock-sdp',
      });

      // Verify returned offer
      expect(offer).toEqual({ type: 'offer', sdp: 'mock-sdp' });
    });

    test('should throw when creating offer with uninitialized connection', async () => {
      // Don't initialize

      // Try to create offer
      await expect(webrtcManager.createOffer()).rejects.toThrow('Peer connection not initialized');
    });

    test('should process offer successfully', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Process offer
      const offer = { type: 'offer', sdp: 'remote-sdp' };
      const answer = await webrtcManager.processOffer(offer);

      // Verify setRemoteDescription was called with the offer
      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();

      // Verify createAnswer was called
      expect(mockPeerConnection.createAnswer).toHaveBeenCalled();

      // Verify setLocalDescription was called with the answer
      expect(mockPeerConnection.setLocalDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: 'mock-sdp',
      });

      // Verify returned answer
      expect(answer).toEqual({ type: 'answer', sdp: 'mock-sdp' });
    });

    test('should throw when processing offer with uninitialized connection', async () => {
      // Don't initialize

      // Try to process offer
      const offer = { type: 'offer', sdp: 'remote-sdp' };
      await expect(webrtcManager.processOffer(offer)).rejects.toThrow(
        'Peer connection not initialized'
      );
    });

    test('should process answer successfully', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Process answer
      const answer = { type: 'answer', sdp: 'remote-sdp' };
      await webrtcManager.processAnswer(answer);

      // Verify setRemoteDescription was called with the answer
      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();
    });

    test('should throw when processing answer with uninitialized connection', async () => {
      // Don't initialize

      // Try to process answer
      const answer = { type: 'answer', sdp: 'remote-sdp' };
      await expect(webrtcManager.processAnswer(answer)).rejects.toThrow(
        'Peer connection not initialized'
      );
    });
  });

  //-------------------------------------------------------------------------
  // 5. Error Handling Tests
  //-------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('should handle error when setLocalDescription fails', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Mock setLocalDescription to fail
      mockPeerConnection.setLocalDescription.mockRejectedValueOnce(new Error('SLD failed'));

      // Try to create offer
      await expect(webrtcManager.createOffer()).rejects.toThrow('SLD failed');
    });

    test('should handle error when createOffer fails', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Mock createOffer to fail
      mockPeerConnection.createOffer.mockRejectedValueOnce(new Error('createOffer failed'));

      // Try to create offer
      await expect(webrtcManager.createOffer()).rejects.toThrow('createOffer failed');
    });

    test('should handle error when setRemoteDescription fails', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Mock setRemoteDescription to fail
      mockPeerConnection.setRemoteDescription.mockRejectedValueOnce(new Error('SRD failed'));

      // Try to process offer
      const offer = { type: 'offer', sdp: 'remote-sdp' };
      await expect(webrtcManager.processOffer(offer)).rejects.toThrow('SRD failed');
    });

    test('should handle error when createAnswer fails', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Mock createAnswer to fail
      mockPeerConnection.createAnswer.mockRejectedValueOnce(new Error('createAnswer failed'));

      // Try to process offer
      const offer = { type: 'offer', sdp: 'remote-sdp' };
      await expect(webrtcManager.processOffer(offer)).rejects.toThrow('createAnswer failed');
    });

    test('should handle error when addIceCandidate fails', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');

      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);

      // Mock addIceCandidate to fail
      mockPeerConnection.addIceCandidate.mockRejectedValueOnce(new Error('addIceCandidate failed'));

      // Try to add ICE candidate
      const mockIceCandidate = { candidate: 'mock-candidate' } as unknown as RTCIceCandidate;
      await expect(webrtcManager.addIceCandidate(mockIceCandidate)).rejects.toThrow(
        'addIceCandidate failed'
      );
    });
  });
});
