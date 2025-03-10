/**
 * PeerConnectionManager for Expo
 * Manages multiple WebRTC connections - one per remote peer
 */
import { createLogger } from '../logger';
import { WebRTCManager } from './WebRTCManager';

export interface PeerConfig {
  iceServers: RTCIceServer[];
}

/**
 * Class that manages multiple WebRTC connections - one for each remote peer
 */
export class PeerConnectionManager {
  private peerConnections: Map<string, WebRTCManager> = new Map();
  private localStream: MediaStream | null = null;
  private peerConfig: PeerConfig;
  private onIceCandidateCallback:
    | ((candidate: RTCIceCandidate, peerId: string, connectionId: string) => void)
    | null = null;
  private onTrackCallback: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onDataChannelCallback: ((channel: RTCDataChannel, peerId: string) => void) | null = null;
  private onTrackRemovedCallback: ((trackId: string, peerId: string) => void) | null = null;
  private onPeerConnectionStateChangeCallback: ((peerId: string, state: RTCPeerConnectionState) => void) | null = null;
  private onNegotiationNeededCallback: ((peerId: string, connectionId: string) => void) | null = null;
  private logger = createLogger('PeerConnectionManager');

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
   * Set the local stream that will be used for all connections
   */
  public setLocalStream(localStream: MediaStream): void {
    this.localStream = localStream;
    this.logger.info('Local stream set with tracks:', localStream.getTracks().length);

    // Update existing peer connections with the new local stream
    for (const [peerId, peerConnection] of this.peerConnections.entries()) {
      this.logger.info(`Updating existing peer connection for ${peerId} with new local stream`);
      peerConnection.updateLocalStream(localStream);
    }
  }

  /**
   * Get the local stream
   */
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get all remote streams from all peer connections
   */
  public getAllRemoteStreams(): Map<string, MediaStream> {
    const allStreams = new Map<string, MediaStream>();
    
    // Collect streams from all peer connections
    this.peerConnections.forEach((peerConnection, peerId) => {
      const peerStreams = peerConnection.getRemoteStreams();
      peerStreams.forEach((stream, streamId) => {
        // Use the peer ID as the key
        allStreams.set(peerId, stream);
      });
    });
    
    return allStreams;
  }

  /**
   * Create a peer connection for a specific remote peer
   */
  public createPeerConnection(peerId: string): WebRTCManager | null {
    if (this.peerConnections.has(peerId)) {
      this.logger.warn(`Peer connection for ${peerId} already exists`);
      return this.peerConnections.get(peerId) || null;
    }

    if (!this.localStream) {
      this.logger.error(`Cannot create peer connection for ${peerId} without a local stream`);
      return null;
    }

    try {
      // Create a new WebRTCManager for this peer
      const peerConnection = new WebRTCManager(this.peerConfig);
      
      this.logger.info(`Creating new peer connection for ${peerId}`);

      // Initialize the peer connection with the local stream
      peerConnection.initialize(this.localStream)
        .then(() => {
          this.logger.info(`Peer connection for ${peerId} initialized successfully`);
          
          // Set up callbacks for this peer connection
          this.setupPeerConnectionCallbacks(peerConnection, peerId);
        })
        .catch(error => {
          this.logger.error(`Failed to initialize peer connection for ${peerId}:`, error);
          this.peerConnections.delete(peerId);
        });

      // Store the peer connection
      this.peerConnections.set(peerId, peerConnection);
      
      return peerConnection;
    } catch (error) {
      this.logger.error(`Error creating peer connection for ${peerId}:`, error);
      return null;
    }
  }

  /**
   * Get a specific peer connection
   */
  public getPeerConnection(peerId: string): WebRTCManager | null {
    return this.peerConnections.get(peerId) || null;
  }

  /**
   * Check if a peer connection exists
   */
  public hasPeerConnection(peerId: string): boolean {
    return this.peerConnections.has(peerId);
  }

