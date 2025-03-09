/**
 * Jest setup file for Firebase integration tests
 * This file configures Jest to work with the Firebase emulator
 */

// Set environment variables to enable Firebase emulator mode
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Increase Jest timeout for integration tests
jest.setTimeout(30000);

// Mock Timestamp.fromMillis for compatibility with tests
jest.mock('firebase/firestore', () => {
  const originalModule = jest.requireActual('firebase/firestore');
  
  return {
    ...originalModule,
    Timestamp: {
      ...originalModule.Timestamp,
      fromMillis: jest.fn((millis) => ({
        toMillis: () => millis,
        toDate: () => new Date(millis),
        _milliseconds: millis,
        // Add these to make comparisons and serialization work
        isEqual: function(other) {
          return other && other._milliseconds === this._milliseconds;
        },
        toString: function() {
          return `Timestamp(seconds=${Math.floor(this._milliseconds / 1000)}, nanoseconds=${(this._milliseconds % 1000) * 1000000})`;
        }
      })),
    },
  };
});

// Silence console logs if desired (uncomment to enable)
// global.console.log = jest.fn();
global.console.info = jest.fn();
global.console.debug = jest.fn();

// Don't silence errors and warnings
// global.console.warn = jest.fn(); 
// global.console.error = jest.fn();