import { renderHook, act } from '@testing-library/react';
import { useMedia } from '../../hooks/useMedia';
import { MediaManager } from '../../services/media';

// Mock the MediaManager implementation
const mockMediaManager = {
  initialize: jest.fn().mockResolvedValue({} as MediaStream),
  enumerateDevices: jest.fn().mockResolvedValue(undefined),
  getAudioInputDevices: jest.fn().mockReturnValue([]),
  getVideoInputDevices: jest.fn().mockReturnValue([]),
  getAudioOutputDevices: jest.fn().mockReturnValue([]),
  stopLocalStream: jest.fn(),
  toggleAudio: jest.fn().mockReturnValue(false),
  toggleVideo: jest.fn().mockReturnValue(false),
  getScreenShareStream: jest.fn().mockResolvedValue({} as MediaStream),
  getCurrentAudioDevice: jest.fn().mockReturnValue('default-audio'),
  getCurrentVideoDevice: jest.fn().mockReturnValue('default-video'),
  getCurrentAudioOutputDevice: jest.fn().mockReturnValue('default-output'),
  switchAudioDevice: jest.fn().mockResolvedValue(undefined),
  switchVideoDevice: jest.fn().mockResolvedValue(undefined),
  switchAudioOutputDevice: jest.fn().mockResolvedValue(undefined),
  getStream: jest.fn().mockReturnValue({} as MediaStream),
};

// Mock MediaManager constructor
jest.mock('../../services/media', () => ({
  MediaManager: jest.fn().mockImplementation(() => mockMediaManager),
}));

// Mock createLogger
jest.mock('../../services/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}));

// Mock navigator mediaDevices
const mockGetUserMedia = jest.fn().mockResolvedValue({} as MediaStream);
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

describe('useMedia hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with skipMediaAccess=false by default', () => {
    const { result } = renderHook(() => useMedia());
    expect(result.current.skipMediaAccess).toBe(false);
  });

  it('should initialize with skipMediaAccess=true when specified', () => {
    const { result } = renderHook(() => useMedia({ skipMediaAccess: true }));
    expect(result.current.skipMediaAccess).toBe(true);
  });

  it('should have an audioEnabled state property', () => {
    const { result } = renderHook(() => useMedia({ skipMediaAccess: true }));
    expect(result.current.audioEnabled).toBeDefined();
    expect(typeof result.current.audioEnabled).toBe('boolean');
  });

  it('should have a videoEnabled state property', () => {
    const { result } = renderHook(() => useMedia({ skipMediaAccess: true }));
    expect(result.current.videoEnabled).toBeDefined();
    expect(typeof result.current.videoEnabled).toBe('boolean');
  });
  
  it('should expose toggleAudio and toggleVideo functions', () => {
    const { result } = renderHook(() => useMedia({ skipMediaAccess: true }));
    expect(typeof result.current.toggleAudio).toBe('function');
    expect(typeof result.current.toggleVideo).toBe('function');
  });

  it('should call onMediaError when media initialization fails', async () => {
    // Setup mock to reject
    mockMediaManager.initialize.mockRejectedValueOnce(new Error('Media access denied'));
    
    const onMediaError = jest.fn();
    
    renderHook(() => useMedia({ onMediaError }));
    
    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
    });
    
    expect(onMediaError).toHaveBeenCalledWith('Media access denied');
  });
});