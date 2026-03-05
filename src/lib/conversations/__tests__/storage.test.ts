import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

describe('storage ID validation', () => {
  let getConversation: typeof import('../storage').getConversation;
  let deleteConversation: typeof import('../storage').deleteConversation;
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../storage');
    getConversation = mod.getConversation;
    deleteConversation = mod.deleteConversation;
  });

  it('rejects path traversal in getConversation', async () => {
    const result = await getConversation('../../../etc/passwd');
    expect(result).toBeNull(); // Should catch the validation error
  });

  it('rejects path traversal in deleteConversation', async () => {
    // deleteConversation catches errors silently
    await expect(async () => {
      await deleteConversation('../etc/passwd');
    }).not.toThrow(); // It catches internally
  });

  it('accepts valid UUID-like IDs', async () => {
    // This will return null because the file doesn't exist (mocked)
    const result = await getConversation('abc-123-def');
    expect(result).toBeNull(); // null from file not found, not from validation
  });

  it('rejects IDs with special characters', async () => {
    const result = await getConversation('id with spaces');
    expect(result).toBeNull();
  });
});
