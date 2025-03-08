/**
 * Video container component for displaying WebRTC video streams
 * Uses platform-specific implementations for better separation of concerns
 */

import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Text } from '@ui-kitten/components';
import { WebVideoContainer } from './platform/WebVideoContainer';
import { NativeVideoContainer } from './platform/NativeVideoContainer';

export interface VideoContainerProps {
  stream: MediaStream | null;
  label?: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
}

export const VideoContainer: React.FC<VideoContainerProps> = (props) => {
  // Use platform-specific implementation
  if (Platform.OS === 'web') {
    return <WebVideoContainer {...props} />;
  }

  return <NativeVideoContainer {...props} />;
};

// Export styles for use in platform-specific implementations
export const videoStyles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  screenShare: {
    aspectRatio: 16 / 10,
  },
  placeholderVideo: {
    flex: 1,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'white',
    textAlign: 'center',
    padding: 20,
  },
  labelContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  label: {
    color: 'white',
    fontSize: 12,
  },
});
