/**
 * Mock API Client for testing
 */

import type { SignalingMessage } from '../services/signaling';
import type { ApiInterface, JoinRoomResponse, RoomResponse } from './ApiInterface';

interface MockRoom {
  roomId: string;
  created: number;
  createdBy: string;
  users: Record<string, { joined: number; active: boolean }>;
  signals: SignalingMessage[];
}

export class MockApiClient implements ApiInterface {
  private connected = false;
  private rooms: Record<string, MockRoom> = {};

  /**
   * Connect to mock API
   */
  public async connect(): Promise<void> {
    this.connected = true;
    console.log('Connected to Mock API');
  }

  /**
   * Disconnect from mock API
   */
  public async disconnect(): Promise<void> {
    this.connected = false;
    console.log('Disconnected from Mock API');
  }

  /**
   * Create a new mock room
   */
  public async createRoom(): Promise<RoomResponse> {
    this.ensureConnected();

    // Generate room ID
    const roomId = this.generateRoomId();

    // Generate user ID
    const userId = this.generateUserId();

    // Create timestamp
    const created = Date.now();

    // Create mock room
    this.rooms[roomId] = {
      roomId,
      created,
      createdBy: userId,
      users: {
        [userId]: { joined: created, active: true },
      },
      signals: [],
    };

    return {
      roomId,
      userId,
      created,
    };
  }

  /**
   * Join a mock room
   */
  public async joinRoom(roomId: string): Promise<JoinRoomResponse> {
    this.ensureConnected();

    // Check if room exists
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    // Generate user ID
    const userId = this.generateUserId();

    // Create timestamp
    const joined = Date.now();

    // Add user to room
    room.users[userId] = {
      joined,
      active: true,
    };

    return {
      userId,
      joined,
    };
  }

  /**
   * Leave a mock room
   */
  public async leaveRoom(roomId: string, userId: string): Promise<void> {
    this.ensureConnected();

    // Check if room exists
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    // Check if user exists in room
    const user = room.users[userId];
    if (!user) {
      throw new Error(`User ${userId} not found in room ${roomId}`);
    }

    // Mark user as inactive
    user.active = false;
  }

  /**
   * Send a mock signal
   */
  public async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    this.ensureConnected();

    // Check if room exists
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    // Add timestamp to message
    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now(),
    };

    // Add message to room's signals
    room.signals.push(messageWithTimestamp);
  }

  /**
   * Get mock signals
   */
  public async getSignals(roomId: string, since = 0): Promise<SignalingMessage[]> {
    this.ensureConnected();

    // Check if room exists
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    // Filter signals by timestamp
    return room.signals.filter((signal) => (signal.timestamp || 0) > since);
  }

  /**
   * Get the name of the API provider
   */
  public getProviderName(): string {
    return 'Mock';
  }

  /**
   * Ensure the client is connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to Mock API');
    }
  }

  /**
   * Generate a random room ID
   */
  private generateRoomId(): string {
    // Generate a 6-character alphanumeric ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate a random user ID
   */
  private generateUserId(): string {
    // Generate a UUID-like string
    return `mock_user_${Math.random().toString(36).substring(2, 15)}`;
  }
}
