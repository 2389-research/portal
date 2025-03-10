/**
 * Firebase Signaling Manager
 * Handles WebRTC signaling through Firebase
 */

import { Timestamp, addDoc, collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { createLogger } from '../../services/logger';
import type { SignalingMessage } from '../../services/signaling';
import { FirebaseManager } from './FirebaseManager';

export class FirebaseSignalingManager extends FirebaseManager {
  protected logger = createLogger('FirebaseSignaling');

  /**
   * Send a signaling message
   */
  public async sendSignal(roomId: string, message: SignalingMessage): Promise<void> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    // Validate essential parameters
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid room ID');
    }

    try {
      this.logger.info(`Sending ${message.type} signal in room ${roomId}`);

      // Normalize message properties
      message.roomId = roomId; // Ensure roomId is set correctly

      // Add timestamp to message
      const timestamp = Date.now();
      const firestoreTimestamp = Timestamp.fromMillis(timestamp);

      // Add detailed debug logging
      this.logger.debug('Message data before adding to Firestore:', JSON.stringify(message.data));

      const messageWithTimestamp = {
        ...message,
        timestamp: timestamp, // Use numeric timestamp for the 'timestamp' field
        // This is what we query against in getSignals
      };

      // Add message to room's signals collection
      const signalsCollectionRef = collection(db, 'rooms', roomId, 'signals');

      this.logger.info(`Adding message to collection: rooms/${roomId}/signals`);
      const docRef = await addDoc(signalsCollectionRef, messageWithTimestamp);

      this.logger.info(`Signal sent successfully with ID: ${docRef.id}`);
    } catch (error) {
      this.logger.error('Error sending signal:', error);
      this.logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  /**
   * Get signaling messages
   */
  public async getSignals(roomId: string, since = 0): Promise<SignalingMessage[]> {
    const db = this.getDb();
    if (!db) throw new Error('Not connected to Firebase');

    try {
      this.logger.info(`Getting signals for room ${roomId} since ${new Date(since).toISOString()}`);

      // Ensure roomId is valid
      if (!roomId || typeof roomId !== 'string') {
        this.logger.error('Invalid room ID:', roomId);
        return [];
      }

      // Query messages since the given timestamp
      const sinceTimestamp = Timestamp.fromMillis(since);
      const signalsCollectionRef = collection(db, 'rooms', roomId, 'signals');

      // Query only by timestamp without ordering to simplify query
      // This can help with potential index issues
      const signalsQuery = query(signalsCollectionRef, where('timestamp', '>', since));

      // Add more detailed logging for debugging
      this.logger.info(
        `Query details: collection path = rooms/${roomId}/signals, timestamp > ${since}`
      );

      // Get signals
      const snapshot = await getDocs(signalsQuery);
      const signals: SignalingMessage[] = [];

      this.logger.info(`Raw query results: ${snapshot.size} documents found`);

      // Process each document
      snapshot.forEach((doc) => {
        try {
          const data = doc.data();
          this.logger.debug(`Processing signal document ${doc.id}:`, data);

          // Only include valid messages that have the required fields
          if (data.type && data.sender && data.roomId && data.data !== undefined) {
            signals.push({
              type: data.type,
              sender: data.sender,
              receiver: data.receiver,
              roomId: data.roomId,
              data: data.data,
              timestamp: data.timestamp,
            });
          } else {
            this.logger.warn(
              `Skipping invalid signal document ${doc.id} - missing required fields`
            );
          }
        } catch (docError) {
          this.logger.error(`Error processing document ${doc.id}:`, docError);
        }
      });

      this.logger.info(
        `Retrieved ${signals.length} valid signals out of ${snapshot.size} documents`
      );
      return signals;
    } catch (error) {
      this.logger.error('Error getting signals:', error);
      this.logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      // Return empty array instead of throwing to make error handling more robust
      return [];
    }
  }
}
