import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.log',
  '.ts', '.js', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php',
  '.html', '.css', '.xml', '.yaml', '.yml', '.toml',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.zip',
];

const TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.log',
  '.ts', '.js', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php',
  '.html', '.css', '.xml', '.yaml', '.yml', '.toml',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // File size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 너무 큽니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB까지 업로드 가능합니다.` },
        { status: 413 }
      );
    }

    // Extension check
    const ext = path.extname(file.name).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다: ${ext}` },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(DATA_DIR, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    const bytes = await file.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(bytes));

    // If text file, read content and try to save to memory
    const isText = TEXT_EXTENSIONS.includes(ext);
    let textContent: string | undefined;

    if (isText) {
      textContent = Buffer.from(bytes).toString('utf-8');
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
