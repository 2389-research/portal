- better design.
- a landing page that allows a user to sign in securely:
    - minimal, modern design with company logo prominently displayed
    - single sign-on button integrated with Google authentication
    - loading state feedback during authentication process
    - error handling for failed sign-in attempts
    - upon successful authentication:
        - validate user permissions and access levels
        - redirect to personalized lobby dashboard
        - maintain session state
- limit google auth to 2389.ai domain name (in google, but configurable)
- ability for a user to pop out their video chat using OS functionality
- ability for a third party to push an rtsp stream into a room

TV View:

- a private url that allows a user to sign in and go directly to a specific room
    - example url: https://example.com/private/{UUID}/room/{ROOM_NAME}/{SCREEN_NAME}
    - this would sign in the user (id:UUID) into the room (office) to be shown on the screen (SCREEN_NAME)
    - the screen name would be used to identify the user, and would show up user list for other users
    - for use with TVs, etc
    - uses firebase anonymous authentication.
    - it should use a different view than the normal room view, showing only the user's video and the screen name.
    - chat messages should show on the bottom like a subtitle
