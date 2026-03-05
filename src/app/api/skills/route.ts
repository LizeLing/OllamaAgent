import { NextRequest, NextResponse } from 'next/server';
import { listSkills, saveSkill } from '@/lib/skills/storage';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const skills = await listSkills();
  return NextResponse.json({ skills });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const skill = {
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
}
