/**
 * Data Channel Manager
 * Handles WebRTC data channel creation and management
 * 
 * This class can work in two modes:
 * 1. With a WebRTCManager to create and manage data channels
 * 2. With an externally provided data channel
 */

import { createLogger } from '../logger';
import type { WebRTCManager } from '../webrtc';

export interface DataChannelMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}

export class DataChannelManager {
  private dataChannel: RTCDataChannel | null = null;
  private webrtcManager: WebRTCManager | null = null;
  private onMessageCallback: ((message: DataChannelMessage) => void) | null = null;
  private onReadyStateChangeCallbacks: ((isReady: boolean) => void)[] = [];
  private logger = createLogger('DataChannel');
  private isInitializing = false;
  private channelName = 'chat';
  private initialized = false;

  /**
   * Create a new DataChannelManager
   * @param webrtcManager Optional WebRTCManager to use for creating data channels. 
   * If null, the manager will work with externally provided data channels.
   */
  constructor(webrtcManager: WebRTCManager | null) {
    this.webrtcManager = webrtcManager;
  }
  
  /**
   * Handle a newly received data channel
   * @param channel The data channel to manage
   */
  public handleNewDataChannel(channel: RTCDataChannel): void {
    this.logger.info(`Handling externally provided data channel: ${channel.label}`);
    
    // If we already have a data channel, check if we should replace it
    if (this.dataChannel) {
      if (this.dataChannel.readyState === 'open') {
        this.logger.info('Keeping existing open data channel');
        return;
      }
      
      // Close the existing channel if it's not open
      this.dataChannel.close();
    }
    
    // Use the new channel
    this.dataChannel = channel;
    this.setupDataChannel();
    this.initialized = true;
  }

  /**
   * Initialize data channel
   */
  public async initialize(isInitiator: boolean): Promise<boolean> {
    // If already initialized or initializing, don't try again
    if (this.initialized || this.isInitializing) {
      this.logger.info('Data channel already initialized or initializing');
      return this.isReady();
    }
    
    // If we already have a data channel (externally provided), just check if it's ready
    if (this.dataChannel) {
      const isReady = this.dataChannel.readyState === 'open';
      this.initialized = isReady;
      this.logger.info(`Using existing data channel, ready state: ${isReady}`);
      return isReady;
    }

    // If we don't have a WebRTC manager and no data channel, we can't initialize
    if (!this.webrtcManager) {
      this.logger.error('Cannot initialize: No WebRTC manager and no data channel provided');
      return false;
    }

    this.isInitializing = true;
    this.logger.info('Initializing data channel, isInitiator:', isInitiator);

    try {
      if (isInitiator) {
        // Create data channel as the initiator
        this.logger.info('Creating data channel as initiator');

        // Create the data channel and set up event handlers
        this.dataChannel = this.webrtcManager.createDataChannel(this.channelName);

        if (!this.dataChannel) {
          this.logger.error('Failed to create data channel');
          this.isInitializing = false;
          return false;
        }

        this.setupDataChannel();

        // Wait for the channel to be open or timeout
        const ready = await this.waitForChannelReady(10000);
        this.logger.info('Data channel ready state after initialization:', ready);
        this.initialized = ready;
        this.isInitializing = false;
        return ready;
      } else {
        // Register for data channel callback as non-initiator
        return new Promise((resolve) => {
          // Set up callback to receive the data channel
          this.webrtcManager?.setOnDataChannel((channel) => {
            this.logger.info('Received data channel in callback:', channel.label);
            if (channel.label === this.channelName) {
              this.dataChannel = channel;
              this.setupDataChannel();

              // Wait for the channel to be ready after receiving it
              this.waitForChannelReady(10000).then((ready) => {
                this.logger.info('Non-initiator data channel ready state:', ready);
                this.initialized = ready;
                this.isInitializing = false;
                resolve(ready);
              });
            }
          });

          // Set a timeout in case we never receive a data channel
          const timeoutId = setTimeout(() => {
            if (!this.dataChannel) {
              this.logger.error('Timed out waiting to receive data channel');
              // No need to unregister, not returning a function
              this.isInitializing = false;
              resolve(false);
            }
          }, 15000);

          // Store the timeout ID for possible cleanup
          this.timeoutId = timeoutId;
        });
      }
    } catch (error) {
      this.logger.error('Error initializing data channel:', error);
      this.isInitializing = false;
      return false;
    }
  }

  private timeoutId: any = null;

