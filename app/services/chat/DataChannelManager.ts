/**
 * Data Channel Manager
 * Handles WebRTC data channel creation and management
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
  private webrtcManager: WebRTCManager;
  private onMessageCallback: ((message: DataChannelMessage) => void) | null = null;
  private logger = createLogger('DataChannel');

  constructor(webrtcManager: WebRTCManager) {
    this.webrtcManager = webrtcManager;
  }

  /**
   * Initialize data channel
   */
  public async initialize(isInitiator: boolean): Promise<boolean> {
    this.logger.info('Initializing data channel, isInitiator:', isInitiator);

    if (isInitiator) {
      // Create data channel as the initiator
      this.logger.info('Creating data channel as initiator');
      this.dataChannel = this.webrtcManager.createDataChannel('chat');

      if (!this.dataChannel) {
        this.logger.error('Failed to create data channel');
        return false;
      }

      this.setupDataChannel();

      // Wait for the channel to be ready
      const ready = await this.waitForChannelReady(15000);
      this.logger.info('Data channel ready state after initialization:', ready);
      return ready;
    }
    // Create a promise that will resolve when the data channel is ready
    return new Promise((resolve) => {
      // Set up callback to receive the data channel
      this.webrtcManager.setOnDataChannel((channel) => {
        this.logger.info('Received data channel in callback');
        this.dataChannel = channel;
        this.setupDataChannel();

        // Wait for the channel to be ready after receiving it
        this.waitForChannelReady(15000).then((ready) => {
          this.logger.info('Non-initiator data channel ready state:', ready);
          resolve(ready);
        });
      });

      // Set a timeout in case we never receive a data channel
      setTimeout(() => {
        if (!this.dataChannel) {
          this.logger.error('Timed out waiting to receive data channel');
          resolve(false);
        }
      }, 20000);
    });
  }

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
          event.data.substring(0, 50) + (event.data.length > 50 ? '...' : '')
        );
        const data = JSON.parse(event.data);

        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } catch (error) {
        this.logger.error('Error parsing data channel message:', error);
      }
    };

    this.dataChannel.onopen = () => {
      this.logger.info('Data channel opened. Channel state:', this.dataChannel?.readyState);
    };

    this.dataChannel.onclose = () => {
      this.logger.info('Data channel closed. Channel state:', this.dataChannel?.readyState);
    };

    this.dataChannel.onerror = (error) => {
      this.logger.error('Data channel error:', error);
    };

    // Log the current state
    this.logger.info('Data channel initial state:', this.dataChannel.readyState);
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
   * Check if data channel is open
   */
  public isReady(): boolean {
    if (!this.dataChannel) {
      this.logger.info('Data channel is null, not ready');
      return false;
    }

    const isChannelOpen = this.dataChannel.readyState === 'open';

    if (!isChannelOpen) {
      this.logger.info(
        'Data channel is not in open state, current state:',
        this.dataChannel.readyState
      );
    }

    return isChannelOpen;
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
        clearTimeout(timeout);
        this.dataChannel?.removeEventListener('open', openHandler);
        resolve(true);
      };

      // Add the event listener
      this.dataChannel.addEventListener('open', openHandler);
    });
  }

  /**
   * Close the data channel
   */
  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
  }
}
