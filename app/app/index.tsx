import { Button, Card, Divider, Input, Layout, Spinner, Text } from '@ui-kitten/components';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiProvider } from '../api';
import { Login } from '../components/Login';
import { createLogger } from '../services/logger';

export default function HomeScreen() {
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();
  const logger = createLogger('Home');

  // API is already initialized in _layout.tsx
  // We just need to check for auth state on component mount
  React.useEffect(() => {
    const checkAuthState = async () => {
      try {
        const provider = ApiProvider.getInstance();
        const apiClient = provider.getApiClient();

        if (!apiClient) {
          logger.error('API client not initialized');
          setError('Failed to connect to authentication service. Please refresh the page.');
          return;
        }

        if (apiClient.getCurrentUser && apiClient.isSignedIn) {
          const isSignedIn = apiClient.isSignedIn();
          logger.info('Initial auth check:', isSignedIn ? 'Signed in' : 'Not signed in');
          setIsLoggedIn(isSignedIn);
        }
      } catch (error) {
        logger.error('Error checking auth state:', error);
      }
    };

    checkAuthState();
  }, [logger]);

  // Create a new room
  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = ApiProvider.getInstance();
      const apiClient = provider.getApiClient();

      if (!apiClient) {
        throw new Error('API client not initialized');
      }

      const result = await apiClient.createRoom();

      // Navigate to room screen with room ID
      router.push({
        pathname: '/room/[id]',
        params: { id: result.roomId },
      });
    } catch (error) {
      logger.error('Error creating room:', error);
      setError('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Join an existing room
  const handleJoinRoom = () => {
    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    // Navigate to room screen with provided room ID
    router.push({
      pathname: '/room/[id]',
      params: { id: roomId.trim() },
    });
  };

  // We only use Firebase as the backend

  return (
    <Layout style={styles.container}>
      <View style={styles.header}>
        <Text category="h4">WebRTC Video Chat</Text>
      </View>
      <View style={styles.content}>
        <Login
          onLoginStateChange={(loggedIn) => {
            logger.info('Login state changed:', loggedIn);
            setIsLoggedIn(loggedIn);
          }}
        />

        {isLoggedIn ? (
          <>
            <Text category="h1" style={styles.title}>
              Create or Join Room
            </Text>

            <Card style={styles.card}>
              <Button
                appearance="filled"
                size="large"
                onPress={handleCreateRoom}
                disabled={loading}
                accessoryRight={loading ? () => <Spinner size="small" /> : undefined}
              >
                Create New Room
              </Button>

              <View style={styles.dividerContainer}>
                <Divider style={styles.divider} />
                <Text appearance="hint" style={styles.orText}>
                  OR
                </Text>
                <Divider style={styles.divider} />
              </View>

              <Input
                placeholder="Enter Room ID"
                value={roomId}
                onChangeText={setRoomId}
                style={styles.input}
                autoCapitalize="none"
                disabled={loading}
              />

              <Button
                style={styles.joinButton}
                onPress={handleJoinRoom}
                disabled={loading || !roomId.trim()}
              >
                Join Room
              </Button>

              {error && (
                <Text status="danger" style={styles.errorText}>
                  {error}
                </Text>
              )}
            </Card>
          </>
        ) : (
          <Card style={styles.loginRequiredCard}>
            <Text category="h6" style={styles.loginRequiredTitle}>
              Sign In Required
            </Text>
            <Text appearance="hint" style={styles.loginRequiredText}>
              Please sign in with your Google account to create or join video chat rooms.
            </Text>
          </Card>
        )}
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    paddingTop: 40, // Safe area for status bar
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 30,
  },
  card: {
    marginBottom: 20,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
  },
  orText: {
    marginHorizontal: 10,
  },
  input: {
    marginBottom: 15,
  },
  joinButton: {
    marginBottom: 10,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
  },
  loginRequiredCard: {
    marginTop: 20,
  },
  loginRequiredTitle: {
    marginBottom: 10,
    textAlign: 'center',
  },
  loginRequiredText: {
    textAlign: 'center',
  },
});
