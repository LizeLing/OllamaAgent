import { test, expect } from '@playwright/test';

test.describe('Folder Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
  });

  test('should create folder', async ({ page }) => {
    // Click the new folder button
    const newFolderBtn = page.locator('button[title="새 폴더"]');
    await newFolderBtn.click();

    // Fill in folder name
    const folderInput = page.locator('input[placeholder="폴더 이름..."]');
    await expect(folderInput).toBeVisible();
    await folderInput.fill('테스트 폴더');

    // Click create button
    await page.click('text=생성');

    // Folder should appear in sidebar
    await expect(page.locator('text=테스트 폴더')).toBeVisible();
  });

  test('should cancel folder creation', async ({ page }) => {
    const newFolderBtn = page.locator('button[title="새 폴더"]');
    await newFolderBtn.click();

    const folderInput = page.locator('input[placeholder="폴더 이름..."]');
    await expect(folderInput).toBeVisible();

    // Click cancel
    await page.click('text=취소');
    await expect(folderInput).not.toBeVisible();
  });

  test('should create folder with Enter key', async ({ page }) => {
    const newFolderBtn = page.locator('button[title="새 폴더"]');
    await newFolderBtn.click();

    const folderInput = page.locator('input[placeholder="폴더 이름..."]');
    await folderInput.fill('엔터 폴더');
    await folderInput.press('Enter');

    await expect(page.locator('text=엔터 폴더')).toBeVisible();
  });

  test('should select folder color', async ({ page }) => {
    const newFolderBtn = page.locator('button[title="새 폴더"]');
    await newFolderBtn.click();

    // Color buttons should be visible
    const colorButtons = page.locator('.rounded-full.w-5.h-5');
    await expect(colorButtons.first()).toBeVisible();

    // Click a different color
    await colorButtons.nth(2).click();

    // Fill name and create
    const folderInput = page.locator('input[placeholder="폴더 이름..."]');
    await folderInput.fill('색상 폴더');
    await page.click('text=생성');

    await expect(page.locator('text=색상 폴더')).toBeVisible();
  });

  test('should rename folder via edit button', async ({ page }) => {
    // Create a folder first
    const newFolderBtn = page.locator('button[title="새 폴더"]');
    await newFolderBtn.click();
    const folderInput = page.locator('input[placeholder="폴더 이름..."]');
    await folderInput.fill('이름변경 폴더');
    await page.click('text=생성');
    await expect(page.locator('text=이름변경 폴더')).toBeVisible();

    // Hover over folder to reveal edit button
    const folderGroup = page.locator('text=이름변경 폴더').locator('..');
    await folderGroup.hover();

    const renameBtn = folderGroup.locator('button[title="이름 변경"]');
    if (await renameBtn.isVisible()) {
      await renameBtn.click();
      const editInput = folderGroup.locator('input');
      await editInput.fill('변경된 폴더');
      await editInput.press('Enter');
      await expect(page.locator('text=변경된 폴더')).toBeVisible();
    }
  });
});
