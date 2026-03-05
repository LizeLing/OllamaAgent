import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';
import { createConversation, createMessage } from '@/test/helpers/test-data-factory';

let cleanup: () => Promise<void>;
let dataDir: string;

// Dynamic imports for modules that read DATA_DIR at load time
let saveConversation: typeof import('../storage').saveConversation;
let getConversation: typeof import('../storage').getConversation;
let listConversations: typeof import('../storage').listConversations;
let deleteConversation: typeof import('../storage').deleteConversation;
let searchConversations: typeof import('../storage').searchConversations;
let clearFolderFromConversations: typeof import('../storage').clearFolderFromConversations;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../storage');
  saveConversation = mod.saveConversation;
  getConversation = mod.getConversation;
  listConversations = mod.listConversations;
  deleteConversation = mod.deleteConversation;
  searchConversations = mod.searchConversations;
  clearFolderFromConversations = mod.clearFolderFromConversations;
}

describe('Conversation Storage Integration', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    dataDir = setup.dataDir;
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('full CRUD cycle: save -> get -> list -> delete', async () => {
    const conv = createConversation({
      id: 'test-crud-1',
      title: 'CRUD Test',
      messages: [createMessage({ content: 'Hello' })],
    });

    // Save
    await saveConversation(conv);

    // Get
    const retrieved = await getConversation('test-crud-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('CRUD Test');
    expect(retrieved!.messages.length).toBe(1);

    // List
    const list = await listConversations();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('test-crud-1');

    // Delete
    await deleteConversation('test-crud-1');
    const afterDelete = await getConversation('test-crud-1');
    expect(afterDelete).toBeNull();

    const listAfterDelete = await listConversations();
    expect(listAfterDelete.length).toBe(0);
  });

  it('multiple conversations sorted by updatedAt desc', async () => {
    const conv1 = createConversation({
      id: 'sort-1',
      title: 'Older',
      updatedAt: 1000,
      createdAt: 1000,
    });
    const conv2 = createConversation({
      id: 'sort-2',
      title: 'Newer',
      updatedAt: 2000,
      createdAt: 2000,
    });

    await saveConversation(conv1);
    await saveConversation(conv2);

    const list = await listConversations();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe('sort-2'); // newer first
    expect(list[1].id).toBe('sort-1');
  });

  it('pinned conversations appear first', async () => {
    const conv1 = createConversation({
      id: 'pinned-1',
      title: 'Not Pinned',
      updatedAt: 3000,
    });
    const conv2 = createConversation({
      id: 'pinned-2',
      title: 'Pinned',
      updatedAt: 1000,
      pinned: true,
    });

    await saveConversation(conv1);
    await saveConversation(conv2);

    const list = await listConversations();
    expect(list[0].id).toBe('pinned-2');
  });

  it('searchConversations finds by title', async () => {
    const conv = createConversation({
      id: 'search-title',
      title: 'TypeScript Tutorial',
      messages: [createMessage({ content: 'some content' })],
    });
    await saveConversation(conv);

    const results = await searchConversations('TypeScript');
    expect(results.length).toBe(1);
    expect(results[0].matchType).toBe('title');
  });

  it('searchConversations finds by content', async () => {
    const conv = createConversation({
      id: 'search-content',
      title: 'General Chat',
      messages: [createMessage({ content: 'The fibonacci sequence is interesting' })],
    });
    await saveConversation(conv);

    const results = await searchConversations('fibonacci');
    expect(results.length).toBe(1);
    expect(results[0].matchType).toBe('content');
    expect(results[0].matchedSnippet).toContain('fibonacci');
  });

  it('clearFolderFromConversations removes folderId', async () => {
    const conv = createConversation({
      id: 'folder-clear',
      title: 'In Folder',
      folderId: 'folder-abc',
    });
    await saveConversation(conv);

    await clearFolderFromConversations('folder-abc');

    const retrieved = await getConversation('folder-clear');
    expect(retrieved).toBeDefined();
    expect(retrieved!.folderId).toBeUndefined();

    const list = await listConversations();
    expect(list[0].folderId).toBeUndefined();
  });

  it('save updates existing conversation', async () => {
    const conv = createConversation({
      id: 'update-test',
      title: 'Original',
    });
    await saveConversation(conv);

    conv.title = 'Updated';
    conv.messages = [createMessage({ content: 'New message' })];
    await saveConversation(conv);

    const retrieved = await getConversation('update-test');
    expect(retrieved!.title).toBe('Updated');
    expect(retrieved!.messages.length).toBe(1);

    // Should still be only 1 in the index
    const list = await listConversations();
    expect(list.length).toBe(1);
  });

  it('get returns null for nonexistent conversation', async () => {
    const result = await getConversation('nonexistent-id');
    expect(result).toBeNull();
  });

  it('search returns empty for no matches', async () => {
    const conv = createConversation({
      id: 'no-match',
      title: 'Hello',
      messages: [createMessage({ content: 'World' })],
    });
    await saveConversation(conv);

    const results = await searchConversations('zzz_no_match_xyz');
    expect(results.length).toBe(0);
  });

  it('handles tags in conversation metadata', async () => {
    const conv = createConversation({
      id: 'tags-test',
      title: 'Tagged',
      tags: ['important', 'work'],
    });
    await saveConversation(conv);

    const list = await listConversations();
    expect(list[0].tags).toEqual(['important', 'work']);
  });
});
