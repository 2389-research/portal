/**
 * Firebase Authentication Manager
 * Handles user authentication operations
 */

import { FirebaseManager } from './FirebaseManager';
import { UserInfo } from '../ApiInterface';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { createLogger } from '../../services/logger';

export class FirebaseAuthManager extends FirebaseManager {
  private user: User | null = null;
  private authStateChangeListeners: ((user: User | null) => void)[] = [];
  protected logger = createLogger('FirebaseAuth');

  /**
   * Wait for authentication state to be resolved on connect
   */
  public async connect(): Promise<void> {
    await super.connect();

    if (!this.app) {
      throw new Error('Firebase app not initialized');
    }

    // Initialize authentication
    const auth = getAuth(this.app);
    this.user = auth.currentUser;

    this.logger.info(
      'Current auth state on connect:',
      this.user ? `Authenticated as ${this.user.displayName}` : 'Not authenticated'
    );

    // Wait for the initial auth state to be determined
    await new Promise<void>((resolve) => {
      // Set up auth state change listener
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        this.logger.info(
          'Auth state changed:',
          user ? `Authenticated as ${user.displayName}` : 'Not authenticated'
        );

        this.user = user;

        // Notify all listeners
        this.authStateChangeListeners.forEach((listener) => listener(user));

        // We only need this callback once to resolve the promise
        unsubscribe();
        resolve();
      });

      // If we already have the auth state, resolve immediately
      if (auth.currentUser !== null || auth.currentUser === null) {
        this.logger.info('Auth state already determined');
        resolve();
      }
    });
  }

  /**
   * Sign in with Google
   */
  public async signInWithGoogle(): Promise<UserInfo> {
    if (!this.app) throw new Error('Not connected to Firebase');

    try {
      const auth = getAuth(this.app);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      this.user = result.user;

      return this.mapUserToUserInfo(result.user);
    } catch (error) {
      this.logger.error('Error signing in with Google:', error);
      throw error;
    }
  }

  /**
   * Sign out
   */
  public async signOut(): Promise<void> {
    if (!this.app) throw new Error('Not connected to Firebase');

    try {
      const auth = getAuth(this.app);
      await signOut(auth);
      this.user = null;
    } catch (error) {
      this.logger.error('Error signing out:', error);
      throw error;
    }
  }

  /**
   * Get current user
   */
  public getCurrentUser(): UserInfo | null {
    if (!this.user) return null;
    return this.mapUserToUserInfo(this.user);
  }

  /**
   * Check if user is signed in
   */
  public isSignedIn(): boolean {
    return this.user !== null;
  }

  /**
   * Add auth state change listener
   */
  public onAuthStateChanged(listener: (user: UserInfo | null) => void): () => void {
    if (!this.app) throw new Error('Not connected to Firebase');

    const wrappedListener = (user: User | null) => {
      if (user) {
        listener(this.mapUserToUserInfo(user));
      } else {
        listener(null);
      }
    };

    this.authStateChangeListeners.push(wrappedListener);

    const auth = getAuth(this.app);
    return onAuthStateChanged(auth, (user) => {
      this.user = user;
      wrappedListener(user);
    });
  }

  /**
   * Get the current user ID, or generate one if not signed in
   */
  public getUserId(): string {
    // Use Firebase user ID if available, otherwise generate a random ID
    if (this.user) {
      return this.user.uid;
    }

    // Generate a UUID-like string for anonymous users
    return this.generateRandomId('user');
  }

  /**
   * Map Firebase User to UserInfo interface
   */
  private mapUserToUserInfo(user: User): UserInfo {
    return {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };
  }
}