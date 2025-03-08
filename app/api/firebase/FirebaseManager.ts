/**
 * Base Firebase manager class that handles app initialization and connection
 * Uses protected fields and public accessors for better encapsulation
 */

import { initializeApp, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { createLogger } from '../../services/logger';

export class FirebaseManager {
  protected app: FirebaseApp | null = null;
  protected db: Firestore | null = null;
  protected config: FirebaseOptions;
  protected logger = createLogger('Firebase');

  constructor(config: FirebaseOptions) {
    this.config = config;
  }

  /**
   * Connect to Firebase
   */
  public async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Firebase');

      // Initialize Firebase app if not already initialized
      try {
        this.app = getApp();
        this.logger.info('Using existing Firebase app');
      } catch {
        this.logger.info('Initializing new Firebase app');
        this.app = initializeApp(this.config);
      }

      // Get Firestore reference
      this.db = getFirestore(this.app);
      this.logger.info('Firebase connected successfully');
    } catch (error) {
      this.logger.error('Error connecting to Firebase:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Firebase
   */
  public async disconnect(): Promise<void> {
    // Firestore doesn't require explicit cleanup for basic usage
    this.db = null;
    this.logger.info('Disconnected from Firebase');
  }

  /**
   * Get the Firebase app instance
   * @returns The Firebase app instance or null if not connected
   */
  public getApp(): FirebaseApp | null {
    return this.app;
  }

  /**
   * Get the Firestore database instance
   * @returns The Firestore database instance or null if not connected
   */
  public getDb(): Firestore | null {
    return this.db;
  }

  /**
   * Generate a random ID
   */
  protected generateRandomId(prefix: string, length: number = 12): string {
    // Generate a random alphanumeric ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = prefix + '_';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}