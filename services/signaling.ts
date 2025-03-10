/**
 * Signaling Service for WebRTC
 * Adapts signaling to work with Expo
 */

import type { ApiInterface } from '../api/ApiInterface';
import { createLogger } from './logger';

export interface SignalingMessage {
  type: string;
  sender: string;
  receiver?: string;
  roomId: string;
  data: any;
  timestamp?: number; // Add timestamp property
  connectionId?: string; // Unique ID to group related WebRTC signaling messages
}

export class SignalingService {
  private apiClient: ApiInterface;
  private roomId: string | null = null;
  private userId: string | null = null;
  private messageHandlers: Map<string, (message: SignalingMessage) => void> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastMessageTime = 0;
  private logger = createLogger('Signaling');

  constructor(apiClient: ApiInterface) {
    this.apiClient = apiClient;
  }

  /**
   * Join a room
   */
  public async joinRoom(roomId: string): Promise<string> {
    try {
      // Cleanup any existing room connection first
      if (this.roomId) {
        this.logger.info(
          `Already in room ${this.roomId}, leaving before joining new room ${roomId}`
        );
        await this.leaveRoom();
      }

      // Reset state
      this.lastMessageTime = Date.now();
      this.messageHandlers.clear();

      // Validate room ID
      if (!roomId || typeof roomId !== 'string') {
        this.logger.error('Invalid room ID:', roomId);
        throw new Error('Room ID is required and must be a string');
      }

      this.logger.info('Joining room via API:', roomId);

      // Join the room via API
      const result = await this.apiClient.joinRoom(roomId);

      if (!result || !result.userId) {
        throw new Error('Invalid response from joinRoom API call');
      }

      this.roomId = roomId;
      this.userId = result.userId;

      this.logger.info('Room joined successfully, userId:', this.userId);

      // Announce joining to others by sending a user-joined message
      try {
        await this.sendMessage('user-joined', { userId: this.userId });
        this.logger.info('Sent user-joined message to room');
      } catch (announcementError) {
        this.logger.warn('Error sending user-joined announcement:', announcementError);
        // Continue despite announcement error
      }

      // Stop any existing polling
      this.stopPolling();

      // Start new polling
      this.logger.info('Starting message polling');
      this.startPolling();

      return this.userId;
    } catch (error: unknown) {
      this.logger.error('Error joining room:', error);

      // Clean up state in case of error
      this.roomId = null;
      this.userId = null;
      this.stopPolling();

      // Provide more specific error information
      if (typeof error === 'object' && error !== null && 'message' in error) {
        throw new Error(`Signaling error: ${(error as { message: string }).message}`);
      }
      throw new Error('Failed to join room via signaling service.');
    }
  }

  /**
   * Create a new room
   */
  public async createRoom(): Promise<{ roomId: string; userId: string }> {
    try {
      // Create room via API
      const result = await this.apiClient.createRoom();
      this.roomId = result.roomId;
      this.userId = result.userId;

      // Start polling for messages
      this.startPolling();

      return result;
    } catch (error) {
      this.logger.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Send a signaling message
   */
  public async sendMessage(
    type: string,
    data: any,
    receiver?: string,
    forceRoomId?: string,
    forceSenderId?: string,
    extraFields?: Record<string, any>
  ): Promise<void> {
    // Allow force sending with specific room and user IDs (used when leaving a room)
    const roomId = forceRoomId || this.roomId;
    const userId = forceSenderId || this.userId;

    if (!roomId || !userId) {
      this.logger.error('Cannot send message, not connected to a room');
      throw new Error('Not connected to a room');
    }

    const message: SignalingMessage = {
      type,
      sender: userId,
      roomId: roomId,
      data,
      timestamp: Date.now(), // Add timestamp to outgoing messages
    };

    if (receiver) {
      message.receiver = receiver;
    }

    // Add any extra fields to the message (like connectionId)
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        // @ts-ignore: We're intentionally adding dynamic properties from extraFields
        message[key] = value;
      });

      // Log if there's a connection ID (useful for WebRTC debugging)
      if (extraFields.connectionId) {
        this.logger.info(`Sending message with connection ID: ${extraFields.connectionId}`);
      }
    }

