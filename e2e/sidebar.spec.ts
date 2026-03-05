import { test, expect } from '@playwright/test';

test.describe('Sidebar', () => {
  test('should show sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('text=새 대화')).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('input[placeholder="대화 검색..."]')).toBeVisible();
  });

  test('should have import button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('text=가져오기')).toBeVisible();
  });
});