  /**
   * Set up data channel event handlers
   */
  private setupDataChannel(): void {
    if (!this.dataChannel) {
      this.logger.error('Cannot setup null data channel');
      return;
    }

    this.logger.info('Setting up data channel handlers for channel:', this.dataChannel.label);

    this.dataChannel.onmessage = (event) => {
      try {
        this.logger.info(
          'Received message:',
          typeof event.data === 'string'
            ? event.data.substring(0, 50) + (event.data.length > 50 ? '...' : '')
            : 'Non-text message'
        );

        let data: DataChannelMessage;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          this.logger.error('Error parsing data channel message:', error);
          return;
        }

        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } catch (error) {
        this.logger.error('Error handling data channel message:', error);
      }
    };

    this.dataChannel.onopen = () => {
      this.logger.info('Data channel opened. Channel state:', this.dataChannel?.readyState);
      // Notify all ready state change listeners
      this.notifyReadyStateChange(true);
    };

    this.dataChannel.onclose = () => {
      this.logger.info('Data channel closed. Channel state:', this.dataChannel?.readyState);
      // Notify all ready state change listeners
      this.notifyReadyStateChange(false);
    };

    this.dataChannel.onerror = (error) => {
      this.logger.error('Data channel error:', error);
      // Notify listeners on error, assuming channel might not be usable
      this.notifyReadyStateChange(false);
    };

    // Log the current state
    this.logger.info('Data channel initial state:', this.dataChannel.readyState);

    // Notify about initial state in case it's already open
    if (this.dataChannel.readyState === 'open') {
      this.notifyReadyStateChange(true);
    }
  }

  /**
   * Notify all ready state change listeners
   */
  private notifyReadyStateChange(isReady: boolean): void {
    this.logger.info('Notifying ready state change listeners, isReady:', isReady);
    for (const callback of this.onReadyStateChangeCallbacks) {
      try {
        callback(isReady);
      } catch (error) {
        this.logger.error('Error in ready state change callback:', error);
      }
    }
  }

  /**
   * Send a message on the data channel
   */
  public send(message: DataChannelMessage): boolean {
    // Detailed check for data channel state
    if (!this.dataChannel) {
      this.logger.error('Data channel not initialized yet');
      return false;
    }

    if (this.dataChannel.readyState !== 'open') {
      this.logger.error(`Data channel not open, current state: ${this.dataChannel.readyState}`);
      return false;
    }

    try {
      this.logger.info(
        'Sending message on data channel:',
        message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '')
      );

      this.dataChannel.send(JSON.stringify(message));
      this.logger.info('Message sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Error sending message on data channel:', error);
      return false;
    }
  }

  /**
   * Set message callback
   */
  public onMessage(callback: (message: DataChannelMessage) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Register a callback to be notified when the data channel ready state changes
   */
  public onReadyStateChange(callback: (isReady: boolean) => void): () => void {
    this.onReadyStateChangeCallbacks.push(callback);

    // If we already have a data channel, immediately notify with current state
    if (this.dataChannel) {
      const isReady = this.dataChannel.readyState === 'open';
      setTimeout(() => callback(isReady), 0);
    }

    // Return a function to unregister this callback
    return () => {
      this.onReadyStateChangeCallbacks = this.onReadyStateChangeCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Check if data channel is open
   */
  public isReady(): boolean {
    if (!this.dataChannel) {
      return false;
    }

    return this.dataChannel.readyState === 'open';
  }

  /**
   * Wait for data channel to open (with timeout)
   */
  public waitForChannelReady(timeoutMs = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isReady()) {
        this.logger.info('Data channel already open');
        resolve(true);
        return;
      }

      this.logger.info('Waiting for data channel to open...');

      // Set a timeout to avoid waiting indefinitely
      const timeout = setTimeout(() => {
        this.logger.info('Timed out waiting for data channel to open');
        cleanup();
        resolve(false);
      }, timeoutMs);

      // Check if we have a data channel to monitor
      if (!this.dataChannel) {
        this.logger.info('No data channel to monitor');
        clearTimeout(timeout);
        resolve(false);
        return;
      }

      // Create a one-time event handler for the open event
      const openHandler = () => {
        this.logger.info('Data channel opened while waiting');
        cleanup();
        resolve(true);
      };

      // Function to clean up event listeners and timeouts
      const cleanup = () => {
        clearTimeout(timeout);
        if (this.dataChannel) {
          this.dataChannel.removeEventListener('open', openHandler);
        }
      };

      // Add the event listener
      this.dataChannel.addEventListener('open', openHandler);
    });
  }

  /**
   * Close the data channel
   */
  public close(): void {
    // Clear any pending timeouts
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
      // Notify listeners that the channel is closed
      this.notifyReadyStateChange(false);
    }

    // Clear all callbacks as part of cleanup
    this.onMessageCallback = null;
    this.onReadyStateChangeCallbacks = [];
    this.initialized = false;
    this.isInitializing = false;
  }
}
