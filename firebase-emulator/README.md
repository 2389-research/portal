# Firebase Emulator for Integration Tests

This directory contains configuration for running Firebase integration tests using the Firebase emulator suite.

## Prerequisites

1. Install the Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase (not strictly required for emulator use, but recommended):
```bash
firebase login
```

## Running the Emulator

To start the Firebase emulator for testing:

```bash
# From the app directory
npm run emulator:start

# With UI
npm run emulator:start:ui
```

This will start the following emulators:
- Firebase Auth on port 9099
- Firestore on port 8080
- Emulator UI on port 4000 (if enabled)

## Running the Integration Tests

The integration tests require the Firebase emulator to be running. You can start the emulator and run the tests in separate terminals:

```bash
# Terminal 1: Start the emulator
npm run emulator:start

# Terminal 2: Run the tests
npm run test:firebase
```

Or in watch mode:

```bash
npm run test:firebase:watch
```

## Test Structure

The integration tests are located in `__tests__/api/firebase-integration/` and are structured as follows:

1. `FirebaseManager.test.ts` - Tests base functionality
2. `FirebaseAuthManager.test.ts` - Tests authentication
3. `FirebaseRoomManager.test.ts` - Tests room operations
4. `FirebaseSignalingManager.test.ts` - Tests signaling 
5. `FirebaseApiClient.test.ts` - Tests the integrated API client

## Emulator Configuration

The emulator configuration is defined in:
- `firebase.json` - Emulator configuration
- `firestore.rules` - Security rules for Firestore
- `firestore.indexes.json` - Indexes for Firestore queries

## Utilities

Test utilities for working with the Firebase emulator are in `api/testing/firebase-integration-utils.ts`. These include:

- `initializeFirebaseEmulator()` - Set up the emulator connection
- `createTestUser()` - Create a test user in the Auth emulator
- `signOutTestUser()` - Sign out the current user
- `clearFirestoreData()` - Clear all data in Firestore
- `generateTestRoomId()` - Generate a random room ID for testing