import { Button, Layout, Spinner, Text } from '@ui-kitten/components';
import type React from 'react';
import { StyleSheet } from 'react-native';
import type { InitPhase } from '../../hooks';

interface RoomInitializationStatusProps {
  initPhase: InitPhase;
  onSkipMediaAccess: () => void;
}

/**
 * Component to display loading status during room initialization
 */
export const RoomInitializationStatus: React.FC<RoomInitializationStatusProps> = ({
  initPhase,
  onSkipMediaAccess,
}) => {
  // Get loading message based on current phase
  let loadingMessage = 'Joining room...';
  let detailMessage = '';

  switch (initPhase) {
    case 'auth':
      loadingMessage = 'Checking authentication...';
      detailMessage = 'Verifying your account before joining the room';
      break;
    case 'media':
      loadingMessage = 'Initializing camera and microphone...';
      detailMessage = 'This may take a moment. Please allow camera/microphone access if prompted';
      break;
    case 'webrtc':
      loadingMessage = 'Setting up video connection...';
      detailMessage = 'Establishing peer connections for video chat';
      break;
    case 'signaling':
      loadingMessage = 'Joining room...';
      detailMessage = 'Connecting to the room and other participants';
      break;
    case 'chat':
      loadingMessage = 'Setting up chat...';
      detailMessage = 'Almost ready! Setting up text chat functionality';
      break;
  }

  return (
    <Layout style={styles.loadingContainer}>
      <Spinner size="large" />
      <Text category="h6" style={styles.loadingText}>
        {loadingMessage}
      </Text>

      <Text category="s1" style={styles.loadingPhase}>
        Phase{' '}
        {initPhase === 'auth'
          ? '1/5'
          : initPhase === 'media'
            ? '2/5'
            : initPhase === 'webrtc'
              ? '3/5'
              : initPhase === 'signaling'
                ? '4/5'
                : initPhase === 'chat'
                  ? '5/5'
                  : ''}
      </Text>

      <Text category="c1" appearance="hint" style={styles.loadingHint}>
        {detailMessage}
      </Text>

      {(initPhase === 'media' || initPhase === 'webrtc') && (
        <Button
          style={styles.skipButton}
          appearance="outline"
          status="basic"
          onPress={onSkipMediaAccess}
        >
          Skip Media Access
        </Button>
      )}
    </Layout>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    marginBottom: 8,
  },
  loadingPhase: {
    marginBottom: 16,
    color: '#666',
  },
  loadingHint: {
    textAlign: 'center',
    marginHorizontal: 30,
    marginBottom: 20,
  },
  skipButton: {
    marginTop: 10,
  },
});
