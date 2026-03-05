import { NextRequest, NextResponse } from 'next/server';
import { loadHooks, addHook } from '@/lib/hooks/storage';
import { EventHook, HookTrigger, HookAction } from '@/types/hooks';
import { v4 as uuidv4 } from 'uuid';

const VALID_TRIGGERS: HookTrigger[] = [
  'on_message_received', 'on_response_complete', 'on_tool_start',
  'on_tool_end', 'on_error', 'on_conversation_created',
];
const VALID_ACTIONS: HookAction[] = ['webhook', 'log', 'memory_save'];

export async function GET() {
  try {
    const hooks = await loadHooks();
    return NextResponse.json(hooks);
  } catch (error) {
    console.error('[HOOKS_LIST_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to load hooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.trigger || !VALID_TRIGGERS.includes(body.trigger)) {
      return NextResponse.json({ error: `trigger must be one of: ${VALID_TRIGGERS.join(', ')}` }, { status: 400 });
    }
    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
    }
    if (!body.actionConfig || typeof body.actionConfig !== 'object') {
      return NextResponse.json({ error: 'actionConfig is required' }, { status: 400 });
    }

    if (body.action === 'webhook') {
      if (!body.actionConfig.url || typeof body.actionConfig.url !== 'string') {
        return NextResponse.json({ error: 'actionConfig.url is required for webhook action' }, { status: 400 });
      }
    }
    if (body.action === 'log') {
      if (!body.actionConfig.filePath || typeof body.actionConfig.filePath !== 'string') {
        return NextResponse.json({ error: 'actionConfig.filePath is required for log action' }, { status: 400 });
      }
    }

    const hook: EventHook = {
      id: uuidv4(),
      name: body.name,
      description: body.description,
      trigger: body.trigger,
      action: body.action,
      actionConfig: body.actionConfig,
      filters: body.filters || [],
      enabled: body.enabled !== false,
      createdAt: Date.now(),
      triggerCount: 0,
    };

    await addHook(hook);
    return NextResponse.json(hook, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create hook';
    console.error('[HOOKS_CREATE_ERROR]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
