/**
 * TypeScript type augmentations for experimental browser APIs
 * This file provides proper type definitions for APIs that are experimental
 * or not yet fully supported in the TypeScript standard lib.dom.d.ts
 */

// Extend HTMLMediaElement with setSinkId method from Audio Output Devices API
interface HTMLMediaElement {
  /**
   * Sets the ID of the audio device to use for output.
   * This is an experimental feature part of the Audio Output Devices API.
   * @param deviceId - The ID of the audio output device.
   * @returns A Promise that resolves when the operation completes.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
   */
  setSinkId?(deviceId: string): Promise<void>;
}

// Extend MediaDevices with getDisplayMedia method for screen sharing
interface MediaDevices {
  /**
   * Prompts the user to select a display or portion of a display to capture
   * as a MediaStream for screen sharing.
   * @param constraints - The media constraints for the stream to obtain.
   * @returns A Promise that resolves to a MediaStream object.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
   */
  getDisplayMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;
}

// Extend Navigator with Permissions API
interface NavigatorPermissions {
  /**
   * Permissions API interface for querying permission states.
   */
  permissions?: {
    /**
     * Queries the status of a permission for the current origin.
     * @param permissionDesc - The permission descriptor to query.
     * @returns A Promise that resolves to a PermissionStatus object.
     */
    query(permissionDesc: PermissionDescriptor): Promise<PermissionStatus>;
  };
}

// Extend Navigator interface with permissions
interface Navigator extends NavigatorPermissions {}

// Define PermissionDescriptor for media permissions
interface PermissionDescriptor {
  /**
   * The permission name to query.
   * For media permissions, this would be 'camera', 'microphone', etc.
   */
  name: 'camera' | 'microphone' | 'speaker' | string;
}

// Define PermissionStatus type
interface PermissionStatus {
  /**
   * The current state of the permission.
   * 'granted' - The permission is allowed.
   * 'denied' - The permission is denied.
   * 'prompt' - The user will be prompted for permission.
   */
  state: 'granted' | 'denied' | 'prompt';
  /**
   * Fired when the status of the permission changes.
   */
  onchange: ((this: PermissionStatus, ev: Event) => any) | null;
}
