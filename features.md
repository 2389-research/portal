- better design.

- limit google auth to 2389.ai domain name (in google, but configurable)
- ability for a user to pop out their video chat using OS functionality
- ability for a third party to push an rtsp stream into a room

TV View:

Title: Implement Private Room URL Access with Anonymous Authentication

Description:

We need to implement a feature that enables users to access specific rooms directly through a private URL. This is primarily intended for TV displays and similar use cases.

Requirements:

1. URL Structure:
   - Format: https://example.com/private/{UUID}/room/{ROOM_NAME}/{SCREEN_NAME}
   - Parameters:
     - UUID: Unique identifier for the user
     - ROOM_NAME: Target room identifier
     - SCREEN_NAME: Display name for the user

2. Authentication & Access:
   - Implement Firebase anonymous authentication
   - Auto-sign in using the provided UUID
   - Automatically join specified room
   - Display user in room's participant list using SCREEN_NAME

3. UI/UX Requirements:
   - Create simplified room view different from standard interface
   - Display only:
     - User's video feed
     - Screen name
     - Chat messages (displayed as subtitles at bottom)

4. Technical Considerations:
   - Ensure secure URL validation
   - Handle authentication errors gracefully
   - Implement proper session management

Priority: Medium
Labels: feature, authentication, UI


Title: Implement Secure User Authentication Landing Page

Description:

We need to create a secure landing page that handles user authentication with a clean, modern design.

Requirements:

1. UI/UX Components:
   - Minimal, modern design layout
   - Company logo prominently displayed
   - Single sign-on button with Google OAuth integration
   - Loading state indicators during authentication flow

2. Authentication Features:
   - Google SSO integration
   - Loading state feedback during auth process
   - Error handling and user feedback for failed attempts

3. Post-Authentication Flow:
   - User permissions and access level validation
   - Redirect to personalized lobby dashboard
   - Session state management

Technical Considerations:
- Secure implementation of OAuth 2.0
- Session token handling
- Error boundary implementation
- Cross-browser compatibility

Priority: High
Labels: security, authentication, UI/UX