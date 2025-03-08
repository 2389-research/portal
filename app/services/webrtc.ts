/**
 * WebRTC Manager for Expo
 * This is a React Native-friendly wrapper for the WebRTC API
 */

interface PeerConfig {
  iceServers: RTCIceServer[];
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private dataChannel: RTCDataChannel | null = null;
  private peerConfig: PeerConfig;
  private onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private onNegotiationNeededCallback: (() => void) | null = null;
  private onTrackCallback: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onDataChannelCallback: ((channel: RTCDataChannel) => void) | null = null;

  constructor(config?: Partial<PeerConfig>) {
    this.peerConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
      ...config,
    };
  }

  /**
   * Initialize peer connection
   */
  public async initialize(localStream: MediaStream): Promise<void> {
    this.localStream = localStream;

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.peerConfig);

    // Add all local tracks to the peer connection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, localStream);
      });
    }

    // Set up event handlers
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    this.peerConnection.onnegotiationneeded = () => {
      if (this.onNegotiationNeededCallback) {
        this.onNegotiationNeededCallback();
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (this.onTrackCallback) {
        const stream = event.streams[0];
        const peerId = stream.id;
        this.remoteStreams.set(peerId, stream);
        this.onTrackCallback(stream, peerId);
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      if (this.onDataChannelCallback) {
        this.onDataChannelCallback(this.dataChannel);
      }
    };
  }

  /**
   * Create and set up a data channel
   */
  public createDataChannel(label: string): RTCDataChannel | null {
    if (!this.peerConnection) {
      console.error('Peer connection not initialized');
      return null;
    }

    this.dataChannel = this.peerConnection.createDataChannel(label);
    return this.dataChannel;
  }

  /**
   * Create and send an offer to a remote peer
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Process an offer received from a remote peer
   */
  public async processOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Process an answer received from a remote peer
   */
  public async processAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Add a remote ICE candidate
   */
  public async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
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

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStreams.clear();
    this.dataChannel = null;
  }

  /**
   * Set callbacks
   */
  public setOnIceCandidate(callback: (candidate: RTCIceCandidate) => void): void {
    this.onIceCandidateCallback = callback;
  }

  public setOnNegotiationNeeded(callback: () => void): void {
    this.onNegotiationNeededCallback = callback;
  }

  public setOnTrack(callback: (stream: MediaStream, peerId: string) => void): void {
    this.onTrackCallback = callback;
  }

  public setOnDataChannel(callback: (channel: RTCDataChannel) => void): void {
    this.onDataChannelCallback = callback;
  }
}
