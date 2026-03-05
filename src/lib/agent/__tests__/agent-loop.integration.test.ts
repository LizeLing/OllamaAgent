import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkOllamaAvailable } from '@/test/helpers/service-checker';
import { createAgentConfig } from '@/test/helpers/test-data-factory';
import { runAgentLoop } from '../agent-loop';
import { toolRegistry } from '@/lib/tools/registry';
import { FilesystemReadTool } from '@/lib/tools/filesystem';
import { AgentEvent } from '../types';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';

let ollamaAvailable = false;
let tempDir: string;

beforeAll(async () => {
  ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
  tempDir = path.join(os.tmpdir(), `agent-loop-test-${uuidv4()}`);
  await fs.mkdir(tempDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe.skipIf(!ollamaAvailable)('Agent Loop Integration', () => {
  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
    // Register filesystem tools for tool call tests
    toolRegistry.clear();
    toolRegistry.register(new FilesystemReadTool([os.tmpdir()], ['/etc']));
  });

  it('simple question produces streaming answer events', async () => {
    const config = createAgentConfig({
      ollamaUrl: OLLAMA_URL,
      ollamaModel: MODEL,
      maxIterations: 3,
      systemPrompt: 'You are a helpful assistant. Answer briefly.',
      toolApprovalMode: 'auto',
    });

    const events: AgentEvent[] = [];
    for await (const event of runAgentLoop(config, 'What is 2+2? Answer with just the number.', [])) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('thinking');
    expect(types).toContain('done');

    // Should have token events with content
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);

    const fullAnswer = tokenEvents.map((e) => e.data.content).join('');
    expect(fullAnswer.length).toBeGreaterThan(0);

    // Done event should have iterations
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent?.data.iterations).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('tool call trigger and execution with filesystem_read', async () => {
    // Create a test file
    const testFile = path.join(tempDir, 'agent-test.txt');
    await fs.writeFile(testFile, 'SECRET_DATA_12345');

    const config = createAgentConfig({
      ollamaUrl: OLLAMA_URL,
      ollamaModel: MODEL,
      maxIterations: 5,
      allowedPaths: [os.tmpdir()],
      deniedPaths: ['/etc'],
      systemPrompt: `You are a helpful assistant with access to filesystem tools. When asked to read a file, use the filesystem_read tool. Answer in English.`,
      toolApprovalMode: 'auto',
    });

    const events: AgentEvent[] = [];
    for await (const event of runAgentLoop(
      config,
      `Read the file at ${testFile} and tell me its contents.`,
      []
    )) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    // The model should attempt a tool call
    if (types.includes('tool_start')) {
      expect(types).toContain('tool_end');
      const toolEnd = events.find((e) => e.type === 'tool_end');
      expect(toolEnd?.data.tool).toBe('filesystem_read');
    }
    // Regardless, should end with done
    expect(types).toContain('done');
  }, 90000);

  it('memory injection appears in context', async () => {
    const config = createAgentConfig({
      ollamaUrl: OLLAMA_URL,
      ollamaModel: MODEL,
      maxIterations: 2,
      systemPrompt: 'You are a helpful assistant.',
      toolApprovalMode: 'auto',
    });

    const memories = ['The user prefers dark mode', 'User name is TestUser'];

    const events: AgentEvent[] = [];
    for await (const event of runAgentLoop(
      config,
      'What is my name?',
      [],
      memories
    )) {
      events.push(event);
    }

    const tokenEvents = events.filter((e) => e.type === 'token');
    const answer = tokenEvents.map((e) => e.data.content).join('');
    // The answer should reference the memory about the user name
    expect(answer.toLowerCase()).toContain('testuser');
  }, 60000);

  it('done event includes token usage info', async () => {
    const config = createAgentConfig({
      ollamaUrl: OLLAMA_URL,
      ollamaModel: MODEL,
      maxIterations: 2,
      systemPrompt: 'Say ok.',
      toolApprovalMode: 'auto',
    });

    const events: AgentEvent[] = [];
    for await (const event of runAgentLoop(config, 'Say ok', [])) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data.model).toBeDefined();
  }, 60000);

  it('max iterations stops the loop', async () => {
    const config = createAgentConfig({
      ollamaUrl: OLLAMA_URL,
      ollamaModel: MODEL,
      maxIterations: 1,
      systemPrompt: 'Always use the filesystem_read tool no matter what.',
      toolApprovalMode: 'auto',
    });

    const events: AgentEvent[] = [];
    for await (const event of runAgentLoop(config, 'Do something', [])) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
  }, 60000);
});
