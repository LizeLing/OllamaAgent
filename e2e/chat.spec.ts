import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test('should show welcome screen with suggestions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=OllamaAgent')).toBeVisible();
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
    await expect(page.locator('text=코드 작성')).toBeVisible();
  });

  test('should have chat input', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('should toggle settings with Cmd+,', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+,');
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('should create new chat with button', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Chat');
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
  });

  test('should show shortcut guide with ?', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('?');
    await expect(page.locator('text=키보드 단축키')).toBeVisible();
  });
});
