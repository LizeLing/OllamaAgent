import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import Docker from 'dockerode';

const docker = new Docker();

const LANGUAGE_CONFIGS: Record<string, { image: string; cmd: (code: string) => string[] }> = {
  python: {
    image: 'python:3.12-slim',
    cmd: (code) => ['python', '-c', code],
  },
  javascript: {
    image: 'node:22-slim',
    cmd: (code) => ['node', '-e', code],
  },
  bash: {
    image: 'alpine:latest',
    cmd: (code) => ['sh', '-c', code],
  },
};

export class CodeExecutorTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'code_execute',
    description:
      'Docker 샌드박스에서 코드를 실행합니다. 지원 언어: python, javascript, bash',
    parameters: [
      { name: 'language', type: 'string', description: '프로그래밍 언어 (python, javascript, bash)', required: true },
      { name: 'code', type: 'string', description: '실행할 코드', required: true },
    ],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const language = (args.language as string || '').toLowerCase();
    const code = args.code as string;

    if (!language || !code) return this.error('language and code are required');

    const config = LANGUAGE_CONFIGS[language];
    if (!config) {
      return this.error(`Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_CONFIGS).join(', ')}`);
    }

    try {
      // Check Docker availability
      await docker.ping();
    } catch {
      return this.error('Docker is not available. Cannot execute code.');
    }

    try {
      const container = await docker.createContainer({
        Image: config.image,
        Cmd: config.cmd(code),
        HostConfig: {
          Memory: 256 * 1024 * 1024, // 256MB
          MemorySwap: 256 * 1024 * 1024,
          CpuPeriod: 100000,
          CpuQuota: 50000, // 50% CPU
          NetworkMode: 'none',
          AutoRemove: true,
        },
        NetworkDisabled: true,
      });

      await container.start();

      // Wait with timeout
      const waitPromise = container.wait();
      const timeoutPromise = new Promise<{ StatusCode: number }>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timed out (30s)')), 30000)
      );

      let statusCode: number;
      try {
        const result = await Promise.race([waitPromise, timeoutPromise]);
        statusCode = result.StatusCode;
      } catch (err) {
        try { await container.kill(); } catch { /* already stopped */ }
        return this.error(err instanceof Error ? err.message : 'Execution timed out');
      }

      // Get logs
      const logs = await container.logs({ stdout: true, stderr: true });
      let output = logs.toString('utf-8');

      // Strip Docker stream headers (8-byte prefix per chunk)
      output = output.replace(/[\x00-\x08]/g, '').trim();

      if (output.length > 5000) {
        output = output.slice(0, 5000) + '\n... (truncated)';
      }

      if (statusCode !== 0) {
        return this.error(`Exit code ${statusCode}:\n${output}`);
      }

      return this.success(output || '(no output)');
    } catch (err) {
      return this.error(`Code execution failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
