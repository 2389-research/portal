/**
 * Firebase API Client for WebRTC signaling
 * A unified implementation that combines features from all prior versions
 * and properly encapsulates Firebase-specific implementation details
 */

import { FirebaseApp, FirebaseOptions } from 'firebase/app';
import { User } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { ApiInterface, RoomResponse, JoinRoomResponse, UserInfo } from './ApiInterface';
import { SignalingMessage } from '../services/signaling';
import { createLogger } from '../services/logger';
import { FirebaseAuthManager } from './firebase/FirebaseAuthManager';
import { FirebaseRoomManager } from './firebase/FirebaseRoomManager';
import { FirebaseSignalingManager } from './firebase/FirebaseSignalingManager';

export class FirebaseApiClient implements ApiInterface {
  // Private manager instances that handle specific concerns
  private authManager: FirebaseAuthManager;
  private roomManager: FirebaseRoomManager;
  private signalingManager: FirebaseSignalingManager;
  private logger = createLogger('Firebase');

  constructor(config: FirebaseOptions) {
    // Create the specialized managers
    this.authManager = new FirebaseAuthManager(config);
    this.roomManager = new FirebaseRoomManager(config);
    this.signalingManager = new FirebaseSignalingManager(config);
  }

  /**
   * Connect to Firebase
   */
  public async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Firebase services');

      // Connect all managers in parallel for better performance
      await Promise.all([
        this.authManager.connect(),
        this.roomManager.connect(),
        this.signalingManager.connect(),
      ]);

      this.logger.info('All Firebase services connected');
    } catch (error) {
      this.logger.error('Error connecting to Firebase:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Firebase
   */
  public async disconnect(): Promise<void> {
    try {
      this.logger.info('Disconnecting from Firebase services');

      // Disconnect all managers in parallel
      await Promise.all([
        this.authManager.disconnect(),
        this.roomManager.disconnect(),
        this.signalingManager.disconnect(),
      ]);

      this.logger.info('All Firebase services disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from Firebase:', error);
      throw error;
    }
  }

  /**
   * Create a new room
   */
  public async createRoom(): Promise<RoomResponse> {
    try {
      // Get current user ID from auth manager
      const userId = this.authManager.getUserId();

      // Use room manager to create the room
      return await this.roomManager.createRoom(userId);
    } catch (error) {
      this.logger.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Join an existing room
   */
  public async joinRoom(roomId: string): Promise<JoinRoomResponse> {
    try {
      // Get current user ID from auth manager
      const userId = this.authManager.getUserId();

      // Use room manager to join the room
      return await this.roomManager.joinRoom(roomId, userId);
    } catch (error) {
      this.logger.error('Error joining room:', error);
      throw error;
    }
  }

  /**
   * Leave a room
   */
  public async leaveRoom(roomId: string, userId: string): Promise<void> {
    try {
      // Use room manager to leave the room
      await this.roomManager.leaveRoom(roomId, userId);
    } catch (error) {
      this.logger.error('Error leaving room:', error);
      throw error;
    }
  }

  /**
   * Send a signaling message
   */
  public async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    try {
      // Use signaling manager to send the signal
      await this.signalingManager.sendSignal(roomId, message);
    } catch (error) {
      this.logger.error('Error sending signal:', error);
      throw error;
    }
  }

  /**
   * Get signaling messages
   */
  public async getSignals(roomId: string, since: number = 0): Promise<SignalingMessage[]> {
    try {
      // Use signaling manager to get signals
      return await this.signalingManager.getSignals(roomId, since);
    } catch (error) {
      this.logger.error('Error getting signals:', error);
      throw error;
    }
  }

  /**
   * Get the name of the API provider
   */
  public getProviderName(): string {
    return 'Firebase';
  }

  /**
   * Sign in with Google
   */
  public async signInWithGoogle(): Promise<UserInfo> {
    try {
      // Use auth manager to sign in
      return await this.authManager.signInWithGoogle();
    } catch (error) {
      this.logger.error('Error signing in with Google:', error);
      throw error;
    }
  }

  /**
   * Sign out
   */
  public async signOut(): Promise<void> {
    try {
      // Use auth manager to sign out
      await this.authManager.signOut();
    } catch (error) {
      this.logger.error('Error signing out:', error);
      throw error;
    }
  }

  /**
   * Get current user
   */
  public getCurrentUser(): UserInfo | null {
    // Use auth manager to get current user
    return this.authManager.getCurrentUser();
  }

  /**
   * Check if user is signed in
   */
  public isSignedIn(): boolean {
    // Use auth manager to check signed in status
    return this.authManager.isSignedIn();
  }

  /**
   * Add auth state change listener
   */
  public onAuthStateChanged(listener: (user: UserInfo | null) => void): () => void {
    // Use auth manager to handle auth state changes
    return this.authManager.onAuthStateChanged(listener);
  }

  /**
   * Get Firebase app instance (for testing/mocking)
   */
  public getApp(): FirebaseApp | null {
    return this.authManager.getApp();
  }

  /**
   * Get Firestore instance (for testing/mocking)
   */
  public getDb(): Firestore | null {
    return this.authManager.getDb();
  }

  /**
   * Get current Firebase user (for testing/mocking)
   */
  public getFirebaseUser(): User | null {
    return this.authManager.getFirebaseUser();
  }
}
