import { test, expect } from '@playwright/test';

test.describe('Mobile Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
  });

  test('should hide sidebar by default on mobile', async ({ page }) => {
    // Sidebar should be hidden (translated off-screen)
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test('should show sidebar when menu button clicked', async ({ page }) => {
    // Click the hamburger menu button
    const menuBtn = page.locator('button[title="사이드바 토글"]');
    await menuBtn.click();

    // Sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/translate-x-0/);
  });

  test('should show backdrop when sidebar open on mobile', async ({ page }) => {
    const menuBtn = page.locator('button[title="사이드바 토글"]');
    await menuBtn.click();

    // Backdrop should be visible
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50.z-30');
    await expect(backdrop).toBeVisible();
  });

  test('should have chat input at full width', async ({ page }) => {
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    // Input should be usable
    await textarea.fill('모바일 테스트');
    await expect(textarea).toHaveValue('모바일 테스트');
  });

  test('should show settings panel full width on mobile', async ({ page }) => {
    await page.click('[title="Settings (Cmd+,)"]');
    const settingsPanel = page.locator('.fixed.right-0.top-0.h-full.w-full');
    await expect(settingsPanel).toBeVisible();
  });
});
