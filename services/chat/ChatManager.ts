/**
 * Chat Manager
 * Manages chat messages and uses DataChannelManager for transport
 * 
 * Note: ChatManager now supports multiple peer connections by managing
 * multiple DataChannelManager instances.
 */

import { createLogger } from '../logger';
import type { WebRTCManager, PeerConnectionManager } from '../webrtc';
import { DataChannelManager, type DataChannelMessage } from './DataChannelManager';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  isLocal: boolean;
  peerId?: string; // The specific peer this message was received from
}

export class ChatManager {
  private messages: ChatMessage[] = [];
  private userId: string;
  private onMessageCallback: ((message: ChatMessage) => void) | null = null;
  private dataChannelManagers: Map<string, DataChannelManager> = new Map();
  private primaryDataChannelManager: DataChannelManager | null = null;
  private logger = createLogger('Chat');
  private initialized = false;
  private isInitializing = false;
  private onReadyStateChangeCallbacks: Set<(isReady: boolean) => void> = new Set();

  /**
   * Create a new ChatManager
   * @param userId The local user's ID
   * @param webrtcManager Either a WebRTCManager for a single connection or null
   */
  constructor(userId: string, webrtcManager?: WebRTCManager | null) {
    this.userId = userId;
    
    // If we have a WebRTCManager, create a data channel manager for it
    if (webrtcManager) {
      const dataChannelManager = new DataChannelManager(webrtcManager);
      this.primaryDataChannelManager = dataChannelManager;
      
      // Set ID as "primary" for the main connection
      this.dataChannelManagers.set("primary", dataChannelManager);
      
      // Set up the data channel message handler
      dataChannelManager.onMessage((message) => {
        this.handleIncomingMessage(message, "primary");
      });
      
      // Set up ready state change handler
      dataChannelManager.onReadyStateChange((isReady) => {
        this.notifyReadyStateChange();
      });
    }
  }
  
  /**
   * Handle a new data channel from a peer
   * @param dataChannel The data channel received
   * @param peerId The ID of the peer that sent the data channel
   */
  public handleNewDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    this.logger.info(`Handling new data channel from peer ${peerId}`);
    
    // Check if we already have a data channel manager for this peer
    if (this.dataChannelManagers.has(peerId)) {
      this.logger.info(`Using existing data channel manager for peer ${peerId}`);
      const existingManager = this.dataChannelManagers.get(peerId);
      existingManager?.handleNewDataChannel(dataChannel);
      return;
    }
    
    // Create a new data channel manager just for this data channel
    const newManager = new DataChannelManager(null);
    newManager.handleNewDataChannel(dataChannel);
    
    // Store it in our map
    this.dataChannelManagers.set(peerId, newManager);
    
    // If we don't have a primary data channel manager, use this one
    if (!this.primaryDataChannelManager) {
      this.primaryDataChannelManager = newManager;
    }
    
    // Set up the data channel message handler
    newManager.onMessage((message) => {
      this.handleIncomingMessage(message, peerId);
    });
    
    // Set up ready state change handler
    newManager.onReadyStateChange((isReady) => {
      this.notifyReadyStateChange();
    });
    
