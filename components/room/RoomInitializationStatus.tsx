import { Button, Layout, Spinner, Text } from '@ui-kitten/components';
import React from 'react';
import { StyleSheet } from 'react-native';
import type { InitPhase } from '../../hooks';

interface RoomInitializationStatusProps {
  initPhase: InitPhase;
  onSkipMediaAccess: () => void;
}

interface PhaseInfo {
  loadingMessage: string;
  detailMessage: string;
  phaseNumber: string;
  showSkipButton?: boolean;
}

/**
 * Component to display loading status during room initialization
 */
export const RoomInitializationStatus: React.FC<RoomInitializationStatusProps> = ({
  initPhase,
  onSkipMediaAccess,
}) => {
  // Define phase information map
  const phaseInfoMap: Record<InitPhase, PhaseInfo> = {
    auth: {
      loadingMessage: 'Checking authentication...',
      detailMessage: 'Verifying your account before joining the room',
      phaseNumber: '1/5',
    },
    media: {
      loadingMessage: 'Initializing camera and microphone...',
      detailMessage: 'This may take a moment. Please allow camera/microphone access if prompted',
      phaseNumber: '2/5',
      showSkipButton: true,
    },
    webrtc: {
      loadingMessage: 'Setting up video connection...',
      detailMessage: 'Establishing peer connections for video chat',
      phaseNumber: '3/5',
      showSkipButton: true,
    },
    signaling: {
      loadingMessage: 'Joining room...',
      detailMessage: 'Connecting to the room and other participants',
      phaseNumber: '4/5',
    },
    chat: {
      loadingMessage: 'Setting up chat...',
      detailMessage: 'Almost ready! Setting up text chat functionality',
      phaseNumber: '5/5',
    },
    complete: {
      loadingMessage: 'Complete!',
      detailMessage: 'Room initialization complete',
      phaseNumber: '',
    },
  };

  // Get phase info based on current phase
  const { loadingMessage, detailMessage, phaseNumber, showSkipButton } = phaseInfoMap[initPhase];

  return (
    <Layout style={styles.loadingContainer}>
      <Spinner size="large" />
      <Text category="h6" style={styles.loadingText}>
        {loadingMessage}
      </Text>

      {phaseNumber && (
        <Text category="s1" style={styles.loadingPhase}>
          Phase {phaseNumber}
        </Text>
      )}

      <Text category="c1" appearance="hint" style={styles.loadingHint}>
        {detailMessage}
      </Text>

      {showSkipButton && (
        <>
          <Text category="p2" appearance="hint" style={styles.troubleshootText}>
            Taking too long? Check that your browser has permission to use the camera and
            microphone.
          </Text>
          <Button
            style={styles.skipButton}
            appearance="filled"
            status="primary"
            onPress={onSkipMediaAccess}
          >
            Continue Without Camera/Mic
          </Button>
        </>
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
  troubleshootText: {
    textAlign: 'center',
    marginHorizontal: 30,
    marginBottom: 10,
    marginTop: 15,
  },
  skipButton: {
    marginTop: 10,
  },
});
