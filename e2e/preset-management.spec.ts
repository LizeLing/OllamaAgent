import { test, expect } from '@playwright/test';

test.describe('Preset Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Open settings
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=Settings').first()).toBeVisible();
  });

  test('should show preset list in settings', async ({ page }) => {
    await expect(page.locator('text=에이전트 프리셋')).toBeVisible();
    // Default presets should be visible
    await expect(page.locator('text=코딩 어시스턴트')).toBeVisible();
    await expect(page.locator('text=리서치')).toBeVisible();
    await expect(page.locator('text=일반')).toBeVisible();
  });

  test('should switch preset', async ({ page }) => {
    // Click on "리서치" preset
    await page.click('text=리서치');

    // The button should become active (has accent styling)
    const researchBtn = page.locator('button:has-text("리서치")').first();
    await expect(researchBtn).toHaveClass(/border-accent/);
  });

  test('should show tool approval mode options', async ({ page }) => {
    await expect(page.locator('text=도구 승인 모드')).toBeVisible();
    await expect(page.locator('text=모든 도구 자동 실행')).toBeVisible();
    await expect(page.locator('text=모든 도구 실행 전 확인')).toBeVisible();
    await expect(page.locator('text=위험한 도구만 확인')).toBeVisible();
  });

  test('should save settings', async ({ page }) => {
    // Click save
    await page.click('text=Save Settings');
    // Settings panel should close
    await expect(page.locator('h2:has-text("Settings")')).not.toBeVisible({ timeout: 5000 });
  });
});
