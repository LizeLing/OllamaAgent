import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open settings with Cmd+,', async ({ page }) => {
    await page.keyboard.press('Meta+,');
    await expect(page.locator('h2:has-text("Settings")')).toBeVisible();
  });

  test('should close settings with Cmd+, toggle', async ({ page }) => {
    // Open settings
    await page.keyboard.press('Meta+,');
    await expect(page.locator('h2:has-text("Settings")')).toBeVisible();

    // Close settings with same shortcut
    await page.keyboard.press('Meta+,');
    await expect(page.locator('h2:has-text("Settings")')).not.toBeVisible();
  });

  test('should create new chat with Cmd+Shift+N', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+N');
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
  });

  test('should show shortcut guide with ?', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.locator('text=키보드 단축키')).toBeVisible();
  });

  test('should close shortcut guide with Escape', async ({ page }) => {
    // Open shortcut guide
    await page.keyboard.press('?');
    await expect(page.locator('text=키보드 단축키')).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('text=키보드 단축키')).not.toBeVisible();
  });

  test('should send message with Enter', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Enter 테스트');
    await textarea.press('Enter');

    // Message should appear in the chat
    await expect(page.locator('text=Enter 테스트')).toBeVisible({ timeout: 5000 });
  });
});
