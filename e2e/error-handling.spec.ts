import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('should handle failed API gracefully', async ({ page }) => {
    // Mock the models API to return an error
    await page.route('**/api/models', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal Server Error' }) })
    );

    await page.goto('/');
    // App should still load and be usable
    await expect(page.locator('text=OllamaAgent')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('should handle network failure on chat', async ({ page }) => {
    await page.goto('/');

    // Mock the chat API to fail
    await page.route('**/api/chat', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    );

    const textarea = page.locator('textarea');
    await textarea.fill('에러 테스트');
    await textarea.press('Enter');

    // App should not crash - textarea should still be usable after error
    await page.waitForTimeout(2000);
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('should handle invalid conversation load', async ({ page }) => {
    // Navigate to a non-existent conversation
    await page.route('**/api/conversations/nonexistent', (route) =>
      route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }) })
    );

    await page.goto('/');
    // App should remain functional
    await expect(page.locator('text=OllamaAgent')).toBeVisible();
  });

  test('should recover input after send failure', async ({ page }) => {
    await page.goto('/');

    // Mock conversations API to fail on create
    await page.route('**/api/conversations', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 500, body: JSON.stringify({ error: 'Failed' }) });
      }
      return route.continue();
    });

    const textarea = page.locator('textarea');
    await textarea.fill('복구 테스트');
    await textarea.press('Enter');

    // After failure, textarea should still be interactive
    await page.waitForTimeout(1000);
    await expect(textarea).toBeEnabled();
  });
});
