/**
 * WebRTC Manager for Expo
 * This is a React Native-friendly wrapper for the WebRTC API
 * Modified to support per-user peer connections
 */
import { createLogger } from '../logger';
import { PeerConfig } from './PeerConnectionManager';

/**
 * Interface to track media sender information for handling track changes
 */
interface TrackSender {
  track: MediaStreamTrack;
  sender: RTCRtpSender;
  type: 'audio' | 'video' | 'screen';
  mediaStream: MediaStream;
}

/**
 * WebRTCManager class that handles a single peer connection
 */
export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private dataChannel: RTCDataChannel | null = null;
  private peerConfig: PeerConfig;
  private onIceCandidateCallback:
    | ((candidate: RTCIceCandidate, connectionId: string) => void)
    | null = null;
  private onNegotiationNeededCallback: ((connectionId: string) => void) | null = null;
  private onTrackCallback: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onDataChannelCallback: ((channel: RTCDataChannel) => void) | null = null;
  private onTrackRemovedCallback: ((trackId: string, peerId: string) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private currentConnectionId: string | null = null;
  private localSenders: Map<string, TrackSender> = new Map();
  private isRenegotiating: boolean = false;
  private pendingCandidates: RTCIceCandidate[] = [];
  private logger = createLogger('WebRTC');

  constructor(config?: Partial<PeerConfig>) {
    this.peerConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      ...config,
    };

    this.logger.info('Initialized with ICE servers:', JSON.stringify(this.peerConfig.iceServers));
  }

  /**
   * Initialize peer connection
   */
  public async initialize(localStream: MediaStream): Promise<void> {
    this.localStream = localStream;

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.peerConfig);

    // Add all local tracks to the peer connection and track them
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        if (this.peerConnection) {
          const sender = this.peerConnection.addTrack(track, localStream);
          const trackType = track.kind === 'audio' ? 'audio' : 'video';

          // Store the sender for future track operations
          this.localSenders.set(track.id, {
            track,
            sender,
            type: trackType,
            mediaStream: localStream,
          });

          this.logger.info(`Added ${trackType} track to peer connection: ${track.id}`);

          // Setup track ended listener to handle cleanup
          track.onended = () => {
            this.logger.info(`Local track ended: ${track.id}`);
            this.removeTrack(track.id);
          };
        }
      });
    }

    // Generate a new connection ID if we don't have one
    if (!this.currentConnectionId) {
      this.currentConnectionId = this.generateConnectionId();
      this.logger.info('Generated new connection ID:', this.currentConnectionId);
    }

    // Set up event handlers
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback && this.currentConnectionId) {
        if (this.isRenegotiating) {
          // Store candidates during renegotiation to avoid race conditions
          this.pendingCandidates.push(event.candidate);
          this.logger.info('Storing ICE candidate during renegotiation');
        } else {
          this.onIceCandidateCallback(event.candidate, this.currentConnectionId);
        }
      }
    };

    this.peerConnection.onnegotiationneeded = () => {
      if (this.onNegotiationNeededCallback && this.currentConnectionId) {
        this.logger.info('Negotiation needed event triggered');
        this.onNegotiationNeededCallback(this.currentConnectionId);
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (this.onTrackCallback) {
        const stream = event.streams[0];
        const peerId = stream.id;
        this.remoteStreams.set(peerId, stream);

        this.logger.info(
          `Received remote track: ${event.track.id}, kind: ${event.track.kind} from peer: ${peerId}`
        );

        // Listen for track ended events
        event.track.onended = () => {
          this.logger.info(`Remote track ended: ${event.track.id} from peer: ${peerId}`);
          if (this.onTrackRemovedCallback) {
            this.onTrackRemovedCallback(event.track.id, peerId);
          }
        };

        this.onTrackCallback(stream, peerId);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      this.logger.info('Connection state changed:', state);

      if (this.onConnectionStateChangeCallback && state) {
        this.onConnectionStateChangeCallback(state);
      }

      if (state === 'failed') {
        this.logger.warn('WebRTC connection failed, may need to restart ICE');
        // In real implementation, may want to handle reconnection logic here
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      this.logger.info('ICE connection state changed:', this.peerConnection?.iceConnectionState);

      if (this.peerConnection?.iceConnectionState === 'disconnected') {
        this.logger.warn('ICE connection disconnected, may reconnect automatically');
      }

      if (this.peerConnection?.iceConnectionState === 'failed') {
        this.logger.warn('ICE connection failed');
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.logger.info('Data channel received from remote peer:', event.channel.label);
      this.dataChannel = event.channel;

      // Setup data channel event handlers
      this.dataChannel.onopen = () => {
        this.logger.info(`Received data channel '${this.dataChannel?.label}' opened`);
      };

      this.dataChannel.onclose = () => {
        this.logger.info(`Received data channel '${this.dataChannel?.label}' closed`);
      };

      this.dataChannel.onerror = (err) => {
        this.logger.error(`Received data channel '${this.dataChannel?.label}' error:`, err);
      };

      this.logger.info('Received data channel state:', this.dataChannel.readyState);

      if (this.onDataChannelCallback) {
        this.onDataChannelCallback(this.dataChannel);
      }
    };
  }

  /**
   * Update the local stream and add new tracks
   */
  public async updateLocalStream(newLocalStream: MediaStream): Promise<void> {
    if (!this.peerConnection) {
      this.logger.error('Cannot update local stream: Peer connection not initialized');
      return;
    }

    // Store old stream for comparison
    const oldLocalStream = this.localStream;
    this.localStream = newLocalStream;

    // If the old stream is null, just initialize with the new stream
    if (!oldLocalStream) {
      this.logger.info('No previous local stream, adding all tracks from new stream');
      newLocalStream.getTracks().forEach((track) => {
        this.addTrack(track, newLocalStream, track.kind === 'audio' ? 'audio' : 'video');
      });
      return;
    }

    // Compare old and new streams to handle track changes
    const oldTracks = oldLocalStream.getTracks();
    const newTracks = newLocalStream.getTracks();

    // Remove tracks that are in old stream but not in new stream
    for (const oldTrack of oldTracks) {
      const matchingNewTrack = newTracks.find(
        (newTrack) => newTrack.kind === oldTrack.kind && newTrack.id !== oldTrack.id
      );

      if (!matchingNewTrack) {
        // No matching track in new stream, remove it
        this.logger.info(`Removing track ${oldTrack.id} as it's not in the new stream`);
        this.removeTrack(oldTrack.id);
      } else if (matchingNewTrack.id !== oldTrack.id) {
        // Replace the old track with the matching new track
        this.logger.info(`Replacing track ${oldTrack.id} with ${matchingNewTrack.id}`);
        this.replaceTrack(oldTrack.id, matchingNewTrack);
      }
      // If the track is unchanged (same ID), do nothing
    }

    // Add any completely new tracks from the new stream
    for (const newTrack of newTracks) {
      const hasMatchingOldTrack = oldTracks.some((oldTrack) => oldTrack.kind === newTrack.kind);
      
      if (!hasMatchingOldTrack) {
        // This is a new track kind not in the old stream
        this.logger.info(`Adding new track ${newTrack.id} from updated stream`);
        this.addTrack(
          newTrack,
          newLocalStream,
          newTrack.kind === 'audio' ? 'audio' : 'video'
        );
      }
    }
  }

  /**
   * Get the current connection state
   */
  public getConnectionState(): RTCPeerConnectionState {
    if (!this.peerConnection) {
      return 'closed';
    }
    return this.peerConnection.connectionState;
  }

  /**
   * Create and set up a data channel
   */
  public createDataChannel(label: string): RTCDataChannel | null {
    if (!this.peerConnection) {
      this.logger.error('Peer connection not initialized when creating data channel');
      return null;
    }

    try {
      this.logger.info('Creating data channel with label:', label);

      // Create the data channel with specific options
      this.dataChannel = this.peerConnection.createDataChannel(label, {
        ordered: true, // Guarantee message order
        maxRetransmits: 30, // Allow up to 30 retransmission attempts
      });

      // Setup data channel event handlers
      this.dataChannel.onopen = () => {
        this.logger.info(`Data channel '${label}' opened`);
      };

      this.dataChannel.onclose = () => {
        this.logger.info(`Data channel '${label}' closed`);
      };

      this.dataChannel.onerror = (event) => {
        this.logger.error(`Data channel '${label}' error:`, event);
      };

      this.logger.info('Data channel created successfully, state:', this.dataChannel.readyState);
      return this.dataChannel;
    } catch (error) {
      this.logger.error('Error creating data channel:', error);
      return null;
    }
  }

  /**
   * Create and send an offer to a remote peer
   */
  public async createOffer(): Promise<{ offer: RTCSessionDescriptionInit; connectionId: string }> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    // Generate a new connection ID for this offer
    this.currentConnectionId = this.generateConnectionId();
    this.logger.info('Generated new connection ID for offer:', this.currentConnectionId);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return {
      offer: offer,
      connectionId: this.currentConnectionId,
    };
  }

  /**
   * Generate a unique connection ID for WebRTC signaling
   */
  private generateConnectionId(): string {
    // Generate a random string to use as connection ID
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Process an offer received from a remote peer
   */
  public async processOffer(
    offer: RTCSessionDescriptionInit,
    connectionId: string
  ): Promise<{ answer: RTCSessionDescriptionInit; connectionId: string }> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    // Store the connection ID from the offer
    this.currentConnectionId = connectionId;
    this.logger.info('Using connection ID from offer:', connectionId);

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return {
      answer: answer,
      connectionId: connectionId,
    };
  }

  /**
   * Process an answer received from a remote peer
   */
  public async processAnswer(
    answer: RTCSessionDescriptionInit,
    connectionId: string
  ): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    // Verify the connection ID matches the current connection
    if (this.currentConnectionId !== connectionId) {
      this.logger.warn(
        `Connection ID mismatch. Expected: ${this.currentConnectionId}, Received: ${connectionId}`
      );
      // Still proceed with the answer since it might be a valid connection
    } else {
      this.logger.info('Processing answer with matching connection ID:', connectionId);
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

    // If we were in the middle of renegotiation, complete it
    if (this.isRenegotiating) {
      this.logger.info('Completing renegotiation after processing answer');
      await this.completeRenegotiation();
    }
  }

  /**
   * Add a remote ICE candidate
   */
  public async addIceCandidate(candidate: RTCIceCandidate, connectionId: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    // Verify the connection ID matches the current connection
    if (this.currentConnectionId !== connectionId) {
      this.logger.warn(
        `ICE candidate connection ID mismatch. Expected: ${this.currentConnectionId}, Received: ${connectionId}`
      );
      // If the connection ID doesn't match, we might want to skip this candidate
      // but for backward compatibility we'll still add it
    } else {
      this.logger.info('Adding ICE candidate with matching connection ID:', connectionId);
    }

    await this.peerConnection.addIceCandidate(candidate);
  }

  /**
   * Get local stream
   */
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get remote streams
   */
  public getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  /**
   * Close the peer connection
   */
  public close(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Don't stop local stream tracks here since they may be shared with other connections
    // Just clear our reference to them
    this.localStream = null;
    this.remoteStreams.clear();
    this.dataChannel = null;
    this.localSenders.clear();
  }

  /**
   * Set callbacks
   */
  public setOnIceCandidate(
    callback: (candidate: RTCIceCandidate, connectionId: string) => void
  ): void {
    this.onIceCandidateCallback = callback;
  }

  /**
   * Get the current connection ID
   */
  public getCurrentConnectionId(): string | null {
    return this.currentConnectionId;
  }

  public setOnNegotiationNeeded(callback: (connectionId: string) => void): void {
    this.onNegotiationNeededCallback = callback;
  }

  public setOnTrack(callback: (stream: MediaStream, peerId: string) => void): void {
    this.onTrackCallback = callback;
  }

  public setOnDataChannel(callback: (channel: RTCDataChannel) => void): void {
    this.onDataChannelCallback = callback;
  }

  /**
   * Set callback for when a track is removed
   */
  public setOnTrackRemoved(callback: (trackId: string, peerId: string) => void): void {
    this.onTrackRemovedCallback = callback;
  }

  /**
   * Set callback for connection state changes
   */
  public setOnConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChangeCallback = callback;
  }

  /**
   * Add a new track to the peer connection
   * This will trigger renegotiation
   */
  public async addTrack(
    track: MediaStreamTrack,
    stream: MediaStream,
    type: 'audio' | 'video' | 'screen' = 'video'
  ): Promise<boolean> {
    if (!this.peerConnection) {
      this.logger.error('Cannot add track: Peer connection not initialized');
      return false;
    }

    try {
      // Check if we already have this track
      if (this.localSenders.has(track.id)) {
        this.logger.warn(`Track ${track.id} already exists in the connection`);
        return true;
      }

      // Add the track to the peer connection
      const sender = this.peerConnection.addTrack(track, stream);

      // Store the sender for future operations
      this.localSenders.set(track.id, {
        track,
        sender,
        type,
        mediaStream: stream,
      });

      this.logger.info(`Added ${type} track to peer connection: ${track.id}`);

      // Setup track ended listener
      track.onended = () => {
        this.logger.info(`Track ended: ${track.id}`);
        this.removeTrack(track.id);
      };

      // The negotiationneeded event will trigger automatically

      return true;
    } catch (error) {
      this.logger.error('Error adding track:', error);
      return false;
    }
  }

  /**
   * Remove a track from the peer connection
   * This will trigger renegotiation
   */
  public removeTrack(trackId: string): boolean {
    if (!this.peerConnection) {
      this.logger.error('Cannot remove track: Peer connection not initialized');
      return false;
    }

    try {
      const senderInfo = this.localSenders.get(trackId);
      if (!senderInfo) {
        this.logger.warn(`Track ${trackId} not found in local senders`);
        return false;
      }

      // Remove the track from the peer connection
      this.peerConnection.removeTrack(senderInfo.sender);

      // Remove from our sender map
      this.localSenders.delete(trackId);

      this.logger.info(`Removed track: ${trackId}`);

      // The negotiationneeded event will trigger automatically

      return true;
    } catch (error) {
      this.logger.error('Error removing track:', error);
      return false;
    }
  }

  /**
   * Replace a track with a new track
   * This is useful for switching devices without renegotiation
   */
  public replaceTrack(oldTrackId: string, newTrack: MediaStreamTrack): boolean {
    if (!this.peerConnection) {
      this.logger.error('Cannot replace track: Peer connection not initialized');
      return false;
    }

    try {
      const senderInfo = this.localSenders.get(oldTrackId);
      if (!senderInfo) {
        this.logger.warn(`Track ${oldTrackId} not found in local senders`);
        return false;
      }

      // Replace the track
      senderInfo.sender.replaceTrack(newTrack);

      // Update our sender map with the new track
      this.localSenders.set(newTrack.id, {
        track: newTrack,
        sender: senderInfo.sender,
        type: senderInfo.type,
        mediaStream: senderInfo.mediaStream,
      });

      // Remove the old track entry
      if (oldTrackId !== newTrack.id) {
        this.localSenders.delete(oldTrackId);
      }

      this.logger.info(`Replaced track ${oldTrackId} with ${newTrack.id}`);

      return true;
    } catch (error) {
      this.logger.error('Error replacing track:', error);
      return false;
    }
  }

  /**
   * Toggle a specific track type (audio or video)
   */
  public toggleTrack(type: 'audio' | 'video' | 'screen'): boolean {
    if (!this.peerConnection) {
      this.logger.error('Cannot toggle track: Peer connection not initialized');
      return false;
    }

    let trackEnabled = false;
    let trackFound = false;

    // Find all tracks of the specified type and toggle them
    this.localSenders.forEach((senderInfo, trackId) => {
      if (senderInfo.type === type) {
        trackFound = true;
        senderInfo.track.enabled = !senderInfo.track.enabled;
        trackEnabled = senderInfo.track.enabled;
        this.logger.info(
          `Toggled ${type} track ${trackId} to ${trackEnabled ? 'enabled' : 'disabled'}`
        );
      }
    });

    if (!trackFound) {
      this.logger.warn(`No ${type} track found to toggle`);
    }

    return trackEnabled;
  }

  /**
   * Add a screen share track to the peer connection
   */
  public async addScreenShareTrack(stream: MediaStream): Promise<boolean> {
    if (!this.peerConnection) {
      this.logger.error('Cannot add screen share: Peer connection not initialized');
      return false;
    }

    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        this.logger.error('No video track found in screen share stream');
        return false;
      }

      return this.addTrack(videoTrack, stream, 'screen');
    } catch (error) {
      this.logger.error('Error adding screen share track:', error);
      return false;
    }
  }

  /**
   * Remove screen share track
   */
  public removeScreenShareTrack(): boolean {
    let success = false;

    // Find and remove all screen type tracks
    this.localSenders.forEach((senderInfo, trackId) => {
      if (senderInfo.type === 'screen') {
        const removed = this.removeTrack(trackId);
        if (removed) {
          success = true;
        }
      }
    });

    return success;
  }

  /**
   * Handle renegotiation by creating a new offer
   * Called when tracks are added or removed
   */
  public async handleRenegotiation(): Promise<{
    offer: RTCSessionDescriptionInit;
    connectionId: string;
  } | null> {
    if (!this.peerConnection) {
      this.logger.error('Cannot renegotiate: Peer connection not initialized');
      return null;
    }

    try {
      // Set the renegotiation flag to handle ICE candidates correctly
      this.isRenegotiating = true;
      this.pendingCandidates = [];

      this.logger.info('Starting renegotiation with connection ID:', this.currentConnectionId);

      // Create an offer with the current connection ID
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      return {
        offer: offer,
        connectionId: this.currentConnectionId || this.generateConnectionId(),
      };
    } catch (error) {
      this.logger.error('Error during renegotiation:', error);
      this.isRenegotiating = false;
      return null;
    }
  }

  /**
   * Complete renegotiation after receiving an answer
   * and send any pending ICE candidates
   */
  public async completeRenegotiation(): Promise<void> {
    if (
      this.isRenegotiating &&
      this.pendingCandidates.length > 0 &&
      this.onIceCandidateCallback &&
      this.currentConnectionId
    ) {
      this.logger.info(
        `Sending ${this.pendingCandidates.length} pending ICE candidates after renegotiation`
      );

      // Send all pending candidates
      for (const candidate of this.pendingCandidates) {
        this.onIceCandidateCallback(candidate, this.currentConnectionId);
      }

      // Clear pending candidates
      this.pendingCandidates = [];
    }

    this.isRenegotiating = false;
  }
}