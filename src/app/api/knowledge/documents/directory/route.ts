import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { collectionId, directoryPath } = body;

    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }
    if (!directoryPath || typeof directoryPath !== 'string') {
      return NextResponse.json({ error: 'directoryPath is required' }, { status: 400 });
    }

    const resolved = path.resolve(directoryPath);

    // 디렉토리 존재 확인
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: '지정된 경로가 디렉토리가 아닙니다' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: '디렉토리를 찾을 수 없습니다' }, { status: 404 });
    }

    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const result = await manager.addDirectory(collectionId, resolved);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add directory' },
      { status: 500 }
    );
  }
}
