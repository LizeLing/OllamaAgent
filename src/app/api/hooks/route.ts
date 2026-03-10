import { NextRequest, NextResponse } from 'next/server';
import { loadHooks, addHook } from '@/lib/hooks/storage';
import { EventHook, HookFilter } from '@/types/hooks';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler } from '@/lib/api/handler';
import { createHookSchema } from '@/lib/api/schemas';

export const GET = withErrorHandler('HOOKS', async () => {
  const hooks = await loadHooks();
  return NextResponse.json(hooks);
});

export const POST = withErrorHandler('HOOKS', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = createHookSchema.parse(body);

  const hook: EventHook = {
    id: uuidv4(),
    name: parsed.name,
    description: parsed.description,
    trigger: parsed.trigger,
    action: parsed.action,
    actionConfig: parsed.actionConfig,
    filters: parsed.filters as HookFilter[],
    enabled: parsed.enabled,
    createdAt: Date.now(),
    triggerCount: 0,
  };

  await addHook(hook);
  return NextResponse.json(hook, { status: 201 });
});
