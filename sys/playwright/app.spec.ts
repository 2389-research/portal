import { expect, test } from '@playwright/test';

test.describe('WebRTC App Tests', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads with the expected title
    await expect(page).toHaveTitle(/WebRTC Video Chat/);

    // Verify login screen is visible
    await expect(page.locator('text=Sign in with Google')).toBeVisible();
  });

  test('room page requires authentication', async ({ page }) => {
    // Navigate directly to a room page without authentication
    await page.goto('/room/test-room-123');

    // Should see authentication error message
    await expect(page.locator('text=Please sign in to join a room')).toBeVisible();
    await expect(page.locator('text=Go to Login')).toBeVisible();
  });

  // More tests would be added for authenticated flows using mocked auth
});
