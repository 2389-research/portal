/**
 * Chat Manager
 * Manages chat messages and uses DataChannelManager for transport
 */

import { createLogger } from '../logger';
import type { WebRTCManager } from '../webrtc';
import { DataChannelManager, type DataChannelMessage } from './DataChannelManager';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  isLocal: boolean;
}

export class ChatManager {
  private messages: ChatMessage[] = [];
  private userId: string;
  private onMessageCallback: ((message: ChatMessage) => void) | null = null;
  private dataChannelManager: DataChannelManager;
  private logger = createLogger('Chat');

  constructor(userId: string, webrtcManager: WebRTCManager) {
    this.userId = userId;
    this.dataChannelManager = new DataChannelManager(webrtcManager);

    // Set up the data channel message handler
    this.dataChannelManager.onMessage((message) => {
      this.handleIncomingMessage(message);
    });
  }

  /**
   * Initialize chat with a data channel
   */
  public async initialize(isInitiator: boolean): Promise<boolean> {
    this.logger.info('Initializing chat, isInitiator:', isInitiator);
    return await this.dataChannelManager.initialize(isInitiator);
  }

  /**
   * Handle incoming messages from the data channel
   */
  private handleIncomingMessage(message: DataChannelMessage): void {
    this.logger.info('Received chat message from:', message.sender);

    const chatMessage: ChatMessage = {
      id: message.id,
      sender: message.sender,
      content: message.content,
      timestamp: message.timestamp,
      isLocal: false,
    };

    this.messages.push(chatMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(chatMessage);
    }
  }

  /**
   * Send a chat message
   */
  public sendMessage(content: string): ChatMessage | null {
    // Check if data channel is ready
    if (!this.dataChannelManager.isReady()) {
      this.logger.error('Data channel not ready to send message');
      return null;
    }

    this.logger.info(
      'Sending chat message:',
      content.substring(0, 20) + (content.length > 20 ? '...' : '')
    );

    const messageId = this.generateId();
    const timestamp = Date.now();

    const message: DataChannelMessage = {
      id: messageId,
      sender: this.userId,
      content,
      timestamp,
    };

    // Try to send the message
    const sent = this.dataChannelManager.send(message);

    if (sent) {
      // Create a chat message and add it to our local list
      const chatMessage: ChatMessage = {
        ...message,
        isLocal: true,
      };

      this.messages.push(chatMessage);

      if (this.onMessageCallback) {
        this.onMessageCallback(chatMessage);
      }

      return chatMessage;
    }

    return null;
  }

  /**
   * Generate a unique ID for messages
   */
  private generateId(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Set message callback
   */
  public onMessage(callback: (message: ChatMessage) => void): void {
    this.onMessageCallback = callback;
  }
  
  /**
   * Register a callback for data channel ready state changes
   * @param callback Function to call when ready state changes
   * @returns Function to unregister the callback
   */
  public onReadyStateChange(callback: (isReady: boolean) => void): () => void {
    return this.dataChannelManager.onReadyStateChange(callback);
  }

  /**
   * Get all messages
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Check if chat is ready to send messages
   */
  public isReady(): boolean {
    return this.dataChannelManager.isReady();
  }

  /**
   * Wait for chat to be ready (with timeout)
   */
  public waitForReady(timeoutMs = 10000): Promise<boolean> {
    return this.dataChannelManager.waitForChannelReady(timeoutMs);
  }

  /**
   * Close the chat
   */
  public close(): void {
    this.dataChannelManager.close();
  }

  /**
   * Dispose the chat manager and release resources
   * This is an alias for close() to maintain API compatibility
   */
  public dispose(): void {
    this.logger.info('Disposing chat manager');
    this.close();
  }
}
