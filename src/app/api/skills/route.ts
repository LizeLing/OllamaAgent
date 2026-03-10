import { NextRequest, NextResponse } from 'next/server';
import { listSkills, saveSkill } from '@/lib/skills/storage';
import { AgentSkill } from '@/types/skills';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler } from '@/lib/api/handler';

export const GET = withErrorHandler('SKILLS', async () => {
  const skills = await listSkills();
  return NextResponse.json({ skills });
});

export const POST = withErrorHandler('SKILLS', async (request: NextRequest) => {
  const body = await request.json();
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const skill: AgentSkill = {
    id: uuidv4(),
    name: body.name,
    description: body.description || '',
    icon: body.icon,
    triggerCommand: body.triggerCommand,
    systemPromptOverride: body.systemPromptOverride,
    enabledTools: body.enabledTools || [],
    model: body.model,
    maxIterations: body.maxIterations,
    workflow: body.workflow || [],
    isBuiltin: false,
  };
  await saveSkill(skill);
  return NextResponse.json({ skill });
});
