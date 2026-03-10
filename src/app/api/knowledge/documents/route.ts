import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collectionId');

    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }

    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const documents = await manager.listDocuments(collectionId);
    return NextResponse.json(documents);
  } catch {
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const collectionId = formData.get('collectionId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const id = await manager.addDocument(collectionId, file.name, buffer);

    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add document' },
      { status: 500 }
    );
  }
}
