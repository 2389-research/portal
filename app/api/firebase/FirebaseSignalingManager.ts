/**
 * Firebase Signaling Manager
 * Handles WebRTC signaling through Firebase
 */

import { FirebaseManager } from './FirebaseManager';
import { SignalingMessage } from '../../services/signaling';
import { collection, addDoc, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { createLogger } from '../../services/logger';

export class FirebaseSignalingManager extends FirebaseManager {
  protected logger = createLogger('FirebaseSignaling');

  /**
   * Send a signaling message
   */
  public async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info(`Sending ${message.type} signal in room ${roomId}`);

      // Add timestamp to message
      const timestamp = Date.now();
      const firestoreTimestamp = Timestamp.fromMillis(timestamp);

      const messageWithTimestamp = {
        ...message,
        timestamp: timestamp,
        firestoreTimestamp: firestoreTimestamp,
      };

      // Add message to room's signals collection
      const signalsCollectionRef = collection(db, 'rooms', roomId, 'signals');
      await addDoc(signalsCollectionRef, messageWithTimestamp);

      this.logger.info(`Signal sent successfully`);
    } catch (error) {
      this.logger.error('Error sending signal:', error);
      throw error;
    }
  }

  /**
   * Get signaling messages
   */
  public async getSignals(roomId: string, since: number = 0): Promise<SignalingMessage[]> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info(`Getting signals for room ${roomId} since ${new Date(since).toISOString()}`);

      // Query messages since the given timestamp
      const sinceTimestamp = Timestamp.fromMillis(since);
      const signalsCollectionRef = collection(db, 'rooms', roomId, 'signals');
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

      this.logger.info(`Retrieved ${signals.length} signals`);
      return signals;
    } catch (error) {
      this.logger.error('Error getting signals:', error);
      throw error;
    }
  }
}
