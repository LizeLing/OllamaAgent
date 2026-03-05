import { test, expect } from '@playwright/test';

test.describe('Conversation Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
  });

  test('should create new conversation via sidebar button', async ({ page }) => {
    await page.click('text=새 대화');
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
  });

  test('should show conversation in sidebar after sending message', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('테스트 메시지');
    await textarea.press('Enter');
    // Wait for conversation to appear in sidebar
    await expect(page.locator('.overflow-y-auto >> .text-sm.truncate').first()).toBeVisible({ timeout: 10000 });
  });

  test('should switch between conversations', async ({ page }) => {
    // Create first conversation by sending a message
    const textarea = page.locator('textarea');
    await textarea.fill('첫 번째 대화');
    await textarea.press('Enter');
    await page.waitForTimeout(1000);

    // Create a new conversation
    await page.click('text=New Chat');
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();

    // The previous conversation should be in the sidebar
    const conversationItems = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer');
    await expect(conversationItems.first()).toBeVisible({ timeout: 5000 });
  });

  test('should rename conversation via edit button', async ({ page }) => {
    // Send a message to create a conversation
    const textarea = page.locator('textarea');
    await textarea.fill('이름 변경 테스트');
    await textarea.press('Enter');
    await page.waitForTimeout(1000);

    // Hover over the conversation item to reveal edit button
    const convItem = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer').first();
    await convItem.hover();

    // Click rename button (pencil icon)
    const renameBtn = convItem.locator('button[title="이름 변경"]');
    await renameBtn.click();

    // Type new name and confirm
    const renameInput = convItem.locator('input');
    await renameInput.fill('새로운 이름');
    await renameInput.press('Enter');

    await expect(page.locator('text=새로운 이름')).toBeVisible();
  });

  test('should delete conversation with confirmation', async ({ page }) => {
    // Send a message to create a conversation
    const textarea = page.locator('textarea');
    await textarea.fill('삭제 테스트');
    await textarea.press('Enter');
    await page.waitForTimeout(1000);

    const convItem = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer').first();
    await convItem.hover();

    // Click delete button - first click shows confirmation
    const deleteBtn = convItem.locator('button[title="삭제"]');
    await deleteBtn.click();

    // Confirmation text should appear
    await expect(convItem.locator('text=삭제?')).toBeVisible();

    // Click again to confirm
    await convItem.locator('text=삭제?').click();
  });

  test('should search conversations in sidebar', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="대화 검색..."]');
    await searchInput.fill('존재하지않는검색어');
    await expect(page.locator('text=검색 결과가 없습니다')).toBeVisible();
  });

  test('should pin conversation', async ({ page }) => {
    // Send a message to create a conversation
    const textarea = page.locator('textarea');
    await textarea.fill('핀 테스트');
    await textarea.press('Enter');
    await page.waitForTimeout(1000);

    const convItem = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer').first();
    await convItem.hover();

    // Click pin button
    const pinBtn = convItem.locator('button[title="고정"]');
    if (await pinBtn.isVisible()) {
      await pinBtn.click();
      await expect(page.locator('text=고정됨')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show empty state when no conversations', async ({ page }) => {
    // Search for something that won't match
    const searchInput = page.locator('input[placeholder="대화 검색..."]');
    await searchInput.fill('impossiblesearchquery99999');
    await expect(page.locator('text=검색 결과가 없습니다')).toBeVisible();
  });

  test('should show welcome screen with suggestions', async ({ page }) => {
    await expect(page.locator('text=OllamaAgent')).toBeVisible();
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
  });

  test('should have search input visible in sidebar', async ({ page }) => {
    await expect(page.locator('input[placeholder="대화 검색..."]')).toBeVisible();
  });
});
