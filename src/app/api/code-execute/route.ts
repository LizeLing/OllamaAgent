import { NextRequest } from 'next/server';
import Docker from 'dockerode';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

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
  typescript: {
    image: 'node:22-slim',
    cmd: (code) => ['node', '-e', code],
  },
  bash: {
    image: 'alpine:latest',
    cmd: (code) => ['sh', '-c', code],
  },
  sh: {
    image: 'alpine:latest',
    cmd: (code) => ['sh', '-c', code],
  },
};

export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(`code-execute:${clientIP}`, RATE_LIMITS.api)) {
    return Response.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
  }

  let body: { language?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const language = typeof body.language === 'string' ? body.language.toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code : '';

  if (!language || !code) {
    return Response.json({ error: 'language and code are required' }, { status: 400 });
  }

  if (code.length > 50000) {
    return Response.json({ error: 'Code too long (max 50000 chars)' }, { status: 400 });
  }

  const config = LANGUAGE_CONFIGS[language];
  if (!config) {
    return Response.json(
      { error: `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_CONFIGS).join(', ')}` },
      { status: 400 }
    );
  }

  // Check Docker availability
  try {
    await docker.ping();
  } catch {
    return Response.json({ error: 'Docker is not available' }, { status: 503 });
  }

  try {
    const container = await docker.createContainer({
      Image: config.image,
      Cmd: config.cmd(code),
      HostConfig: {
        Memory: 256 * 1024 * 1024,
        MemorySwap: 256 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,
        NetworkMode: 'none',
        AutoRemove: true,
      },
      NetworkDisabled: true,
    });

    await container.start();

    const waitPromise = container.wait();
    const timeoutPromise = new Promise<{ StatusCode: number }>((_, reject) =>
      setTimeout(() => reject(new Error('Execution timed out (30s)')), 30000)
    );

    let statusCode: number;
    try {
      const result = await Promise.race([waitPromise, timeoutPromise]);
      statusCode = result.StatusCode;
    } catch (err) {
      // 타임아웃 전 로그를 먼저 수집
      let partialOutput = '';
      try {
        const logs = await container.logs({ stdout: true, stderr: true });
        partialOutput = logs.toString('utf-8').replace(/[\x00-\x08]/g, '').trim();
      } catch { /* 로그 수집 실패 시 무시 */ }
      try { await container.kill(); } catch { /* already stopped */ }
      return Response.json({
        success: false,
        output: partialOutput || undefined,
        error: err instanceof Error ? err.message : 'Execution timed out',
        timedOut: true,
      });
    }

    const logs = await container.logs({ stdout: true, stderr: true });
    let output = logs.toString('utf-8');
    output = output.replace(/[\x00-\x08]/g, '').trim();

    if (output.length > 10000) {
      output = output.slice(0, 10000) + '\n... (truncated)';
    }

    return Response.json({
      success: statusCode === 0,
      output: output || '(no output)',
      exitCode: statusCode,
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: `Execution failed: ${err instanceof Error ? err.message : 'Unknown'}`,
    }, { status: 500 });
  }
}
