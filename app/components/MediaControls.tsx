/**
 * Media controls component for WebRTC video chat
 */

import { Button, ButtonGroup, Icon, type IconProps } from '@ui-kitten/components';
import type React from 'react';
import { StyleSheet, View } from 'react-native';

interface MediaControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onShareScreen: () => void;
  onOpenSettings: () => void;
  onLeaveRoom: () => void;
  isScreenSharing?: boolean;
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onShareScreen,
  onOpenSettings,
  onLeaveRoom,
  isScreenSharing = false,
}) => {
  // Icon renderers
  const renderMicIcon = (props?: IconProps) => (
    <Icon {...props} name={audioEnabled ? 'mic-outline' : 'mic-off-outline'} />
  );

  const renderVideoIcon = (props?: IconProps) => (
    <Icon {...props} name={videoEnabled ? 'video-outline' : 'video-off-outline'} />
  );

  const renderScreenShareIcon = (props?: IconProps) => (
    <Icon {...props} name={isScreenSharing ? 'monitor-off-outline' : 'monitor-outline'} />
  );

  const renderSettingsIcon = (props?: IconProps) => <Icon {...props} name="settings-outline" />;

  const renderLeaveIcon = (props?: IconProps) => <Icon {...props} name="log-out-outline" />;

  return (
    <View style={styles.container}>
      <ButtonGroup style={styles.buttonGroup} appearance="filled">
        <Button
          status={audioEnabled ? 'primary' : 'basic'}
          accessoryLeft={renderMicIcon}
          onPress={onToggleAudio}
        />
        <Button
          status={videoEnabled ? 'primary' : 'basic'}
          accessoryLeft={renderVideoIcon}
          onPress={onToggleVideo}
        />
        <Button
          status={isScreenSharing ? 'warning' : 'basic'}
          accessoryLeft={renderScreenShareIcon}
          onPress={onShareScreen}
        />
        <Button status="basic" accessoryLeft={renderSettingsIcon} onPress={onOpenSettings} />
        <Button status="danger" accessoryLeft={renderLeaveIcon} onPress={onLeaveRoom} />
      </ButtonGroup>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  buttonGroup: {
    justifyContent: 'center',
  },
});
