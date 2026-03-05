import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const uploadsDir = path.join(DATA_DIR, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name);
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    const bytes = await file.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(bytes));

    // If text file, read content and try to save to memory
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.log', '.ts', '.js', '.py'];
    const isText = textExtensions.includes(ext.toLowerCase());
    let textContent: string | undefined;

    if (isText) {
      textContent = Buffer.from(bytes).toString('utf-8');
      // Save to memory
      try {
        const settings = await loadSettings();
        const memoryManager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
        await memoryManager.saveMemory(
          `File: ${file.name}\n${textContent.slice(0, 2000)}`,
          { type: 'upload', filename: file.name }
        );
      } catch {
        // Memory save failed, file is still uploaded
      }
    }

    return NextResponse.json({
      filename,
      originalName: file.name,
      path: filepath,
      size: file.size,
      content: textContent?.slice(0, 5000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
