import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';

let cleanup: () => Promise<void>;

// Dynamic imports for modules that read DATA_DIR at load time
let createFolder: typeof import('../folders').createFolder;
let listFolders: typeof import('../folders').listFolders;
let updateFolder: typeof import('../folders').updateFolder;
let deleteFolder: typeof import('../folders').deleteFolder;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../folders');
  createFolder = mod.createFolder;
  listFolders = mod.listFolders;
  updateFolder = mod.updateFolder;
  deleteFolder = mod.deleteFolder;
}

describe('Folders Integration', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('full CRUD cycle: create -> list -> update -> delete', async () => {
    // Create
    const folder = await createFolder('Work', '#3B82F6');
    expect(folder.name).toBe('Work');
    expect(folder.color).toBe('#3B82F6');
    expect(folder.id).toMatch(/^folder-/);

    // List
    const list = await listFolders();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Work');

    // Update
    const updated = await updateFolder(folder.id, { name: 'Personal' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Personal');
    expect(updated!.color).toBe('#3B82F6'); // unchanged

    // Delete
    await deleteFolder(folder.id);
    const afterDelete = await listFolders();
    expect(afterDelete.length).toBe(0);
  });

  it('multiple folders sorted by order', async () => {
    await createFolder('First', '#FF0000');
    await createFolder('Second', '#00FF00');
    await createFolder('Third', '#0000FF');

    const list = await listFolders();
    expect(list.length).toBe(3);
    expect(list[0].name).toBe('First');
    expect(list[0].order).toBe(0);
    expect(list[1].name).toBe('Second');
    expect(list[1].order).toBe(1);
    expect(list[2].name).toBe('Third');
    expect(list[2].order).toBe(2);
  });

  it('update reorders folders', async () => {
    const f1 = await createFolder('A', '#FF0000');
    await createFolder('B', '#00FF00');

    await updateFolder(f1.id, { order: 5 });

    const list = await listFolders();
    // B (order 1) should come before A (order 5)
    expect(list[0].name).toBe('B');
    expect(list[1].name).toBe('A');
  });

  it('update nonexistent folder returns null', async () => {
    const result = await updateFolder('folder-nonexistent', { name: 'Test' });
    expect(result).toBeNull();
  });

  it('delete nonexistent folder does not throw', async () => {
    await expect(deleteFolder('folder-nonexistent')).resolves.not.toThrow();
  });
});
