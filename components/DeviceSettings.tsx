/**
 * Device settings modal for WebRTC video chat
 */

import { Button, Card, IndexPath, Select, SelectItem, Text } from '@ui-kitten/components';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

interface MediaDevice {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

interface DeviceSettingsProps {
  visible: boolean;
  onClose: () => void;
  onApply: (audioDevice: string, videoDevice: string, audioOutputDevice: string) => void;
  audioInputDevices: MediaDevice[];
  videoInputDevices: MediaDevice[];
  audioOutputDevices: MediaDevice[];
  currentAudioDevice: string | null;
  currentVideoDevice: string | null;
  currentAudioOutputDevice: string | null;
}

export const DeviceSettings: React.FC<DeviceSettingsProps> = ({
  visible,
  onClose,
  onApply,
  audioInputDevices,
  videoInputDevices,
  audioOutputDevices,
  currentAudioDevice,
  currentVideoDevice,
  currentAudioOutputDevice,
}) => {
  // Find initial index paths based on current devices
  const findIndexPath = (devices: MediaDevice[], currentDeviceId: string | null): IndexPath => {
    if (!currentDeviceId) return new IndexPath(0);
    const index = devices.findIndex((device) => device.deviceId === currentDeviceId);
    return new IndexPath(index >= 0 ? index : 0);
  };

  // State for selected devices
  const [audioInputIndex, setAudioInputIndex] = useState<IndexPath>(
    findIndexPath(audioInputDevices, currentAudioDevice)
  );

  const [videoInputIndex, setVideoInputIndex] = useState<IndexPath>(
    findIndexPath(videoInputDevices, currentVideoDevice)
  );

  const [audioOutputIndex, setAudioOutputIndex] = useState<IndexPath>(
    findIndexPath(audioOutputDevices, currentAudioOutputDevice)
  );

  // Update index paths when devices or current selections change
  useEffect(() => {
    setAudioInputIndex(findIndexPath(audioInputDevices, currentAudioDevice));
    setVideoInputIndex(findIndexPath(videoInputDevices, currentVideoDevice));
    setAudioOutputIndex(findIndexPath(audioOutputDevices, currentAudioOutputDevice));
  }, [
    audioInputDevices,
    videoInputDevices,
    audioOutputDevices,
    currentAudioDevice,
    currentVideoDevice,
    currentAudioOutputDevice,
  ]);

  // Handle apply button press
  const handleApply = () => {
    const selectedAudioDevice = audioInputDevices[audioInputIndex.row]?.deviceId || '';
    const selectedVideoDevice = videoInputDevices[videoInputIndex.row]?.deviceId || '';
    const selectedAudioOutputDevice = audioOutputDevices[audioOutputIndex.row]?.deviceId || '';

    onApply(selectedAudioDevice, selectedVideoDevice, selectedAudioOutputDevice);

    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <Card style={styles.modalContainer}>
              <Text category="h5" style={styles.title}>
                Media Settings
              </Text>

              <View style={styles.formGroup}>
                <Text category="label" style={styles.label}>
                  Microphone
                </Text>
                <Select
                  placeholder="Select Microphone"
                  value={audioInputDevices[audioInputIndex.row]?.label || 'Default'}
                  selectedIndex={audioInputIndex}
                  onSelect={(index) => setAudioInputIndex(index as IndexPath)}
                >
                  {audioInputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} title={device.label} />
                  ))}
                </Select>
              </View>

              <View style={styles.formGroup}>
                <Text category="label" style={styles.label}>
                  Camera
                </Text>
                <Select
                  placeholder="Select Camera"
                  value={videoInputDevices[videoInputIndex.row]?.label || 'Default'}
                  selectedIndex={videoInputIndex}
                  onSelect={(index) => setVideoInputIndex(index as IndexPath)}
                >
                  {videoInputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} title={device.label} />
                  ))}
                </Select>
              </View>

              <View style={styles.formGroup}>
                <Text category="label" style={styles.label}>
                  Speaker
                </Text>
                <Select
                  placeholder="Select Speaker"
                  value={audioOutputDevices[audioOutputIndex.row]?.label || 'Default'}
                  selectedIndex={audioOutputIndex}
                  onSelect={(index) => setAudioOutputIndex(index as IndexPath)}
                >
                  {audioOutputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} title={device.label} />
                  ))}
                </Select>
              </View>

              <View style={styles.buttonContainer}>
                <Button appearance="outline" style={styles.button} onPress={onClose}>
                  Cancel
                </Button>
                <Button style={styles.button} onPress={handleApply}>
                  Apply
                </Button>
              </View>
            </Card>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: 10,
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    marginLeft: 10,
  },
});
