/**
 * API Interface for WebRTC signaling and room management
 */

import type { SignalingMessage } from '../services/signaling';

export interface RoomResponse {
  roomId: string;
  userId: string;
  created: number;
}

export interface JoinRoomResponse {
  userId: string;
  joined: number;
}

export interface UserInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface ApiInterface {
  /**
   * Create a new room
   */
  createRoom(): Promise<RoomResponse>;

  /**
   * Join an existing room
   */
  joinRoom(roomId: string): Promise<JoinRoomResponse>;

  /**
   * Leave a room
   */
  leaveRoom(roomId: string, userId: string): Promise<void>;

  /**
   * Send a signaling message
   */
  sendSignal(roomId: string, message: SignalingMessage): Promise<void>;

  /**
   * Get signaling messages
   */
  getSignals(roomId: string, since?: number): Promise<SignalingMessage[]>;

  /**
   * Connect to the API
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the API
   */
  disconnect(): Promise<void>;

  /**
   * Get the name of the API provider
   */
  getProviderName(): string;

  /**
   * Sign in with Google (Firebase only)
   * Returns null if not supported by the provider
   */
  signInWithGoogle?(): Promise<UserInfo>;

  /**
   * Sign out (Firebase only)
   * No-op if not supported by the provider
   */
  signOut?(): Promise<void>;

  /**
   * Get current user (Firebase only)
   * Returns null if not supported by the provider or not signed in
   */
  getCurrentUser?(): UserInfo | null;

  /**
   * Check if user is signed in (Firebase only)
   * Returns false if not supported by the provider
   */
  isSignedIn?(): boolean;

  /**
   * Add auth state change listener (Firebase only)
   * Returns a function to remove the listener
   * No-op if not supported by the provider
   */
  onAuthStateChanged?(listener: (user: UserInfo | null) => void): () => void;
}
