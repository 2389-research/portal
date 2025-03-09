/**
 * Chat interface component for WebRTC chat
 */

import { Button, Card, Divider, Input, Text } from '@ui-kitten/components';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { ChatMessage } from '../services/chat';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isReady: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isReady = false,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Handle send button press
  const handleSend = () => {
    if (inputText.trim() && isReady) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  // Format timestamp to readable time
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card style={styles.container}>
      <Text category="h6" style={styles.header}>
        Chat
      </Text>
      <Divider />

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesList}
      >
        {messages.length === 0 ? (
          <Text appearance="hint" style={styles.emptyState}>
            No messages yet. Start the conversation!
          </Text>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageContainer,
                message.isLocal ? styles.localMessage : styles.remoteMessage,
              ]}
            >
              <Text style={styles.messageContent}>{message.content}</Text>
              <Text style={styles.timestamp}>{formatTimestamp(message.timestamp)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputContainer}>
          <Input
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            disabled={!isReady}
            onSubmitEditing={handleSend}
          />
          <Button onPress={handleSend} disabled={!isReady || !inputText.trim()}>
            Send
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    borderRadius: 0,
  },
  header: {
    marginBottom: 8,
  },
  messagesContainer: {
    flex: 1,
    maxHeight: '85%',
  },
  messagesList: {
    padding: 10,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 20,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  localMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#e3f2fd',
    borderBottomRightRadius: 0,
  },
  remoteMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f5f5f5',
    borderBottomLeftRadius: 0,
  },
  messageContent: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 10,
    color: '#9e9e9e',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  input: {
    flex: 1,
    marginRight: 8,
  },
});
