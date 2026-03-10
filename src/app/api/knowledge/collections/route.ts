import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function GET() {
  try {
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const collections = await manager.listCollections();
    return NextResponse.json(collections);
  } catch {
    return NextResponse.json({ error: 'Failed to list collections' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const id = await manager.createCollection(name.trim());
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
