import { NextRequest, NextResponse } from 'next/server';
import { getHookLogs, clearHookLogs } from '@/lib/hooks/log';
import { logger, getErrorMessage } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hookId = searchParams.get('hookId') || undefined;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const logs = await getHookLogs(hookId, limit);
    return NextResponse.json(logs);
  } catch (error) {
    logger.error('HOOK_LOGS', 'Failed to get hook logs', getErrorMessage(error));
    return NextResponse.json({ error: 'Failed to get hook logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearHookLogs();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('HOOK_LOGS', 'Failed to clear hook logs', getErrorMessage(error));
    return NextResponse.json({ error: 'Failed to clear hook logs' }, { status: 500 });
  }
}