  /**
   * Remove a peer connection
   */
  public removePeerConnection(peerId: string): boolean {
    if (!this.peerConnections.has(peerId)) {
      this.logger.warn(`Cannot remove: No peer connection for ${peerId} exists`);
      return false;
    }

    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (peerConnection) {
        // Close the connection properly
        peerConnection.close();
        this.logger.info(`Closed peer connection for ${peerId}`);
      }

      // Remove from the map
      this.peerConnections.delete(peerId);
      this.logger.info(`Removed peer connection for ${peerId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error removing peer connection for ${peerId}:`, error);
      return false;
    }
  }

  /**
   * Close all peer connections
   */
  public closeAllConnections(): void {
    this.logger.info(`Closing all peer connections (${this.peerConnections.size} connections)`);
    
    // Close each peer connection
    for (const [peerId, peerConnection] of this.peerConnections.entries()) {
      try {
        peerConnection.close();
        this.logger.info(`Closed peer connection for ${peerId}`);
      } catch (error) {
        this.logger.error(`Error closing peer connection for ${peerId}:`, error);
      }
    }

    // Clear the map
    this.peerConnections.clear();
    
    // Don't stop the local stream here as it may be shared across components
  }

  /**
   * Create and send an offer to a remote peer
   */
  public async createOffer(peerId: string): Promise<{ offer: RTCSessionDescriptionInit; connectionId: string } | null> {
    // Get or create the peer connection
    let peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.info(`No existing connection for ${peerId}, creating a new one`);
      peerConnection = this.createPeerConnection(peerId);
      
      if (!peerConnection) {
        this.logger.error(`Failed to create peer connection for ${peerId}`);
        return null;
      }
    }

    try {
      // Create the offer
      this.logger.info(`Creating offer for ${peerId}`);
      const result = await peerConnection.createOffer();
      return result;
    } catch (error) {
      this.logger.error(`Error creating offer for ${peerId}:`, error);
      return null;
    }
  }

  /**
   * Process an offer from a remote peer
   */
  public async processOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit,
    connectionId: string
  ): Promise<{ answer: RTCSessionDescriptionInit; connectionId: string } | null> {
    // Get or create the peer connection
    let peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.info(`No existing connection for ${peerId}, creating a new one to process offer`);
      peerConnection = this.createPeerConnection(peerId);
      
      if (!peerConnection) {
        this.logger.error(`Failed to create peer connection for ${peerId} to process offer`);
        return null;
      }
    }

    try {
      // Process the offer
      this.logger.info(`Processing offer from ${peerId} with connection ID ${connectionId}`);
      const result = await peerConnection.processOffer(offer, connectionId);
      return result;
    } catch (error) {
      this.logger.error(`Error processing offer from ${peerId}:`, error);
      return null;
    }
  }

  /**
   * Process an answer from a remote peer
   */
  public async processAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit,
    connectionId: string
  ): Promise<boolean> {
    const peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.error(`Cannot process answer: No peer connection for ${peerId} exists`);
      return false;
    }

    try {
      // Process the answer
      this.logger.info(`Processing answer from ${peerId} with connection ID ${connectionId}`);
      await peerConnection.processAnswer(answer, connectionId);
      return true;
    } catch (error) {
      this.logger.error(`Error processing answer from ${peerId}:`, error);
      return false;
    }
  }

  /**
   * Add an ICE candidate for a specific peer
   */
  public async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidate,
    connectionId: string
  ): Promise<boolean> {
    const peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.error(`Cannot add ICE candidate: No peer connection for ${peerId} exists`);
      return false;
    }

    try {
      // Add the ICE candidate
      this.logger.info(`Adding ICE candidate for ${peerId} with connection ID ${connectionId}`);
      await peerConnection.addIceCandidate(candidate, connectionId);
      return true;
    } catch (error) {
      this.logger.error(`Error adding ICE candidate for ${peerId}:`, error);
      return false;
    }
  }

  /**
   * Handle renegotiation for a specific peer
   */
  public async handleRenegotiation(peerId: string): Promise<{
    offer: RTCSessionDescriptionInit;
    connectionId: string;
  } | null> {
    const peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.error(`Cannot handle renegotiation: No peer connection for ${peerId} exists`);
      return null;
    }

    try {
      // Handle renegotiation
      this.logger.info(`Handling renegotiation for ${peerId}`);
      const result = await peerConnection.handleRenegotiation();
      return result;
    } catch (error) {
      this.logger.error(`Error handling renegotiation for ${peerId}:`, error);
      return null;
    }
  }

  /**
   * Create a data channel for a specific peer
   */
  public createDataChannel(peerId: string, label: string): RTCDataChannel | null {
    const peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      this.logger.error(`Cannot create data channel: No peer connection for ${peerId} exists`);
      return null;
    }

    try {
      // Create the data channel
      this.logger.info(`Creating data channel "${label}" for ${peerId}`);
      return peerConnection.createDataChannel(label);
    } catch (error) {
      this.logger.error(`Error creating data channel for ${peerId}:`, error);
      return null;
    }
  }

  /**
   * Add a track to all peer connections
   */
  public async addTrackToAllPeers(
    track: MediaStreamTrack,
    stream: MediaStream,
    type: 'audio' | 'video' | 'screen' = 'video'
  ): Promise<boolean> {
    if (this.peerConnections.size === 0) {
      this.logger.warn('No peer connections to add track to');
      return false;
    }

    let success = true;
    const failedPeers: string[] = [];

    // Add the track to each peer connection
    for (const [peerId, peerConnection] of this.peerConnections.entries()) {
      try {
        const result = await peerConnection.addTrack(track, stream, type);
        if (!result) {
          this.logger.warn(`Failed to add ${type} track to peer ${peerId}`);
          failedPeers.push(peerId);
          success = false;
        }
      } catch (error) {
        this.logger.error(`Error adding ${type} track to peer ${peerId}:`, error);
        failedPeers.push(peerId);
        success = false;
      }
    }

    const totalPeers = this.peerConnections.size;
    const successCount = totalPeers - failedPeers.length;
    
    this.logger.info(`Added ${type} track to ${successCount}/${totalPeers} peers`);
    
    if (failedPeers.length > 0) {
      this.logger.warn(`Failed to add track to peers:`, failedPeers.join(', '));
    }

    return success;
  }

  /**
   * Remove a track from all peer connections
   */
  public removeTrackFromAllPeers(trackId: string): boolean {
    if (this.peerConnections.size === 0) {
      this.logger.warn('No peer connections to remove track from');
      return false;
    }

    let success = true;
    const failedPeers: string[] = [];

    // Remove the track from each peer connection
    for (const [peerId, peerConnection] of this.peerConnections.entries()) {
      try {
        const result = peerConnection.removeTrack(trackId);
        if (!result) {
          this.logger.warn(`Failed to remove track ${trackId} from peer ${peerId}`);
          failedPeers.push(peerId);
          success = false;
        }
      } catch (error) {
        this.logger.error(`Error removing track ${trackId} from peer ${peerId}:`, error);
        failedPeers.push(peerId);
        success = false;
      }
    }

    const totalPeers = this.peerConnections.size;
    const successCount = totalPeers - failedPeers.length;
    
    this.logger.info(`Removed track ${trackId} from ${successCount}/${totalPeers} peers`);
    
    if (failedPeers.length > 0) {
      this.logger.warn(`Failed to remove track from peers:`, failedPeers.join(', '));
    }

    return success;
  }

  /**
   * Toggle a track type on all peer connections
   */
  public toggleTrackOnAllPeers(type: 'audio' | 'video' | 'screen'): boolean {
    if (this.peerConnections.size === 0) {
      this.logger.warn(`No peer connections to toggle ${type} track on`);
      return false;
    }

    let enabled = false;
    const failedPeers: string[] = [];

    // The first successful toggle will determine if we're enabling or disabling
    let isFirstToggle = true;

    // Toggle the track on each peer connection
    for (const [peerId, peerConnection] of this.peerConnections.entries()) {
      try {
        const result = peerConnection.toggleTrack(type);
        
        // Use the first result to determine the toggle state
        if (isFirstToggle) {
          enabled = result;
          isFirstToggle = false;
        }
      } catch (error) {
        this.logger.error(`Error toggling ${type} track on peer ${peerId}:`, error);
        failedPeers.push(peerId);
      }
    }

    const totalPeers = this.peerConnections.size;
    const successCount = totalPeers - failedPeers.length;
    
    this.logger.info(`Toggled ${type} track to ${enabled ? 'enabled' : 'disabled'} on ${successCount}/${totalPeers} peers`);
    
    if (failedPeers.length > 0) {
      this.logger.warn(`Failed to toggle track on peers:`, failedPeers.join(', '));
    }

    return enabled;
  }

  /**
   * Set up callbacks for a peer connection
   */
  private setupPeerConnectionCallbacks(peerConnection: WebRTCManager, peerId: string): void {
    // Set ICE candidate callback
    peerConnection.setOnIceCandidate((candidate, connectionId) => {
      if (this.onIceCandidateCallback) {
        this.logger.debug(`ICE candidate from peer ${peerId} with connection ID ${connectionId}`);
        this.onIceCandidateCallback(candidate, peerId, connectionId);
      }
    });

    // Set track callback
    peerConnection.setOnTrack((stream, streamId) => {
      if (this.onTrackCallback) {
        this.logger.info(`Track received from peer ${peerId}, stream ID ${streamId}`);
        this.onTrackCallback(stream, peerId);
      }
    });

    // Set data channel callback
    peerConnection.setOnDataChannel((channel) => {
      if (this.onDataChannelCallback) {
        this.logger.info(`Data channel received from peer ${peerId}: ${channel.label}`);
        this.onDataChannelCallback(channel, peerId);
      }
    });

    // Set track removed callback
    peerConnection.setOnTrackRemoved((trackId, streamId) => {
      if (this.onTrackRemovedCallback) {
        this.logger.info(`Track ${trackId} removed from peer ${peerId}`);
        this.onTrackRemovedCallback(trackId, peerId);
      }
    });

    // Set negotiation needed callback
    peerConnection.setOnNegotiationNeeded((connectionId) => {
      if (this.onNegotiationNeededCallback) {
        this.logger.info(`Negotiation needed for peer ${peerId} with connection ID ${connectionId}`);
        this.onNegotiationNeededCallback(peerId, connectionId);
      }
    });

    // Set connection state change callback
    peerConnection.setOnConnectionStateChange((state) => {
      if (this.onPeerConnectionStateChangeCallback) {
        this.logger.info(`Connection state changed for peer ${peerId}: ${state}`);
        this.onPeerConnectionStateChangeCallback(peerId, state);
      }

      // Automatically clean up disconnected peers
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.logger.info(`Peer ${peerId} connection state is ${state}, will remove connection`);
        
        // Use a timeout to give the connection a chance to recover if it's just "disconnected"
        if (state === 'disconnected') {
          setTimeout(() => {
            const currentState = peerConnection.getConnectionState();
            if (currentState === 'disconnected' || currentState === 'failed' || currentState === 'closed') {
              this.logger.info(`Removing stale connection for peer ${peerId} (state: ${currentState})`);
              this.removePeerConnection(peerId);
            }
          }, 10000); // 10 seconds timeout for disconnected state
        } else {
          // For failed or closed, remove immediately
          this.removePeerConnection(peerId);
        }
      }
    });
  }

  /**
   * Set callback for ICE candidate events from any peer
   */
  public setOnIceCandidate(
    callback: (candidate: RTCIceCandidate, peerId: string, connectionId: string) => void
  ): void {
    this.onIceCandidateCallback = callback;
  }

  /**
   * Set callback for track events from any peer
   */
  public setOnTrack(callback: (stream: MediaStream, peerId: string) => void): void {
    this.onTrackCallback = callback;
  }

  /**
   * Set callback for data channel events from any peer
   */
  public setOnDataChannel(callback: (channel: RTCDataChannel, peerId: string) => void): void {
    this.onDataChannelCallback = callback;
  }

  /**
   * Set callback for track removed events from any peer
   */
  public setOnTrackRemoved(callback: (trackId: string, peerId: string) => void): void {
    this.onTrackRemovedCallback = callback;
  }

  /**
   * Set callback for peer connection state change events
   */
  public setOnPeerConnectionStateChange(
    callback: (peerId: string, state: RTCPeerConnectionState) => void
  ): void {
    this.onPeerConnectionStateChangeCallback = callback;
  }

  /**
   * Set callback for negotiation needed events from any peer
   */
  public setOnNegotiationNeeded(callback: (peerId: string, connectionId: string) => void): void {
    this.onNegotiationNeededCallback = callback;
  }

  /**
   * Get the current connection state for a specific peer
   */
  public getPeerConnectionState(peerId: string): RTCPeerConnectionState | null {
    const peerConnection = this.getPeerConnection(peerId);
    
    if (!peerConnection) {
      return null;
    }

    return peerConnection.getConnectionState();
  }

  /**
   * Get all peer IDs with active connections
   */
  public getAllPeerIds(): string[] {
    return Array.from(this.peerConnections.keys());
  }
}