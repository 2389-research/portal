import { Button, Icon, type IconProps, Layout, Text } from '@ui-kitten/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Clipboard, StyleSheet, View } from 'react-native';

import { ChatInterface } from '../../components/ChatInterface';
import { DeviceSettings } from '../../components/DeviceSettings';
import { MediaControls } from '../../components/MediaControls';
import { VideoGrid } from '../../components/VideoGrid';
import {
  NoMediaAccessDisplay,
  RoomErrorDisplay,
  RoomInitializationStatus,
} from '../../components/room';
import { type MediaDevice, useRoomInitialization } from '../../hooks';

import { createLogger } from '../../services/logger';

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams();
  const router = useRouter();
  const logger = createLogger('Room');

  // Chat visibility state
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Use the room initialization hook to manage the entire initialization flow
  const room = useRoomInitialization(roomId as string | undefined);

  // Copy room ID to clipboard
  const copyRoomId = () => {
    Clipboard.setString(roomId as string);
    Alert.alert('Copied', 'Room ID copied to clipboard');
  };

  // Render copy icon for clipboard button
  const renderCopyIcon = (props?: IconProps) => <Icon {...props} name="copy-outline" />;

  // Render chat toggle icon
  const renderChatIcon = (props?: IconProps) => <Icon {...props} name="message-circle-outline" />;

  // Handle device selection changes
  const handleDeviceSelection = async (
    audioDevice: string,
    videoDevice: string,
    audioOutputDevice: string
  ) => {
    if (room.media.switchDevices) {
      await room.media.switchDevices(audioDevice, videoDevice, audioOutputDevice);
    }
  };

  // If loading, show initialization status
  if (room.loading) {
    return (
      <RoomInitializationStatus
        initPhase={room.initPhase}
        onSkipMediaAccess={() => {
          logger.info('User manually skipped media access');
          room.setSkipMediaAccess(true);
        }}
      />
    );
  }

  // If error, show error display
  if (room.error) {
    return <RoomErrorDisplay error={room.error} onGoBack={() => router.replace('/')} />;
  }

  return (
    <Layout style={styles.container}>
      {/* Header with room ID and controls */}
      <View style={styles.headerContainer}>
        <Text category="h6">Room: {typeof roomId === 'string' ? roomId : String(roomId)}</Text>
        <View style={styles.headerButtons}>
          <Button
            size="small"
            appearance="ghost"
            accessoryLeft={renderChatIcon}
            onPress={() => setIsChatVisible(!isChatVisible)}
            status={isChatVisible ? 'primary' : 'basic'}
          />
          <Button
            size="small"
            appearance="ghost"
            accessoryLeft={renderCopyIcon}
            onPress={copyRoomId}
          />
        </View>
      </View>

      {/* Main content area */}
      {room.skipMediaAccess ? (
        <NoMediaAccessDisplay />
      ) : (
        <>
          <View style={styles.contentContainer}>
            {/* Show chat sidebar if visible */}
            {isChatVisible && room.chat.chatManager && (
              <View style={styles.chatSidebar}>
                <ChatInterface
                  messages={room.chat.chatMessages}
                  onSendMessage={room.chat.sendMessage}
                  isReady={room.chat.chatReady}
                />
              </View>
            )}

            {/* Video grid */}
            <View style={styles.gridContainer}>
              <VideoGrid
                localStream={room.media.localStream}
                remoteStreams={room.webrtc.remoteStreams}
                screenShareStream={room.media.screenShareStream}
              />
            </View>
          </View>

          {/* Media controls */}
          <MediaControls
            audioEnabled={room.media.audioEnabled}
            videoEnabled={room.media.videoEnabled}
            onToggleAudio={room.media.toggleAudio}
            onToggleVideo={room.media.toggleVideo}
            onShareScreen={room.media.toggleScreenShare}
            onOpenSettings={() => setShowSettings(true)}
            onLeaveRoom={room.exitRoom}
            isScreenSharing={room.media.isScreenSharing}
          />

          {/* Device settings modal */}
          <DeviceSettings
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            onApply={handleDeviceSelection}
            audioInputDevices={room.media.audioInputDevices}
            videoInputDevices={room.media.videoInputDevices}
            audioOutputDevices={room.media.audioOutputDevices}
            currentAudioDevice={room.media.mediaManager?.getCurrentAudioDevice() || null}
            currentVideoDevice={room.media.mediaManager?.getCurrentVideoDevice() || null}
            currentAudioOutputDevice={
              room.media.mediaManager?.getCurrentAudioOutputDevice() || null
            }
          />
        </>
      )}

      {/* Leave room button */}
      <View style={styles.leaveContainer}>
        <Button status="danger" appearance="outline" onPress={room.exitRoom}>
          Leave Room
        </Button>
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40, // Add safe area padding for status bar
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  chatSidebar: {
    width: 300,
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    height: '100%',
  },
  gridContainer: {
    flex: 1,
  },
  leaveContainer: {
    padding: 10,
    alignItems: 'center',
  },
});
