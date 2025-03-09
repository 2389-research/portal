/**
 * Firebase API Client for WebRTC signaling
 * Uses specialized managers for different concerns
 */

import { FirebaseOptions } from 'firebase/app';
import { ApiInterface, RoomResponse, JoinRoomResponse, UserInfo } from '../ApiInterface';
import { SignalingMessage } from '../../services/signaling';
import { FirebaseAuthManager } from './FirebaseAuthManager';
import { FirebaseRoomManager } from './FirebaseRoomManager';
import { FirebaseSignalingManager } from './FirebaseSignalingManager';
import { createLogger } from '../../services/logger';

export class FirebaseApiClient implements ApiInterface {
  private authManager: FirebaseAuthManager;
  private roomManager: FirebaseRoomManager;
  private signalingManager: FirebaseSignalingManager;
  private logger = createLogger('FirebaseApi');

  constructor(config: FirebaseOptions) {
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
      const userId = this.authManager.getUserId();
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
      const userId = this.authManager.getUserId();
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
      return await this.authManager.signInWithGoogle();
    } catch (error) {
      this.logger.error('Error signing in with Google:', error);
      throw error;
    }
  }
  
  /**
   * Sign in anonymously with a specific UUID
   */
  public async signInAnonymously(uuid?: string, displayName?: string): Promise<UserInfo> {
    try {
      return await this.authManager.signInAnonymously(uuid, displayName);
    } catch (error) {
      this.logger.error('Error signing in anonymously:', error);
      throw error;
    }
  }

  /**
   * Sign out
   */
  public async signOut(): Promise<void> {
    try {
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
    return this.authManager.getCurrentUser();
  }

  /**
   * Check if user is signed in
   */
  public isSignedIn(): boolean {
    return this.authManager.isSignedIn();
  }

  /**
   * Add auth state change listener
   */
  public onAuthStateChanged(listener: (user: UserInfo | null) => void): () => void {
    return this.authManager.onAuthStateChanged(listener);
  }
}