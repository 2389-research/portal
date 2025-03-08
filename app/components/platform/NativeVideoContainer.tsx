/**
 * Native-specific implementation of the video container
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';
import { VideoContainerProps, videoStyles } from '../VideoContainer';

export const NativeVideoContainer: React.FC<VideoContainerProps> = ({
  label = '',
  isLocal = false,
  isScreenShare = false,
}) => {
  return (
    <View style={[videoStyles.container, isScreenShare && videoStyles.screenShare]}>
      <View style={videoStyles.placeholderVideo}>
        <Text style={videoStyles.placeholderText}>Video not available on this platform</Text>
      </View>
      <View style={videoStyles.labelContainer}>
        <Text style={videoStyles.label}>{label || (isLocal ? 'You' : 'Peer')}</Text>
      </View>
    </View>
  );
};