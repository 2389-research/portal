/**
 * Firebase Room Manager
 * Handles room creation, joining, and management
 */

import { FirebaseManager } from './FirebaseManager';
import { RoomResponse, JoinRoomResponse } from '../ApiInterface';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { createLogger } from '../../services/logger';

export class FirebaseRoomManager extends FirebaseManager {
  protected logger = createLogger('FirebaseRoom');

  /**
   * Create a new room
   */
  public async createRoom(userId: string): Promise<RoomResponse> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info('Creating new room');
      this.logger.info('User ID:', userId);

      // Generate room ID
      const roomId = this.generateRoomId();
      this.logger.info('Generated room ID:', roomId);

      // Create timestamp
      const created = Date.now();
      const createdTimestamp = Timestamp.fromMillis(created);

      // Create room in Firestore
      const roomRef = doc(db, 'rooms', roomId);
      this.logger.info('Creating room document in Firestore');
      await setDoc(roomRef, {
        created: createdTimestamp,
        createdBy: userId,
        active: true,
      });

      // Add user to room
      this.logger.info('Adding user to room');
      const userRef = doc(db, 'rooms', roomId, 'users', userId);
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
      throw error;
    }
  }

  /**
   * Join an existing room
   */
  public async joinRoom(roomId: string, userId: string): Promise<JoinRoomResponse> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info('Joining room:', roomId);
      this.logger.info('User ID:', userId);

      // Check if room exists
      const roomRef = doc(db, 'rooms', roomId);
      this.logger.info('Checking if room exists');
      const roomSnapshot = await getDoc(roomRef);

      this.logger.info('Room exists:', roomSnapshot.exists());

      if (!roomSnapshot.exists()) {
        this.logger.info('Room does not exist, creating it');

        // If room doesn't exist, create it
        const created = Date.now();
        const createdTimestamp = Timestamp.fromMillis(created);

        // Create room in Firestore
        await setDoc(roomRef, {
          created: createdTimestamp,
          createdBy: userId,
          active: true,
        });

        // Add user to room
        const userRef = doc(db, 'rooms', roomId, 'users', userId);
        await setDoc(userRef, {
          joined: createdTimestamp,
          active: true,
        });

        this.logger.info('Room created with ID:', roomId);

        return {
          userId,
          joined: created,
        };
      }

      // If room exists, add user to it
      const joined = Date.now();
      const joinedTimestamp = Timestamp.fromMillis(joined);

      // Add user to room
      this.logger.info('Adding user to existing room');
      const userRef = doc(db, 'rooms', roomId, 'users', userId);
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
      throw error;
    }
  }

  /**
   * Leave a room
   */
  public async leaveRoom(roomId: string, userId: string): Promise<void> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info('Leaving room:', roomId, 'User:', userId);
      
      // Mark user as inactive
      const userRef = doc(db, 'rooms', roomId, 'users', userId);
      await setDoc(
        userRef,
        {
          active: false,
          left: Timestamp.fromMillis(Date.now()),
        },
        { merge: true }
      );
      
      this.logger.info('Successfully left room');
    } catch (error) {
      this.logger.error('Error leaving room:', error);
      throw error;
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
}