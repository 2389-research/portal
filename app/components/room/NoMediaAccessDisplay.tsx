import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@ui-kitten/components';

/**
 * Component to display when media access is disabled/not available
 */
export const NoMediaAccessDisplay: React.FC = () => {
  return (
    <View style={styles.noMediaContainer}>
      <Text category="h6" style={styles.noMediaTitle}>
        Media access is disabled
      </Text>
      <Text appearance="hint" style={styles.noMediaText}>
        You're in view-only mode without camera or microphone access.
      </Text>
      <Text category="c1" style={styles.permissionInstructions}>
        To enable camera and microphone access:
      </Text>
      <Text category="c1" style={styles.permissionStep}>
        1. Click the camera icon in your browser's address bar
      </Text>
      <Text category="c1" style={styles.permissionStep}>
        2. Select "Allow" for camera and microphone
      </Text>
      <Text category="c1" style={styles.permissionStep}>
        3. Refresh this page
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  noMediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noMediaTitle: {
    marginBottom: 10,
  },
  noMediaText: {
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionInstructions: {
    marginTop: 20,
    marginBottom: 10,
  },
  permissionStep: {
    marginLeft: 20,
    marginBottom: 5,
  },
});