import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';

function isPathAllowed(
  targetPath: string,
  allowedPaths: string[],
  deniedPaths: string[]
): boolean {
  const resolved = path.resolve(targetPath);
  const isDenied = deniedPaths.some((d) => resolved.startsWith(d));
  if (isDenied) return false;
  if (allowedPaths.length === 0) return true;
  return allowedPaths.some((a) => resolved.startsWith(a));
}

/**
 * Task Mode writeScope 검증.
 * - writeScope가 undefined이면 제약 없음
 * - writeScope가 빈 배열 []이면 모든 쓰기를 거부(allowlist 의미상)
 * - writeScope의 glob 중 하나라도 대상 경로(repo cwd 기준 상대)에 매칭되면 허용
 * - cwd 밖 경로는 항상 거부한다
 */
export function isWithinWriteScope(
  targetAbsolutePath: string,
  writeScope: string[] | undefined,
  cwd: string = process.cwd()
): { ok: true } | { ok: false; reason: string } {
  if (writeScope === undefined) return { ok: true };
  const resolved = path.resolve(targetAbsolutePath);
  const rel = path.relative(cwd, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: `writeScope 밖의 경로입니다 (cwd 바깥): ${targetAbsolutePath}` };
  }
  if (writeScope.length === 0) {
    return { ok: false, reason: `writeScope가 비어 있어 모든 쓰기가 차단됩니다: ${targetAbsolutePath}` };
  }
  const normalized = rel.split(path.sep).join('/');
  const matched = writeScope.some((pattern) => minimatch(normalized, pattern, { dot: true }));
  if (!matched) {
    return {
      ok: false,
      reason: `이 Task의 writeScope 밖입니다: ${normalized} (허용: ${writeScope.join(', ')})`,
    };
  }
  return { ok: true };
}

export class FilesystemReadTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'filesystem_read',
    description: '파일 내용을 읽습니다.',
    parameters: [
      { name: 'path', type: 'string', description: '읽을 파일의 절대 경로', required: true },
    ],
  };

  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[]
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;
    if (!filePath) return this.error('path is required');
    if (!isPathAllowed(filePath, this.allowedPaths, this.deniedPaths)) {
      return this.error(`Access denied: ${filePath}`);
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const truncated = content.length > 10000 ? content.slice(0, 10000) + '\n... (truncated)' : content;
      return this.success(truncated);
    } catch (err) {
      return this.error(`Failed to read file: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}

export class FilesystemWriteTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'filesystem_write',
    description: '파일에 내용을 씁니다. 디렉토리가 없으면 자동 생성됩니다.',
    parameters: [
      { name: 'path', type: 'string', description: '쓸 파일의 절대 경로', required: true },
      { name: 'content', type: 'string', description: '파일에 쓸 내용', required: true },
    ],
  };

  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[],
    private writeScope?: string[]
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;
    const content = args.content as string;
    if (!filePath || content === undefined) return this.error('path and content are required');
    if (!isPathAllowed(filePath, this.allowedPaths, this.deniedPaths)) {
      return this.error(`Access denied: ${filePath}`);
    }
    const scopeCheck = isWithinWriteScope(filePath, this.writeScope);
    if (!scopeCheck.ok) {
      return this.error(scopeCheck.reason);
    }
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return this.success(`File written: ${filePath} (${content.length} bytes)`);
    } catch (err) {
      return this.error(`Failed to write: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}

export class FilesystemListTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'filesystem_list',
    description: '디렉토리의 파일과 폴더 목록을 반환합니다.',
    parameters: [
      { name: 'path', type: 'string', description: '디렉토리 절대 경로', required: true },
    ],
  };

  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[]
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = args.path as string;
    if (!dirPath) return this.error('path is required');
    if (!isPathAllowed(dirPath, this.allowedPaths, this.deniedPaths)) {
      return this.error(`Access denied: ${dirPath}`);
    }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      }));
      return this.success(JSON.stringify(items, null, 2));
    } catch (err) {
      return this.error(`Failed to list: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}

export class FilesystemSearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'filesystem_search',
    description: 'glob 패턴으로 파일을 검색합니다.',
    parameters: [
      { name: 'pattern', type: 'string', description: 'glob 패턴 (예: **/*.ts)', required: true },
      { name: 'cwd', type: 'string', description: '검색 시작 디렉토리', required: true },
    ],
  };

  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[]
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const cwd = args.cwd as string;
    if (!pattern || !cwd) return this.error('pattern and cwd are required');
    if (!isPathAllowed(cwd, this.allowedPaths, this.deniedPaths)) {
      return this.error(`Access denied: ${cwd}`);
    }
    try {
      const files = await glob(pattern, { cwd, absolute: true, nodir: true });
      const limited = files.slice(0, 50);
      const result = limited.join('\n');
      return this.success(
        files.length > 50 ? `${result}\n... and ${files.length - 50} more files` : result || 'No files found'
      );
    } catch (err) {
      return this.error(`Search failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
