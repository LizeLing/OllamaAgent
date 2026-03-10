import { NextResponse } from 'next/server';
import { getMemoryCount, getMemoryList, purgeExpiredMemories } from '@/lib/memory/vector-store';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import type { MemoryCategory } from '@/lib/memory/structured-memory';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const list = searchParams.get('list');

    if (list === 'true') {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const category = searchParams.get('category') || undefined;

      const result = await getMemoryList({ page, limit, category });
      return NextResponse.json(result);
    }

    const count = await getMemoryCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Failed to get memories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    const settings = await loadSettings();
    const manager = new MemoryManager(
      settings.ollamaUrl,
      settings.embeddingModel,
      settings.memoryCategories
    );

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const category = (formData.get('category') as string) || 'general';

      if (!file) {
        return NextResponse.json({ error: 'file is required' }, { status: 400 });
      }

      const text = await file.text();
      if (!text.trim()) {
        return NextResponse.json({ error: 'File is empty' }, { status: 400 });
      }

      const id = await manager.saveManualMemory(text.slice(0, 5000), category as MemoryCategory);
      return NextResponse.json({ id });
    }

    const body = await request.json();
    const { type, content, category = 'general' } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    let id: string;
    if (type === 'url') {
      id = await manager.saveFromUrl(content, category);
    } else {
      id = await manager.saveManualMemory(content, category);
    }

    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save memory' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxAgeDays = parseInt(searchParams.get('maxAgeDays') || '30');
    const maxCount = parseInt(searchParams.get('maxCount') || '1000');

    const deleted = await purgeExpiredMemories(maxAgeDays, maxCount);
    const remaining = await getMemoryCount();

    return NextResponse.json({ deleted, remaining });
  } catch {
    return NextResponse.json({ error: 'Failed to purge memories' }, { status: 500 });
  }
}
