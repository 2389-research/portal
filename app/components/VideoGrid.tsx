/**
 * Video grid component for displaying multiple video streams
 */

import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { VideoContainer } from './VideoContainer';

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  screenShareStream?: MediaStream | null;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  localStream,
  remoteStreams,
  screenShareStream = null,
}) => {
  useWindowDimensions(); // Used for future responsive design needs
  const streams = Array.from(remoteStreams.entries());
  const totalParticipants = streams.length + 1; // +1 for local stream

  // Determine grid layout based on participant count
  const getGridLayout = () => {
    if (screenShareStream) {
      return {
        columns: 1,
        rows: 1,
        screenShareColumns: 1,
        screenShareRows: 1,
        isScreenShareMode: true,
      };
    }

    if (totalParticipants <= 1) {
      return { columns: 1, rows: 1 };
    } else if (totalParticipants <= 2) {
      return { columns: 2, rows: 1 };
    } else if (totalParticipants <= 4) {
      return { columns: 2, rows: 2 };
    } else if (totalParticipants <= 6) {
      return { columns: 3, rows: 2 };
    } else if (totalParticipants <= 9) {
      return { columns: 3, rows: 3 };
    } else {
      return { columns: 4, rows: 3 };
    }
  };

  const layout = getGridLayout();
  const isScreenShareMode = 'isScreenShareMode' in layout && layout.isScreenShareMode;

  // Calculate video container dimensions based on grid layout
  const getContainerStyle = (index: number) => {
    const { columns } = layout;

    // In screen share mode, render differently
    if (isScreenShareMode && index === 0 && screenShareStream) {
      return {
        width: '100%',
        height: undefined,
        aspectRatio: 16 / 9,
        marginBottom: 10,
      };
    }

    return {
      width: `${100 / columns - 2}%`,
      marginHorizontal: '1%',
      marginVertical: 5,
    };
  };

  return (
    <View style={styles.grid}>
      {/* Screen share stream (if active) */}
      {isScreenShareMode && screenShareStream && (
        <View style={getContainerStyle(0)}>
          <VideoContainer stream={screenShareStream} label="Screen Share" isScreenShare={true} />
        </View>
      )}

      {/* Participants grid */}
      <View style={[styles.participantsGrid, isScreenShareMode && styles.smallParticipantsGrid]}>
        {/* Local stream */}
        <View style={getContainerStyle(0)}>
          <VideoContainer stream={localStream} isLocal={true} />
        </View>

        {/* Remote streams */}
        {streams.map(([peerId, stream], index) => (
          <View key={peerId} style={getContainerStyle(index + 1)}>
            <VideoContainer stream={stream} label={`Peer ${index + 1}`} />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    padding: 5,
  },
  participantsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  smallParticipantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
