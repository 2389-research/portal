/**
 * Web-specific implementation of the video container
 */

import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';
import { VideoContainerProps, videoStyles } from '../VideoContainer';

export const WebVideoContainer: React.FC<VideoContainerProps> = ({
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
    <View style={[videoStyles.container, isScreenShare && videoStyles.screenShare]}>
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

      <View style={videoStyles.labelContainer}>
        <Text style={videoStyles.label}>{label || (isLocal ? 'You' : 'Peer')}</Text>
      </View>
    </View>
  );
};