import { NextRequest, NextResponse } from 'next/server';
import { getHookLogs, clearHookLogs } from '@/lib/hooks/log';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hookId = searchParams.get('hookId') || undefined;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const logs = await getHookLogs(hookId, limit);
    return NextResponse.json(logs);
  } catch (error) {
    console.error('[HOOK_LOGS_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to get hook logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearHookLogs();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HOOK_LOGS_CLEAR_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to clear hook logs' }, { status: 500 });
  }
}
