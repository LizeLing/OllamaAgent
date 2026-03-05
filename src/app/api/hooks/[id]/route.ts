import { NextRequest, NextResponse } from 'next/server';
import { loadHooks, updateHook, removeHook } from '@/lib/hooks/storage';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const hooks = await loadHooks();
    const hook = hooks.find(h => h.id === id);
    if (!hook) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }
    return NextResponse.json(hook);
  } catch (error) {
    console.error('[HOOK_GET_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to get hook' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateHook(id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[HOOK_UPDATE_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to update hook' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const removed = await removeHook(id);
    if (!removed) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HOOK_DELETE_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to delete hook' }, { status: 500 });
  }
}
