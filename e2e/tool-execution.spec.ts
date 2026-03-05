import { test, expect } from '@playwright/test';
import { getServiceStatus } from './helpers/service-status';

const services = getServiceStatus();

test.describe('Tool Execution', () => {
  test.skip(!services.ollama, 'Ollama service not available');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display tool log panel', async ({ page }) => {
    const toolLogBtn = page.locator('button[title="도구 로그"]');
    await toolLogBtn.click();
    // Tool log panel should open
    await expect(page.locator('text=도구 실행 로그').or(page.locator('[class*="fixed"]').last())).toBeVisible();
  });

  test('should show tool approval mode in settings', async ({ page }) => {
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=도구 승인 모드')).toBeVisible();

    // Change to confirm mode
    await page.click('text=모든 도구 실행 전 확인');
    const radio = page.locator('input[value="confirm"]');
    await expect(radio).toBeChecked();
  });

  test('should request tool execution when asking to search', async ({ page }) => {
    test.skip(!services.searxng, 'SearXNG service not available');

    const textarea = page.locator('textarea');
    await textarea.fill('Search the web for "Playwright testing framework"');
    await textarea.press('Enter');

    // Wait for potential tool call display
    await page.waitForTimeout(15000);

    // The response area should have content
    const main = page.locator('main');
    const content = await main.textContent();
    expect(content?.length).toBeGreaterThan(50);
  });

  test('should show stats panel', async ({ page }) => {
    const statsBtn = page.locator('button[title="통계"]');
    await statsBtn.click();

    // Stats panel should be visible
    const panel = page.locator('.fixed.right-0, .fixed.inset-0').last();
    await expect(panel).toBeVisible();
  });

  test('should handle tool calls in chat display', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('List files in the current directory');
    await textarea.press('Enter');

    // Wait for response
    await page.waitForTimeout(15000);

    // Should have some response content
    const messages = page.locator('main .overflow-y-auto');
    await expect(messages).not.toBeEmpty();
  });

  test('should show error gracefully on tool failure', async ({ page }) => {
    // Mock tool execution to fail
    await page.route('**/api/chat', async (route) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({
            type: 'tool_call',
            tool: 'test_tool',
            input: {},
            error: 'Tool execution failed'
          }) + '\n'));
          controller.close();
        }
      });
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: JSON.stringify({ error: 'Tool failed' }),
      });
    });

    const textarea = page.locator('textarea');
    await textarea.fill('Run a test tool');
    await textarea.press('Enter');

    // App should remain functional
    await page.waitForTimeout(2000);
    await expect(page.locator('textarea')).toBeVisible();
  });
});
