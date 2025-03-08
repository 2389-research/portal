/**
 * Native-specific implementation of the video container
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@ui-kitten/components';

// Define the props interface directly to avoid circular dependencies
interface NativeVideoContainerProps {
  stream?: MediaStream | null;
  label?: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
}

// Define styles locally to avoid circular dependencies
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

export const NativeVideoContainer: React.FC<NativeVideoContainerProps> = ({
  label = '',
  isLocal = false,
  isScreenShare = false,
}) => {
  return (
    <View style={[styles.container, isScreenShare && styles.screenShare]}>
      <View style={styles.placeholderVideo}>
        <Text style={styles.placeholderText}>Video not available on this platform</Text>
      </View>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label || (isLocal ? 'You' : 'Peer')}</Text>
      </View>
    </View>
  );
};