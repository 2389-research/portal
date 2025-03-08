/**
 * Web-specific implementation of the video container
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@ui-kitten/components';

// Define the props interface directly to avoid circular dependencies
interface WebVideoContainerProps {
  stream: MediaStream | null;
  label?: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
}

// Import styles directly from a local constant
const styles = StyleSheet.create({
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

export const WebVideoContainer: React.FC<WebVideoContainerProps> = ({
  stream,
  label = '',
  isLocal = false,
  isScreenShare = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // When the stream changes, update the video element
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <View style={[styles.container, isScreenShare && styles.screenShare]}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isLocal ? 'scaleX(-1)' : 'none',
          backgroundColor: '#000',
        }}
      />

      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label || (isLocal ? 'You' : 'Peer')}</Text>
      </View>
    </View>
  );
};