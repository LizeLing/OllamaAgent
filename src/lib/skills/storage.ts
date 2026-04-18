import { AgentSkill } from '@/types/skills';
import { DEFAULT_SKILLS } from './defaults';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';
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

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { meta, body: match[2] };
}

async function loadFolderSkill(dirPath: string, dirName: string): Promise<AgentSkill | null> {
  try {
    const skillMd = await fs.readFile(path.join(dirPath, 'SKILL.md'), 'utf-8');
    const { meta, body } = parseFrontmatter(skillMd);
    return {
      id: dirName,
      name: meta.name || dirName,
      description: meta.description || '',
      icon: meta.icon,
      triggerCommand: meta.triggerCommand || meta.trigger,
      enabledTools: meta.enabledTools ? meta.enabledTools.split(',').map((t) => t.trim()) : [],
      workflow: [{ id: 'main', instruction: body.trim() }],
      isBuiltin: false,
    };
  } catch (err) {
    logger.debug('SKILLS', `Failed to load folder skill: ${dirName}`, err);
    return null;
  }
}

async function loadCustomSkills(): Promise<AgentSkill[]> {
  try {
    await ensureDir();
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills: AgentSkill[] = [];
    for (const entry of entries) {
      try {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const data = await fs.readFile(path.join(SKILLS_DIR, entry.name), 'utf-8');
          skills.push(JSON.parse(data));
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const skill = await loadFolderSkill(path.join(SKILLS_DIR, entry.name), entry.name);
          if (skill) skills.push(skill);
        }
      } catch (err) {
        logger.warn('SKILLS', `Failed to load skill entry: ${entry.name}`, err);
      }
    }
    return skills;
  } catch (err) {
    logger.warn('SKILLS', 'Failed to load custom skills directory', err);
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

    // JSON 파일 기반 스킬
    try {
      const data = await fs.readFile(path.join(SKILLS_DIR, `${id}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      // JSON 파일이 없으면 폴더 기반 스킬 확인
    }

    // 폴더 기반 스킬 (SKILL.md)
    const dirPath = path.join(SKILLS_DIR, id);
    const stat = await fs.stat(dirPath);
    if (stat.isDirectory()) {
      return loadFolderSkill(dirPath, id);
    }

    return null;
  } catch (err) {
    logger.debug('SKILLS', `Skill not found: ${id}`, err);
    return null;
  }
}

export async function saveSkill(skill: AgentSkill): Promise<void> {
  await ensureDir();
  validateId(skill.id);
  await atomicWriteJSON(path.join(SKILLS_DIR, `${skill.id}.json`), skill);
}

export async function deleteSkill(id: string): Promise<boolean> {
  if (DEFAULT_SKILLS.some((s) => s.id === id)) {
    return false;
  }
  try {
    validateId(id);

    // JSON 파일 기반 스킬
    try {
      await fs.unlink(path.join(SKILLS_DIR, `${id}.json`));
      return true;
    } catch {
      // JSON 파일이 없으면 폴더 기반 스킬 확인
    }

    // 폴더 기반 스킬
    const dirPath = path.join(SKILLS_DIR, id);
    const stat = await fs.stat(dirPath);
    if (stat.isDirectory()) {
      await fs.rm(dirPath, { recursive: true });
      return true;
    }

    return false;
  } catch (err) {
    logger.warn('SKILLS', `Failed to delete skill: ${id}`, err);
    return false;
  }
}
