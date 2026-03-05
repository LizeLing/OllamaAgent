import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { CustomToolDef } from '@/types/settings';
import { validateUrlForSSRF } from './url-validator';

export class CustomTool extends BaseTool {
  definition: ToolDefinition;
  private config: CustomToolDef;

  constructor(config: CustomToolDef) {
    super();
    this.config = config;
    this.definition = {
      name: `custom_${config.name}`,
      description: config.description,
      parameters: config.parameters,
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      let url = this.config.url;
      let body: string | undefined;

      if (this.config.method === 'GET') {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(args)) params.set(k, String(v));
        url += '?' + params.toString();
      } else if (this.config.bodyTemplate) {
        body = this.config.bodyTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => String(args[key] || ''));
      } else {
        body = JSON.stringify(args);
      }

      // SSRF prevention
      const urlCheck = validateUrlForSSRF(url);
      if (!urlCheck.valid) {
        return this.error(urlCheck.error || '유효하지 않은 URL입니다.');
      }

      const res = await fetch(url, {
        method: this.config.method,
        headers: { 'Content-Type': 'application/json', ...this.config.headers },
        body: this.config.method !== 'GET' ? body : undefined,
        signal: AbortSignal.timeout(30000),
      });

      const text = await res.text();
      return res.ok ? this.success(text.slice(0, 5000)) : this.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    } catch (err) {
      return this.error(err instanceof Error ? err.message : 'Unknown error');
    }
  }
}
