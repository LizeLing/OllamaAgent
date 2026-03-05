import { test, expect } from '@playwright/test';
import { getServiceStatus } from './helpers/service-status';

const services = getServiceStatus();

test.describe('Chat with Ollama', () => {
  test.skip(!services.ollama, 'Ollama service not available');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should send message and receive response', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Say hello in one word');
    await textarea.press('Enter');

    // Should see the user message
    await expect(page.locator('text=Say hello in one word')).toBeVisible();

    // Wait for assistant response (streaming)
    const assistantMessage = page.locator('[class*="bg-card"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });
  });

  test('should show thinking indicator during processing', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('What is 2+2?');
    await textarea.press('Enter');

    // Stop button should appear while loading
    await expect(page.locator('text=Stop')).toBeVisible({ timeout: 5000 });
  });

  test('should handle multiple turn conversation', async ({ page }) => {
    const textarea = page.locator('textarea');

    // First message
    await textarea.fill('My name is TestUser');
    await textarea.press('Enter');
    await page.waitForTimeout(5000);

    // Second message
    await textarea.fill('What is my name?');
    await textarea.press('Enter');

    // Wait for response
    await page.waitForTimeout(10000);

    // Both messages should be visible
    await expect(page.locator('text=My name is TestUser')).toBeVisible();
    await expect(page.locator('text=What is my name?')).toBeVisible();
  });

  test('should abort/stop generation', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Write a very long essay about the history of computing');
    await textarea.press('Enter');

    // Wait for Stop button
    const stopBtn = page.locator('text=Stop');
    await expect(stopBtn).toBeVisible({ timeout: 10000 });

    // Click stop
    await stopBtn.click();

    // Stop button should disappear
    await expect(stopBtn).not.toBeVisible({ timeout: 5000 });
  });

  test('should display model selector in header', async ({ page }) => {
    const modelSelect = page.locator('select[title="모델 선택"]');
    await expect(modelSelect).toBeVisible();

    // Should have at least one option
    const options = modelSelect.locator('option');
    expect(await options.count()).toBeGreaterThan(0);
  });

  test('should stream response tokens incrementally', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Count from 1 to 5');
    await textarea.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Stop')).toBeVisible({ timeout: 10000 });

    // Check that content is appearing
    await page.waitForTimeout(2000);
    const messageArea = page.locator('main');
    const textContent = await messageArea.textContent();
    expect(textContent?.length).toBeGreaterThan(0);
  });

  test('should handle stop with Escape key', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Write a long story about a dragon');
    await textarea.press('Enter');

    await expect(page.locator('text=Stop')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Stop')).not.toBeVisible({ timeout: 5000 });
  });

  test('should show New Chat button in header', async ({ page }) => {
    await expect(page.locator('text=New Chat')).toBeVisible();
  });
});
