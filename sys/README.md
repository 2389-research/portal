# WebRTC Video Chat - Expo Web Version

This is an Expo-based implementation of the WebRTC Video Chat application, using React Native and UI Kitten for the user interface.

## Features

- Real-time video/audio communication using WebRTC
- Text chat via WebRTC data channels
- Screen sharing capabilities
- Device selection (camera, microphone, speakers)
- Multiple backend options (Firebase, PocketBase, Flask, Mock)
- Responsive design that works on web and mobile

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Expo CLI

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

### Configuration

1. Firebase Configuration:
   - Edit `api/config.ts` with your Firebase project credentials

### Running the App

For web development:
```bash
npm run web
```

For iOS:
```bash
npm run ios
```

For Android:
```bash
npm run android
```

## Project Structure

- `app/` - Main screens using Expo Router
  - `index.tsx` - Home screen (create/join room)
  - `room/[id].tsx` - Video chat room screen
- `components/` - UI components
  - `VideoContainer.tsx` - Video display component
  - `VideoGrid.tsx` - Grid layout for videos
  - `ChatInterface.tsx` - Chat UI component
  - `MediaControls.tsx` - Controls for audio/video
  - `DeviceSettings.tsx` - Device selection modal
- `services/` - Core functionality
  - `webrtc.ts` - WebRTC adapter
  - `media.ts` - Media device management
  - `chat.ts` - Chat data channel
  - `signaling.ts` - Signaling service
- `api/` - Backend API clients
  - `ApiInterface.ts` - Common interface
  - `FirebaseApiClient.ts` - Firebase implementation
  - `MockApiClient.ts` - Mock implementation
  - `ApiProvider.ts` - API provider/selector
- `theme/` - UI Kitten theme configuration

## Architecture

The application follows a modular architecture:

1. **Services Layer** - Core WebRTC functionality:
   - WebRTC connection management
   - Media device access and control
   - Signaling protocol
   - Data channel communication

2. **API Layer** - Backend communication:
   - Room creation/joining
   - Signaling message exchange
   - Provider selection

3. **UI Layer** - User interface components:
   - Video display and layout
   - Chat interface
   - Media controls
   - Settings and modals

## Backend Options

The app supports multiple backend options through the `ApiProvider`:

1. **Mock** - In-memory implementation for testing
2. **Firebase** - Uses Firebase Realtime Database
3. **PocketBase** - Uses PocketBase backend (implementation pending)
4. **Flask** - Uses Flask Python backend (implementation pending)

## Notes on WebRTC in Expo

While this implementation works well for web, the WebRTC integration for native platforms (iOS/Android) requires additional configuration:

- For full native support, consider using `react-native-webrtc`
- The current implementation uses WebView for video display on native platforms
- Some features may have limited functionality on native platforms

## Expo Resources

To learn more about developing with Expo:

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [UI Kitten documentation](https://akveo.github.io/react-native-ui-kitten/)
