import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    await manager.deleteCollection(id);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
