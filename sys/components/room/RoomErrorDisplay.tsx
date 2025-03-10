import { Button, Layout, Text } from '@ui-kitten/components';
import type React from 'react';
import { StyleSheet, View } from 'react-native';

interface RoomErrorDisplayProps {
  error: string;
  onGoBack: () => void;
  onGoToLogin?: () => void;
}

/**
 * Component to display error messages during room connection
 */
export const RoomErrorDisplay: React.FC<RoomErrorDisplayProps> = ({
  error,
  onGoBack,
  onGoToLogin,
}) => {
  // Check if error is auth related
  const isAuthError =
    error.includes('sign in') ||
    error.includes('authenticate') ||
    error.includes('login') ||
    error.includes('permission');

  return (
    <Layout style={styles.errorContainer}>
      <Text category="h5" status="danger">
        Error
      </Text>
      <Text style={styles.errorText}>{error}</Text>

      {isAuthError ? (
        <View style={styles.authErrorContainer}>
          <Text appearance="hint" style={styles.authErrorText}>
            You need to sign in to use this application.
          </Text>

          <View style={styles.loginButtonContainer}>
            <Button
              appearance="outline"
              status="primary"
              onPress={onGoToLogin || onGoBack}
              style={styles.errorButton}
            >
              Go to Login
            </Button>
          </View>
        </View>
      ) : (
        <Button onPress={onGoBack} style={styles.errorButton}>
          Go Back
        </Button>
      )}
    </Layout>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    textAlign: 'center',
    marginVertical: 20,
  },
  authErrorContainer: {
    marginTop: 5,
  },
  authErrorText: {
    textAlign: 'center',
    marginBottom: 15,
  },
  loginButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  errorButton: {
    marginTop: 10,
  },
});
