/**
 * Firebase API Client for WebRTC signaling
 */

import { initializeApp, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import { ApiInterface, RoomResponse, JoinRoomResponse, UserInfo } from './ApiInterface';
import { SignalingMessage } from '../services/signaling';
import { createLogger } from '../services/logger';

export class FirebaseApiClient implements ApiInterface {
  public app: FirebaseApp | null = null; // Made public for testing
  public db: Firestore | null = null; // Made public for testing
  private config: FirebaseOptions;
  public user: User | null = null; // Made public for testing
  private authStateChangeListeners: ((user: User | null) => void)[] = [];
  private logger = createLogger('Firebase');

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

      // Initialize authentication
      const auth = getAuth(this.app);
      this.user = auth.currentUser;

      this.logger.info(
        'Current auth state on connect:',
        this.user ? `Authenticated as ${this.user.displayName}` : 'Not authenticated'
      );

      // Wait for the initial auth state to be determined
      return new Promise<void>((resolve) => {
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
  }

  /**
   * Create a new room
   */
  public async createRoom(): Promise<RoomResponse> {
    if (!this.db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info('Creating new room');
      this.logger.info('Current user:', this.user ? this.user.displayName : 'Not signed in');

      // Generate room ID
      const roomId = this.generateRoomId();
      this.logger.info('Generated room ID:', roomId);

      // Generate user ID
      const userId = this.generateUserId();
      this.logger.info('Generated user ID:', userId);

      // Create timestamp
      const created = Date.now();
      const createdTimestamp = Timestamp.fromMillis(created);

      // Create room in Firestore
      const roomRef = doc(this.db, 'rooms', roomId);
      this.logger.info('Creating room document in Firestore');
      await setDoc(roomRef, {
        created: createdTimestamp,
        createdBy: userId,
        active: true,
      });

      // Add user to room
      this.logger.info('Adding user to room');
      const userRef = doc(this.db, 'rooms', roomId, 'users', userId);
      await setDoc(userRef, {
        joined: createdTimestamp,
        active: true,
      });

      this.logger.info('Room created successfully:', roomId);

      return {
        roomId,
        userId,
        created,
      };
    } catch (error) {
      this.logger.error('Error creating room:', error);

      // Extract and log the detailed error
      if (error.code) {
        this.logger.error('Error code:', error.code);
      }

      if (error.message) {
        this.logger.error('Error message:', error.message);
      }

      throw error;
    }
  }

  /**
   * Join an existing room
   */
  public async joinRoom(roomId: string): Promise<JoinRoomResponse> {
    if (!this.db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info('Joining room:', roomId);
      this.logger.info('Current user:', this.user ? this.user.displayName : 'Not signed in');

      // Check if room exists
      const roomRef = doc(this.db, 'rooms', roomId);
      this.logger.info('Checking if room exists');
      const roomSnapshot = await getDoc(roomRef);

      this.logger.info('Room exists:', roomSnapshot.exists());

      if (!roomSnapshot.exists()) {
        this.logger.info('Room does not exist, creating it');

        // If room doesn't exist, create it (this is different from the original behavior)
        const userId = this.generateUserId();
        const created = Date.now();
        const createdTimestamp = Timestamp.fromMillis(created);

        // Create room in Firestore
        await setDoc(roomRef, {
          created: createdTimestamp,
          createdBy: userId,
          active: true,
        });

        // Add user to room
        const userRef = doc(this.db, 'rooms', roomId, 'users', userId);
        await setDoc(userRef, {
          joined: createdTimestamp,
          active: true,
        });

        this.logger.info('Room created with ID:', roomId, 'and user ID:', userId);

        return {
          userId,
          joined: created,
        };
      }

      // If room exists, generate user ID
      const userId = this.generateUserId();
      this.logger.info('Generated user ID:', userId);

      // Create timestamp
      const joined = Date.now();
      const joinedTimestamp = Timestamp.fromMillis(joined);

      // Add user to room
      this.logger.info('Adding user to room');
      const userRef = doc(this.db, 'rooms', roomId, 'users', userId);
      await setDoc(userRef, {
        joined: joinedTimestamp,
        active: true,
      });

      this.logger.info('Successfully joined room');

      return {
        userId,
        joined,
      };
    } catch (error) {
      this.logger.error('Error joining room:', error);

      // Extract and log the detailed error
      if (error.code) {
        this.logger.error('Error code:', error.code);
      }

      if (error.message) {
        this.logger.error('Error message:', error.message);
      }

      throw error;
    }
  }

  /**
   * Leave a room
   */
  public async leaveRoom(roomId: string, userId: string): Promise<void> {
    if (!this.db) throw new Error('Not connected to Firebase');

    try {
      // Mark user as inactive
      const userRef = doc(this.db, 'rooms', roomId, 'users', userId);
      await setDoc(
        userRef,
        {
          active: false,
          left: Timestamp.fromMillis(Date.now()),
        },
        { merge: true }
      );
    } catch (error) {
      this.logger.error('Error leaving room:', error);
      throw error;
    }
  }

  /**
   * Send a signaling message
   */
  public async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    if (!this.db) throw new Error('Not connected to Firebase');

    try {
      // Add timestamp to message
      const timestamp = Date.now();
      const firestoreTimestamp = Timestamp.fromMillis(timestamp);

      const messageWithTimestamp = {
        ...message,
        timestamp: timestamp,
        firestoreTimestamp: firestoreTimestamp,
      };

      // Add message to room's signals collection
      const signalsCollectionRef = collection(this.db, 'rooms', roomId, 'signals');
      await addDoc(signalsCollectionRef, messageWithTimestamp);
    } catch (error) {
      this.logger.error('Error sending signal:', error);
      throw error;
    }
  }

  /**
   * Get signaling messages
   */
  public async getSignals(roomId: string, since: number = 0): Promise<SignalingMessage[]> {
    if (!this.db) throw new Error('Not connected to Firebase');

    try {
      // Query messages since the given timestamp
      const sinceTimestamp = Timestamp.fromMillis(since);
      const signalsCollectionRef = collection(this.db, 'rooms', roomId, 'signals');
      const signalsQuery = query(
        signalsCollectionRef,
        where('firestoreTimestamp', '>', sinceTimestamp),
        orderBy('firestoreTimestamp')
      );

      // Get signals
      const snapshot = await getDocs(signalsQuery);
      const signals: SignalingMessage[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        signals.push({
          type: data.type,
          sender: data.sender,
          receiver: data.receiver,
          roomId: data.roomId,
          data: data.data,
          timestamp: data.timestamp,
        });
      });

      return signals;
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
    if (!this.app) throw new Error('Not connected to Firebase');

    try {
      const auth = getAuth(this.app);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      this.user = result.user;

      return {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
      };
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

    return {
      uid: this.user.uid,
      displayName: this.user.displayName,
      email: this.user.email,
      photoURL: this.user.photoURL,
    };
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
        listener({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        });
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
   * Generate a user ID
   */
  private generateUserId(): string {
    // Use Firebase user ID if available, otherwise generate a random ID
    if (this.user) {
      return this.user.uid;
    }

    // Generate a UUID-like string for anonymous users
    return 'user_' + Math.random().toString(36).substring(2, 15);
  }
}
