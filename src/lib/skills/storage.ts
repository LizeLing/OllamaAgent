import { AgentSkill } from '@/types/skills';
import { DEFAULT_SKILLS } from './defaults';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const SKILLS_DIR = path.join(DATA_DIR, 'skills');

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID: ${id}`);
  }
}

async function ensureDir() {
  await fs.mkdir(SKILLS_DIR, { recursive: true });
}

async function loadCustomSkills(): Promise<AgentSkill[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(SKILLS_DIR);
    const skills: AgentSkill[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(SKILLS_DIR, file), 'utf-8');
        skills.push(JSON.parse(data));
      } catch {
        // Skip invalid skill file
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export async function listSkills(): Promise<AgentSkill[]> {
  const custom = await loadCustomSkills();
  return [...DEFAULT_SKILLS, ...custom];
}

export async function getSkill(id: string): Promise<AgentSkill | null> {
  const defaultSkill = DEFAULT_SKILLS.find((s) => s.id === id);
  if (defaultSkill) return defaultSkill;

  try {
    validateId(id);
    const data = await fs.readFile(path.join(SKILLS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveSkill(skill: AgentSkill): Promise<void> {
  await ensureDir();
  validateId(skill.id);
  await fs.writeFile(path.join(SKILLS_DIR, `${skill.id}.json`), JSON.stringify(skill, null, 2));
}

export async function deleteSkill(id: string): Promise<boolean> {
  if (DEFAULT_SKILLS.some((s) => s.id === id)) {
    return false;
  }
  try {
    validateId(id);
    await fs.unlink(path.join(SKILLS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
