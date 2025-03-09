/**
 * Video container component for displaying WebRTC video streams
 * Uses platform-specific implementations for better separation of concerns
 */

import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Text } from '@ui-kitten/components';

// Define the props interface
export interface VideoContainerProps {
  stream: MediaStream | null;
  label?: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
}

// Define styles that will be used by platform-specific implementations
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

// Dynamically import platform implementations to avoid circular dependencies
export const VideoContainer: React.FC<VideoContainerProps> = (props) => {
  // Native implementation fallback
  const NativeImplementation: React.FC<VideoContainerProps> = ({ 
    label = '', 
    isLocal = false,
    isScreenShare = false 
  }) => (
    <View style={[videoStyles.container, isScreenShare && videoStyles.screenShare]}>
      <View style={videoStyles.placeholderVideo}>
        <Text style={videoStyles.placeholderText}>Video not available on this platform</Text>
      </View>
      <View style={videoStyles.labelContainer}>
        <Text style={videoStyles.label}>{label || (isLocal ? 'You' : 'Peer')}</Text>
      </View>
    </View>
  );

  // Use web implementation on web platform
  if (Platform.OS === 'web') {
    // Dynamically require the web implementation
    const WebVideoContainer = require('./platform/WebVideoContainer').WebVideoContainer;
    return <WebVideoContainer {...props} />;
  }

  // Dynamically require the native implementation if available, or use fallback
  try {
    const NativeVideoContainer = require('./platform/NativeVideoContainer').NativeVideoContainer;
    return <NativeVideoContainer {...props} />;
  } catch {
    return <NativeImplementation {...props} />;
  }
};