    this.logger.info(`Added new data channel from peer ${peerId}, total channels: ${this.dataChannelManagers.size}`);
  }

  /**
   * Initialize chat with a data channel
   */
  public async initialize(isInitiator: boolean): Promise<boolean> {
    // Don't try to initialize if we're already initializing or initialized
    if (this.isInitializing) {
      this.logger.info('Chat initialization already in progress');
      // Wait for existing initialization to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isInitializing) {
            clearInterval(checkInterval);
            resolve(this.initialized);
          }
        }, 500);

        // Set a max wait time of 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(this.initialized);
        }, 10000);
      });
    }

    if (this.initialized && this.isReady()) {
      this.logger.info('Chat already initialized and ready');
      return true;
    }

    this.isInitializing = true;
    this.logger.info('Initializing chat, isInitiator:', isInitiator);

    try {
      let overallResult = false;
      
      // Initialize all data channel managers
      if (this.dataChannelManagers.size === 0) {
        this.logger.warn('No data channel managers to initialize');
        this.isInitializing = false;
        return false;
      }
      
      // Try to initialize each data channel manager
      for (const [peerId, manager] of this.dataChannelManagers.entries()) {
        try {
          this.logger.info(`Initializing data channel for peer ${peerId}`);
          const result = await manager.initialize(isInitiator);
          if (result) {
            overallResult = true; // At least one channel initialized successfully
          }
        } catch (error) {
          this.logger.error(`Error initializing data channel for peer ${peerId}:`, error);
          // Continue with other peers even if one fails
        }
      }
      
      this.initialized = overallResult;
      this.isInitializing = false;

      return overallResult;
    } catch (error) {
      this.logger.error('Error initializing chat:', error);
      this.isInitializing = false;
      return false;
    }
  }

  /**
   * Handle incoming messages from a data channel
   */
  private handleIncomingMessage(message: DataChannelMessage, peerId: string): void {
    this.logger.info(`Received chat message from ${message.sender} via peer ${peerId}`);

    const chatMessage: ChatMessage = {
      id: message.id,
      sender: message.sender,
      content: message.content,
      timestamp: message.timestamp,
      isLocal: false,
      peerId, // Include the peer ID that this message came from
    };

    this.messages.push(chatMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(chatMessage);
    }
  }

  /**
   * Send a chat message to all connected peers
   */
  public sendMessage(content: string): ChatMessage | null {
    // Check if any data channel is ready
    if (!this.isReady()) {
      this.logger.error('Chat not ready to send message, no ready data channels');
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

    let anySent = false;
    let channelCount = 0;
    
    // Try to send the message to all connected peers
    for (const [peerId, manager] of this.dataChannelManagers.entries()) {
      if (manager.isReady()) {
        channelCount++;
        try {
          const sent = manager.send(message);
          if (sent) {
            anySent = true;
            this.logger.debug(`Message sent to peer ${peerId}`);
          } else {
            this.logger.warn(`Failed to send message to peer ${peerId}`);
          }
        } catch (error) {
          this.logger.error(`Error sending message to peer ${peerId}:`, error);
        }
      }
    }
    
    this.logger.info(
      `Message sent to ${channelCount} peers out of ${this.dataChannelManagers.size} total connections`
    );

    if (anySent) {
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
   * Notify all ready state change callbacks of the current ready state
   */
  private notifyReadyStateChange(): void {
    const isReady = this.isReady();
    this.logger.debug(`Notifying ready state change: ${isReady}`);
    
    // Notify all callbacks
    this.onReadyStateChangeCallbacks.forEach(callback => {
      try {
        callback(isReady);
      } catch (error) {
        this.logger.error('Error in ready state change callback:', error);
      }
    });
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
    this.onReadyStateChangeCallbacks.add(callback);
    
    // Immediately notify with current ready state
    callback(this.isReady());
    
    // Return a function to unregister the callback
    return () => {
      this.onReadyStateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Get all messages
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Check if chat is ready to send messages to at least one peer
   */
  public isReady(): boolean {
    // We're ready if any data channel manager is ready
    for (const manager of this.dataChannelManagers.values()) {
      if (manager.isReady()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Wait for chat to be ready with any peer (with timeout)
   */
  public waitForReady(timeoutMs = 10000): Promise<boolean> {
    // If already ready, return immediately
    if (this.isReady()) {
      return Promise.resolve(true);
    }
    
    return new Promise((resolve) => {
      // Set up a one-time ready state change handler
      const unregister = this.onReadyStateChange((isReady) => {
        if (isReady) {
          clearTimeout(timeoutId);
          unregister();
          resolve(true);
        }
      });
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        unregister();
        resolve(this.isReady());
      }, timeoutMs);
    });
  }

  /**
   * Close the chat and all data channels
   */
  public close(): void {
    // Close all data channel managers
    for (const [peerId, manager] of this.dataChannelManagers.entries()) {
      this.logger.info(`Closing data channel for peer ${peerId}`);
      manager.close();
    }
    
    // Clear all managers
    this.dataChannelManagers.clear();
    this.primaryDataChannelManager = null;
    
    this.initialized = false;
    this.isInitializing = false;
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
