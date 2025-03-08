// Add global Jest configurations and mocks here

// Mock Expo async storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  apps: [],
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    onAuthStateChanged: jest.fn(),
    signInWithPopup: jest.fn(),
    signOut: jest.fn(),
  })),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({})),
  onAuthStateChanged: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

// Mock navigator media devices
// First ensure navigator exists in the global object
if (!global.navigator) {
  global.navigator = {};
}

// Then define the mediaDevices property
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn().mockImplementation(() =>
      Promise.resolve({
        getTracks: () => [
          {
            stop: jest.fn(),
            getSettings: () => ({ deviceId: 'default' }),
          },
        ],
      })
    ),
    enumerateDevices: jest.fn().mockImplementation(() => Promise.resolve([])),
  },
  configurable: true,
});

// Mock WebRTC APIs
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn().mockReturnValue({
    onopen: null,
    onclose: null,
    onmessage: null,
    send: jest.fn(),
  }),
  addTrack: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({}),
  createAnswer: jest.fn().mockResolvedValue({}),
  setLocalDescription: jest.fn().mockResolvedValue({}),
  setRemoteDescription: jest.fn().mockResolvedValue({}),
  addIceCandidate: jest.fn().mockResolvedValue({}),
  onicecandidate: null,
  ontrack: null,
  onnegotiationneeded: null,
  close: jest.fn(),
}));

// Handle warnings and errors more strictly in tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // Convert args to string for easier matching
  const message = args.join(' ');

  // Fail tests on specific errors we want to catch
  if (
    message.includes('Warning: Failed prop type') ||
    message.includes('Warning: Cannot update a component') ||
    message.includes('Invalid hook call')
  ) {
    throw new Error(message);
  }

  // Print other errors normally
  originalConsoleError(...args);
};
