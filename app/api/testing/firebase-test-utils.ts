/**
 * Firebase Test Utilities
 * Helper functions for testing Firebase functionality
 */

import { FirebaseApp } from 'firebase/app';
import { User } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { FirebaseApiClient } from '../FirebaseApiClient';
import { ApiInterface, UserInfo } from '../ApiInterface';

/**
 * Mock FirebaseApiClient for testing
 * Implements the same interface but allows mocking of all methods
 */
export class MockFirebaseApiClient implements ApiInterface {
  private connected: boolean = false;
  private mockUser: UserInfo | null = null;

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }
  
  public isConnected(): boolean {
    return this.connected;
  }

  public async createRoom(): Promise<any> {
    return {
      roomId: 'mock-room-id',
      userId: 'mock-user-id',
      created: Date.now(),
    };
  }

  public async joinRoom(roomId: string): Promise<any> {
    return {
      userId: 'mock-user-id',
      joined: Date.now(),
    };
  }

  public async leaveRoom(roomId: string, userId: string): Promise<void> {}

  public async sendSignal(roomId: string, message: any): Promise<void> {}

  public async getSignals(roomId: string, since: number = 0): Promise<any[]> {
    return [];
  }

  public getProviderName(): string {
    return 'MockFirebase';
  }

  public async signInWithGoogle(): Promise<UserInfo> {
    this.mockUser = {
      uid: 'mock-uid',
      displayName: 'Mock User',
      email: 'mock@example.com',
      photoURL: null,
    };
    return this.mockUser;
  }

  public async signOut(): Promise<void> {
    this.mockUser = null;
  }

  public getCurrentUser(): UserInfo | null {
    return this.mockUser;
  }

  public isSignedIn(): boolean {
    return this.mockUser !== null;
  }

  public onAuthStateChanged(listener: (user: UserInfo | null) => void): () => void {
    // Return a no-op unsubscribe function
    return () => {};
  }
}

/**
 * Create a spy for the FirebaseApiClient that wraps the real implementation
 * and records all method calls
 */
export function createFirebaseApiClientSpy(client: FirebaseApiClient): ApiInterface {
  const spy: Record<string, jest.SpyInstance> = {};
  
  // Create spies for all methods
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter(method => typeof (client as any)[method] === 'function' && method !== 'constructor');
  
  // Create a wrapper object with spies for all methods
  const wrapper = {} as any;
  
  methods.forEach(method => {
    spy[method] = jest.spyOn(client, method as any);
    wrapper[method] = (...args: any[]) => (client as any)[method](...args);
  });
  
  // Add spy accessor methods
  wrapper.getSpy = (method: string) => spy[method];
  wrapper.resetAllSpies = () => Object.values(spy).forEach(s => s.mockClear());
  
  return wrapper as ApiInterface & {
    getSpy: (method: string) => jest.SpyInstance;
    resetAllSpies: () => void;
  };
}

/**
 * Create a mock for getApp and getFirestore
 * Useful for unit testing components that use Firebase
 */
export function mockFirebaseApp(): {
  app: FirebaseApp;
  db: Firestore;
  auth: { currentUser: User | null };
} {
  const mockApp = {
    name: 'mock-app',
    options: {},
    automaticDataCollectionEnabled: false,
  } as FirebaseApp;

  const mockDb = {
    app: mockApp,
    type: 'firestore',
  } as unknown as Firestore;

  const mockAuth = {
    currentUser: null,
  };

  return {
    app: mockApp,
    db: mockDb,
    auth: mockAuth,
  };
}