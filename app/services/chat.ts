/**
 * Chat Manager for WebRTC (Legacy adapter for backward compatibility)
 * Delegates to the new implementation
 */

import { WebRTCManager } from './webrtc';
import { ChatManager as NewChatManager, ChatMessage } from './chat/ChatManager';

// Re-export the ChatMessage interface
export { ChatMessage };

export class ChatManager {
  private chatManager: NewChatManager;

  constructor(userId: string, webrtcManager: WebRTCManager) {
    this.chatManager = new NewChatManager(userId, webrtcManager);
  }

  /**
   * Initialize chat with a data channel
   */
  public async initialize(isInitiator: boolean): Promise<boolean> {
    return this.chatManager.initialize(isInitiator);
  }

  /**
   * Send a chat message
   */
  public sendMessage(content: string): ChatMessage | null {
    return this.chatManager.sendMessage(content);
  }

  /**
   * Set message callback
   */
  public onMessage(callback: (message: ChatMessage) => void): void {
    this.chatManager.onMessage(callback);
  }

  /**
   * Get all messages
   */
  public getMessages(): ChatMessage[] {
    return this.chatManager.getMessages();
  }

  /**
   * Check if data channel is open
   */
  public isReady(): boolean {
    return this.chatManager.isReady();
  }

  /**
   * Wait for data channel to open (with timeout)
   */
  public waitForChannelReady(timeoutMs: number = 10000): Promise<boolean> {
    return this.chatManager.waitForReady(timeoutMs);
  }

  /**
   * Close the data channel
   */
  public close(): void {
    this.chatManager.close();
  }
}
