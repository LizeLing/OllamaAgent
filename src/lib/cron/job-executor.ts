import {
  CronJob,
  CronRunResult,
  AgentRunConfig,
  HttpRequestConfig,
  MemoryCleanupConfig,
  HealthCheckConfig,
} from '@/types/cron';
import { loadSettings } from '@/lib/config/settings';
import { initializeTools } from '@/lib/tools/init';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { MemoryManager } from '@/lib/memory/memory-manager';

const runningJobs = new Set<string>();

export class CronJobExecutor {
  static async executeJob(job: CronJob): Promise<CronRunResult> {
    if (runningJobs.has(job.id)) {
      return {
        jobId: job.id,
        startedAt: Date.now(),
        completedAt: Date.now(),
        success: false,
        error: 'Job already running',
      };
    }

    runningJobs.add(job.id);
    const startedAt = Date.now();

    try {
      let output: string;
      switch (job.jobType) {
        case 'agent_run':
          output = await executeAgentRun(job.jobConfig as AgentRunConfig);
          break;
        case 'http_request':
          output = await executeHttpRequest(job.jobConfig as HttpRequestConfig);
          break;
        case 'memory_cleanup':
          output = await executeMemoryCleanup(job.jobConfig as MemoryCleanupConfig);
          break;
        case 'health_check':
          output = await executeHealthCheck(job.jobConfig as HealthCheckConfig);
          break;
      }
      return {
        jobId: job.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output: output.slice(0, 2000),
      };
    } catch (err) {
      return {
        jobId: job.id,
        startedAt,
        completedAt: Date.now(),
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    } finally {
      runningJobs.delete(job.id);
    }
  }
}

async function executeAgentRun(config: AgentRunConfig): Promise<string> {
  const settings = await loadSettings();
  await initializeTools(
    settings.allowedPaths,
    settings.deniedPaths,
    settings.searxngUrl,
    settings.ollamaUrl,
    settings.imageModel
  );

  const agentConfig = {
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: config.model || settings.ollamaModel,
    maxIterations: 5,
    systemPrompt: config.systemPrompt || settings.systemPrompt,
    allowedPaths: settings.allowedPaths,
    deniedPaths: settings.deniedPaths,
    toolApprovalMode: 'auto' as const,
    modelOptions: settings.modelOptions,
    fallbackModels: settings.fallbackModels,
  };

  const chunks: string[] = [];
  for await (const event of runAgentLoop(agentConfig, config.prompt, [])) {
    if (event.type === 'token' && event.data.content) {
      chunks.push(event.data.content as string);
    }
  }

  return chunks.join('').slice(0, 8000);
}

async function executeHttpRequest(config: HttpRequestConfig): Promise<string> {
  const res = await fetch(config.url, {
    method: config.method,
    headers: config.headers,
    body: config.method !== 'GET' ? config.body : undefined,
    signal: AbortSignal.timeout(30000),
  });

  const body = await res.text();
  return `Status: ${res.status}\n${body.slice(0, 1500)}`;
}

async function executeMemoryCleanup(config: MemoryCleanupConfig): Promise<string> {
  const settings = await loadSettings();
  const manager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
  const purged = await manager.purgeOld(config.maxAgeDays, config.maxCount);
  return `${purged}개의 오래된 메모리가 정리되었습니다.`;
}

async function executeHealthCheck(config: HealthCheckConfig): Promise<string> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const status = `Health check: ${res.ok ? 'OK' : 'FAIL'}\n${JSON.stringify(data)}`;

    if (!res.ok && config.notifyUrl) {
      await fetch(config.notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unhealthy', data, timestamp: Date.now() }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }

    return status;
  } catch (err) {
    const errorMsg = `Health check failed: ${err instanceof Error ? err.message : 'Unknown'}`;

    if (config.notifyUrl) {
      await fetch(config.notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unreachable', error: errorMsg, timestamp: Date.now() }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }

    return errorMsg;
  }
}
