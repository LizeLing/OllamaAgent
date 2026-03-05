import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';
import fs from 'fs/promises';
import path from 'path';

let cleanup: () => Promise<void>;
let dataDir: string;

// Dynamic imports for modules that read DATA_DIR at load time
let loadSettings: typeof import('../settings').loadSettings;
let saveSettings: typeof import('../settings').saveSettings;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../settings');
  loadSettings = mod.loadSettings;
  saveSettings = mod.saveSettings;
}

describe('Settings Integration', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    dataDir = setup.dataDir;
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('save and load roundtrip', async () => {
    const saved = await saveSettings({
      ollamaModel: 'test-model',
      maxIterations: 20,
    });

    expect(saved.ollamaModel).toBe('test-model');
    expect(saved.maxIterations).toBe(20);

    // Reload module to test persistence
    await reloadModule();
    const loaded = await loadSettings();
    expect(loaded.ollamaModel).toBe('test-model');
    expect(loaded.maxIterations).toBe(20);
  });

  it('partial update preserves existing values', async () => {
    await saveSettings({ ollamaModel: 'model-a', maxIterations: 5 });
    await reloadModule();

    await saveSettings({ maxIterations: 15 });
    await reloadModule();

    const loaded = await loadSettings();
    expect(loaded.ollamaModel).toBe('model-a'); // preserved
    expect(loaded.maxIterations).toBe(15); // updated
  });

  it('corrupted file returns defaults', async () => {
    // Write corrupted JSON
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'settings.json'),
      'THIS IS NOT JSON{{{{'
    );

    await reloadModule();
    const loaded = await loadSettings();

    // Should return defaults
    expect(loaded.maxIterations).toBeDefined();
    expect(loaded.systemPrompt).toBeDefined();
    expect(loaded.ollamaUrl).toBeDefined();
  });

  it('missing file returns defaults', async () => {
    const loaded = await loadSettings();

    expect(loaded).toBeDefined();
    expect(loaded.maxIterations).toBeDefined();
    expect(loaded.systemPrompt).toBeDefined();
    expect(loaded.responseLanguage).toBeDefined();
  });
});