    try {
      this.logger.info(`Sending message type: ${type} to room: ${roomId}`);
      await this.apiClient.sendSignal(roomId, message);
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Register a handler for a specific message type
   */
  public on(type: string, handler: (message: SignalingMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Remove a handler for a specific message type
   */
  public off(type: string): void {
    this.messageHandlers.delete(type);
  }

  /**
   * Start polling for new messages
   */
  private startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.lastMessageTime = Date.now();

    // Poll every 1 second
    this.pollingInterval = setInterval(async () => {
      await this.pollMessages();
    }, 1000);
  }

  /**
   * Stop polling for messages
   */
  private stopPolling(): void {
    this.logger.info('Stopping polling. Current polling state:', this.isPolling);

    // Always try to clear the interval, even if isPolling is false
    if (this.pollingInterval) {
      this.logger.info('Clearing polling interval');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Reset the polling state
    this.isPolling = false;

    this.logger.info('Polling stopped');
  }

  /**
   * Poll for new messages
   */
  private async pollMessages(): Promise<void> {
    if (!this.roomId || !this.userId) {
      this.logger.info('Cannot poll messages: not connected to a room');
      return;
    }

    try {
      const pollStartTime = Date.now();
      this.logger.debug(
        'Polling for messages since:',
        new Date(this.lastMessageTime).toISOString()
      );

      // Add extra context in logs
      this.logger.debug(
        `Room ID: ${this.roomId}, User ID: ${this.userId}, Last message time: ${this.lastMessageTime}`
      );

      // Get signals from the API
      const messages = await this.apiClient.getSignals(this.roomId, this.lastMessageTime);

      // Calculate polling latency for monitoring
      const pollLatency = Date.now() - pollStartTime;
      this.logger.debug(`Polling took ${pollLatency}ms to complete`);

      // Log the activity even if no messages
      if (messages.length === 0) {
        this.logger.debug('No new messages');
        return;
      }

      this.logger.info(`Received ${messages.length} new messages`);

      // Enhance timestamp handling - add explicit type checking and fallbacks
      const timestamps = messages
        .map((m) => {
          // Handle different timestamp formats
          if (typeof m.timestamp === 'number' && m.timestamp > 0) {
            return m.timestamp;
          } else if (
            typeof m.timestamp === 'object' &&
            m.timestamp !== null &&
            'getTime' in m.timestamp
          ) {
            // Safely handle Date objects
            return (m.timestamp as Date).getTime();
          } else {
            this.logger.warn(`Invalid timestamp format in message: ${JSON.stringify(m)}`);
            return 0;
          }
        })
        .filter((t) => t > 0);

      if (timestamps.length > 0) {
        const newLastMessageTime = Math.max(...timestamps);
        // Only update if it's newer
        if (newLastMessageTime > this.lastMessageTime) {
          this.lastMessageTime = newLastMessageTime;
          this.logger.debug(
            'Updated lastMessageTime to:',
            new Date(this.lastMessageTime).toISOString()
          );
        }
      }

      // Process messages with improved error handling
      for (const message of messages) {
        try {
          // Validate message format
          if (!message.type) {
            this.logger.warn('Skipping message with missing type');
            continue;
          }

          if (!message.sender) {
            this.logger.warn(`Skipping message of type ${message.type} with missing sender`);
            continue;
          }

          // Skip messages sent by this user
          if (message.sender === this.userId) {
            this.logger.debug('Skipping own message of type:', message.type);
            continue;
          }

          // Skip messages not intended for this user
          if (message.receiver && message.receiver !== this.userId) {
            this.logger.debug('Skipping message intended for:', message.receiver);
            continue;
          }

          // Handle the message
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            this.logger.info(
              `Processing message of type: ${message.type}, from: ${message.sender}`
            );
            try {
              handler(message);
            } catch (handlerError) {
              this.logger.error(`Error in message handler for type: ${message.type}`, handlerError);
            }
          } else {
            this.logger.debug('No handler registered for message type:', message.type);
          }
        } catch (messageError) {
          this.logger.error('Error processing message:', messageError);
          this.logger.debug('Problematic message:', JSON.stringify(message));
        }
      }
    } catch (error) {
      this.logger.error('Error polling messages:', error);
      // Don't break polling on errors - the next poll will happen as scheduled
    }
  }

  /**
   * Leave the current room
   */
  public async leaveRoom(): Promise<void> {
    this.logger.info('Leaving room, roomId:', this.roomId, 'userId:', this.userId);

    // Always stop polling, even if not in a room
    this.stopPolling();

    if (!this.roomId || !this.userId) {
      this.logger.info('Not connected to a room, nothing to leave');
      return;
    }

    try {
      // Save room and user ID for API calls
      const roomIdToLeave = this.roomId;
      const userIdToLeave = this.userId;

      // Clear state immediately to prevent any more polling
      this.roomId = null;
      this.userId = null;

      // Notify other users that we're leaving
      this.logger.info('Sending user-left message');
      try {
        await this.sendMessage(
          'user-left',
          { userId: userIdToLeave },
          undefined,
          roomIdToLeave,
          userIdToLeave
        );
      } catch (sendError) {
        this.logger.error('Error sending leave message:', sendError);
        // Continue with leaving even if the message fails
      }

      // Leave the room via API
      this.logger.info('Calling API leaveRoom');
      await this.apiClient.leaveRoom(roomIdToLeave, userIdToLeave);

      // Clear all handlers
      this.messageHandlers.clear();

      this.logger.info('Successfully left room');
    } catch (error) {
      this.logger.error('Error leaving room:', error);

      // Make sure state is reset even on error
      this.roomId = null;
      this.userId = null;
      this.messageHandlers.clear();
    }
  }

  /**
   * Get room ID
   */
  public getRoomId(): string | null {
    return this.roomId;
  }

  /**
   * Get user ID
   */
  public getUserId(): string | null {
    return this.userId;
  }
}
