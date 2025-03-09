import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import PrivateRoomScreen from '../../../app/private/[uuid]/room/[id]/[name]';
import { ApiProvider } from '../../../api';
import { MediaManager } from '../../../services/media';
import { WebRTCManager } from '../../../services/webrtc';
import { SignalingService } from '../../../services/signaling';
import { ChatManager } from '../../../services/chat';

// Mocks
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({
    uuid: 'test-uuid',
    id: 'test-room',
    name: 'Test Display Name',
  })),
  useRouter: jest.fn(() => ({
    replace: jest.fn(),
  })),
}));

// Mock API Provider
jest.mock('../../../api', () => ({
  ApiProvider: {
    getInstance: jest.fn(),
  },
}));

// Mock services
jest.mock('../../../services/media', () => ({
  MediaManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    getLocalStream: jest.fn().mockResolvedValue({
      id: 'mock-stream',
      getVideoTracks: () => [{ enabled: true }],
      getAudioTracks: () => [{ enabled: true }],
    }),
    stopLocalStream: jest.fn(),
  })),
}));

jest.mock('../../../services/webrtc', () => ({
  WebRTCManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
  })),
}));

jest.mock('../../../services/signaling', () => ({
  SignalingService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
  })),
}));

jest.mock('../../../services/chat', () => {
  const mockOnMessage = jest.fn();
  return {
    ChatManager: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      onMessage: mockOnMessage,
      dispose: jest.fn(),
    })),
  };
});

// Mock video element
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  return {
    ...rn,
    // Add a mock implementation for video
    video: jest.fn().mockImplementation(({ children, ...props }) => (
      <rn.View {...props}>{children}</rn.View>
    )),
  };
});

describe('PrivateRoomScreen', () => {
  let mockApiClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock API client with anonymous auth
    mockApiClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      signInAnonymously: jest.fn().mockResolvedValue({
        uid: 'anon-user-id',
        displayName: 'Test Display Name',
        email: null,
        photoURL: null,
      }),
      joinRoom: jest.fn().mockResolvedValue({
        userId: 'anon-user-id',
        joined: Date.now(),
      }),
      leaveRoom: jest.fn().mockResolvedValue(undefined),
      getProviderName: jest.fn().mockReturnValue('Firebase'),
    };
    
    // Mock ApiProvider.getInstance to return an object with getApiClient
    (ApiProvider.getInstance as jest.Mock).mockReturnValue({
      getApiClient: jest.fn().mockReturnValue(mockApiClient),
    });
  });
  
  it('renders loading state initially', async () => {
    const { getByText } = render(<PrivateRoomScreen />);
    
    // Should show "Authenticating..." initially
    expect(getByText('Authenticating...')).toBeTruthy();
  });
  
  it('initializes services and joins room with anonymous auth', async () => {
    render(<PrivateRoomScreen />);
    
    // Wait for initialization to complete
    await waitFor(() => {
      // Check that API client was called with correct parameters
      expect(mockApiClient.connect).toHaveBeenCalled();
      expect(mockApiClient.signInAnonymously).toHaveBeenCalledWith('test-uuid', 'Test Display Name');
      expect(mockApiClient.joinRoom).toHaveBeenCalledWith('test-room');
    });
    
    // Check that services were initialized
    expect(MediaManager).toHaveBeenCalled();
    expect(WebRTCManager).toHaveBeenCalled();
    expect(SignalingService).toHaveBeenCalled();
    expect(ChatManager).toHaveBeenCalled();
  });
  
  it('handles authentication errors', async () => {
    // Mock API client to throw an error on signInAnonymously
    mockApiClient.signInAnonymously.mockRejectedValue(new Error('Auth error'));
    
    const { getByText } = render(<PrivateRoomScreen />);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(getByText(/Authentication error/)).toBeTruthy();
    });
  });
  
  it('initializes chat manager', async () => {
    render(<PrivateRoomScreen />);
    
    // Wait for initialization to complete
    await waitFor(() => {
      expect(mockApiClient.joinRoom).toHaveBeenCalled();
    });
    
    // Verify that ChatManager was initialized
    const ChatManager = require('../../../services/chat').ChatManager;
    expect(ChatManager).toHaveBeenCalled();
    
    // Get the ChatManager instance mock
    const chatManagerInstance = (ChatManager as jest.Mock).mock.results[0].value;
    expect(chatManagerInstance.initialize).toHaveBeenCalled();
    expect(chatManagerInstance.onMessage).toHaveBeenCalled();
  });
  
  it('displays the user display name', async () => {
    const { getByText } = render(<PrivateRoomScreen />);
    
    // Wait for initialization to complete
    await waitFor(() => {
      expect(mockApiClient.joinRoom).toHaveBeenCalled();
    });
    
    // Display name should be visible
    expect(getByText('Test Display Name')).toBeTruthy();
  });
  
  it('handles missing URL parameters', async () => {
    // Mock useLocalSearchParams to return empty values
    (require('expo-router').useLocalSearchParams as jest.Mock).mockReturnValueOnce({
      uuid: '',
      id: '',
      name: '',
    });
    
    const { getByText } = render(<PrivateRoomScreen />);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(getByText(/Invalid parameters/)).toBeTruthy();
    });
  });
});