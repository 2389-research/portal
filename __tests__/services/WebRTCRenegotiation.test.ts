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

describe('WebRTCManager Renegotiation', () => {
  let webrtcManager: WebRTCManager;

  // Mock for RTCPeerConnection
  const mockPeerConnection = {
    addTrack: jest.fn().mockReturnValue({ track: null }),
    removeTrack: jest.fn(),
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
    getSenders: jest.fn().mockReturnValue([]),
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

  // Create mock sender
  const createMockSender = (track: any) => {
    return {
      track,
      replaceTrack: jest.fn().mockImplementation((newTrack) => {
        track = newTrack;
        return Promise.resolve();
      }),
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
  // 1. Track Management Tests
  //-------------------------------------------------------------------------

  describe('Track Management', () => {
    test('should add and track new media track', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockSender = createMockSender(null);
      
      // Mock addTrack to return our mock sender
      mockPeerConnection.addTrack.mockReturnValue(mockSender);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Create a new track to add
      const newVideoTrack = createMockMediaTrack('video', 'new-video', 'New Video Track');
      const newStream = createMockMediaStream('new-stream-id', undefined, 'new-video');
      
      // Add the track
      const result = await webrtcManager.addTrack(
        newVideoTrack as unknown as MediaStreamTrack, 
        newStream as unknown as MediaStream,
        'video'
      );
      
      // Verify track was added
      expect(result).toBe(true);
      expect(mockPeerConnection.addTrack).toHaveBeenCalledWith(newVideoTrack, newStream);
      
      // Verify onnegotiationneeded should be triggered (but we don't simulate it here)
    });
    
    test('should remove track properly', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      
      // Mock sender object
      const mockSender = createMockSender(mockLocalStream.getVideoTracks()[0]);
      
      // Mock addTrack to return our mock sender
      mockPeerConnection.addTrack.mockReturnValue(mockSender);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Verify the track was added and sender stored internally
      expect(mockPeerConnection.addTrack).toHaveBeenCalledTimes(2); // One audio, one video
      
      // Use private API to verify the track was stored properly
      const localSenders = (webrtcManager as any).localSenders;
      expect(localSenders.size).toBe(2);
      
      // Get the video track ID
      const videoTrackId = mockLocalStream.getVideoTracks()[0].id;
      
      // Remove the track
      const result = webrtcManager.removeTrack(videoTrackId);
      
      // Verify track was removed
      expect(result).toBe(true);
      expect(mockPeerConnection.removeTrack).toHaveBeenCalledWith(mockSender);
      
      // Verify the track is no longer in localSenders
      expect(localSenders.has(videoTrackId)).toBe(false);
      expect(localSenders.size).toBe(1); // Only audio track should remain
    });
    
    test('should replace track properly', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      
      // Get the original video track
      const originalVideoTrack = mockLocalStream.getVideoTracks()[0];
      
      // Mock sender object
      const mockSender = createMockSender(originalVideoTrack);
      
      // Mock addTrack to return our mock sender
      mockPeerConnection.addTrack.mockReturnValue(mockSender);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Create new track to replace with
      const newVideoTrack = createMockMediaTrack('video', 'new-video', 'New Video Track');
      
      // Replace the track
      const result = webrtcManager.replaceTrack(
        originalVideoTrack.id, 
        newVideoTrack as unknown as MediaStreamTrack
      );
      
      // Verify track was replaced
      expect(result).toBe(true);
      expect(mockSender.replaceTrack).toHaveBeenCalledWith(newVideoTrack);
      
      // Use private API to verify the sender was updated
      const localSenders = (webrtcManager as any).localSenders;
      expect(localSenders.has('new-video')).toBe(true);
      expect(localSenders.has(originalVideoTrack.id)).toBe(false);
    });
    
    test('should toggle tracks properly', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Toggle video tracks
      const result = webrtcManager.toggleTrack('video');
      
      // Verify track was toggled
      expect(result).toBe(false); // Should be disabled now
      
      // Toggle again
      const result2 = webrtcManager.toggleTrack('video');
      
      // Verify track was toggled back
      expect(result2).toBe(true); // Should be enabled again
    });
  });

  //-------------------------------------------------------------------------
  // 2. Renegotiation Tests
  //-------------------------------------------------------------------------

  describe('Renegotiation', () => {
    test('should handle renegotiation properly', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const negotiationNeededCallback = jest.fn();
      
      // Set up negotiation needed handler
      webrtcManager.setOnNegotiationNeeded(negotiationNeededCallback);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Verify initial state
      expect((webrtcManager as any).isRenegotiating).toBe(false);
      
      // Start renegotiation
      const result = await webrtcManager.handleRenegotiation();
      
      // Verify renegotiation is properly set up
      expect(result).toHaveProperty('offer');
      expect(result).toHaveProperty('connectionId');
      expect(mockPeerConnection.createOffer).toHaveBeenCalled();
      expect(mockPeerConnection.setLocalDescription).toHaveBeenCalled();
      
      // Complete renegotiation
      await webrtcManager.completeRenegotiation();
      
      // Verify renegotiation is completed
      expect((webrtcManager as any).isRenegotiating).toBe(false);
      expect((webrtcManager as any).pendingCandidates).toEqual([]);
    });
    
    test('should handle screen share tracks', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const mockScreenStream = createMockMediaStream('screen-stream-id', undefined, 'screen-video');
      const mockSender = createMockSender(null);
      
      // Mock addTrack to return our mock sender
      mockPeerConnection.addTrack.mockReturnValue(mockSender);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Add screen share track
      const result = await webrtcManager.addScreenShareTrack(mockScreenStream as unknown as MediaStream);
      
      // Verify screen share track was added
      expect(result).toBe(true);
      expect(mockPeerConnection.addTrack).toHaveBeenCalledWith(
        mockScreenStream.getVideoTracks()[0], 
        mockScreenStream
      );
      
      // Verify the track is marked as a screen share
      const localSenders = (webrtcManager as any).localSenders;
      const screenTrackId = mockScreenStream.getVideoTracks()[0].id;
      expect(localSenders.get(screenTrackId).type).toBe('screen');
      
      // Remove screen share track
      const removeResult = webrtcManager.removeScreenShareTrack();
      
      // Verify screen share track was removed
      expect(removeResult).toBe(true);
      expect(mockPeerConnection.removeTrack).toHaveBeenCalledWith(mockSender);
      expect(localSenders.has(screenTrackId)).toBe(false);
    });
    
    test('should handle ICE candidates during renegotiation', async () => {
      const mockLocalStream = createMockMediaStream('local-stream-id', 'audio1', 'video1');
      const iceCandidateCallback = jest.fn();
      
      // Set up ICE candidate handler
      webrtcManager.setOnIceCandidate(iceCandidateCallback);
      
      // Initialize
      await webrtcManager.initialize(mockLocalStream as unknown as MediaStream);
      
      // Start renegotiation
      await webrtcManager.handleRenegotiation();
      
      // Simulate ICE candidate events during renegotiation
      const mockIceCandidate1 = { candidate: 'candidate1' };
      const mockIceCandidate2 = { candidate: 'candidate2' };
      
      mockPeerConnection.onicecandidate?.({ candidate: mockIceCandidate1 } as any);
      mockPeerConnection.onicecandidate?.({ candidate: mockIceCandidate2 } as any);
      
      // Verify candidates were stored, not immediately sent
      expect(iceCandidateCallback).not.toHaveBeenCalled();
      expect((webrtcManager as any).pendingCandidates.length).toBe(2);
      
      // Complete renegotiation
      await webrtcManager.completeRenegotiation();
      
      // Verify pending candidates were sent
      expect(iceCandidateCallback).toHaveBeenCalledTimes(2);
      expect(iceCandidateCallback).toHaveBeenCalledWith(mockIceCandidate1, expect.any(String));
      expect(iceCandidateCallback).toHaveBeenCalledWith(mockIceCandidate2, expect.any(String));
      
      // Verify pending candidates were cleared
      expect((webrtcManager as any).pendingCandidates.length).toBe(0);
    });
  });
});