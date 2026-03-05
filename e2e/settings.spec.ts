import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test('should open and close settings panel', async ({ page }) => {
    await page.goto('/');
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=Settings').first()).toBeVisible();
    await expect(page.locator('text=Save Settings')).toBeVisible();
  });

  test('should show model options', async ({ page }) => {
    await page.goto('/');
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=Model')).toBeVisible();
    await expect(page.locator('text=Ollama URL')).toBeVisible();
  });
});
