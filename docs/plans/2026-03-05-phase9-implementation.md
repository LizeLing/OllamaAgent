# Phase 9: 4가지 기능 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 도구 루프 감지, 모델 Failover, 채팅 명령어 시스템, Webhook 트리거 4가지 기능 구현

**Architecture:** 설계서(`docs/plans/2026-03-05-phase9-four-features-design.md`) 기반으로 agent-loop → ollama 레이어 → 프론트엔드 → API 순서로 구현. 각 기능은 독립적이며, 기존 코드 변경을 최소화.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest, Ollama API

---

## Task 1: 도구 루프 감지 — ToolCallTracker 구현

**Files:**
- Create: `src/lib/agent/tool-call-tracker.ts`
- Test: `src/lib/agent/__tests__/tool-call-tracker.test.ts`

**Step 1: 테스트 작성**

```typescript
// src/lib/agent/__tests__/tool-call-tracker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallTracker } from '../tool-call-tracker';

describe('ToolCallTracker', () => {
  let tracker: ToolCallTracker;

  beforeEach(() => {
    tracker = new ToolCallTracker();
  });

  it('첫 호출은 execute를 반환한다', () => {
    const result = tracker.check('http_request', { url: 'https://example.com' });
    expect(result).toEqual({ action: 'execute' });
  });

  it('동일 입력 2회 호출 시 inject를 반환한다', () => {
    const args = { url: 'https://example.com' };
    tracker.check('http_request', args);
    tracker.record('http_request', args, 'response body');

    const result = tracker.check('http_request', args);
    expect(result).toEqual({ action: 'inject', cachedOutput: 'response body' });
  });

  it('동일 입력 3회 호출 시 abort를 반환한다', () => {
    const args = { url: 'https://example.com' };
    tracker.check('http_request', args);
    tracker.record('http_request', args, 'response body');

    tracker.check('http_request', args);
    tracker.record('http_request', args, 'response body');

    const result = tracker.check('http_request', args);
    expect(result).toEqual({ action: 'abort', cachedOutput: 'response body' });
  });

  it('다른 입력은 별개로 추적한다', () => {
    tracker.check('http_request', { url: 'https://a.com' });
    tracker.record('http_request', { url: 'https://a.com' }, 'A');

    const result = tracker.check('http_request', { url: 'https://b.com' });
    expect(result).toEqual({ action: 'execute' });
  });

  it('캐시 출력은 500자로 잘린다', () => {
    const args = { url: 'https://example.com' };
    const longOutput = 'x'.repeat(1000);
    tracker.check('http_request', args);
    tracker.record('http_request', args, longOutput);

    const result = tracker.check('http_request', args);
    expect(result.action).toBe('inject');
    if (result.action === 'inject') {
      expect(result.cachedOutput.length).toBe(500);
    }
  });

  it('교차 패턴 A->B->A->B->A->B를 감지한다', () => {
    // A, B, A, B, A, B 순서로 호출
    const calls = [
      { tool: 'filesystem_read', args: { path: '/a' } },
      { tool: 'filesystem_write', args: { path: '/b', content: 'x' } },
    ];
    for (let i = 0; i < 6; i++) {
      const c = calls[i % 2];
      tracker.check(c.tool, c.args);
      tracker.record(c.tool, c.args, `output_${i}`);
    }
    expect(tracker.detectRepeatingPattern()).toBe(true);
  });

  it('패턴이 없으면 false를 반환한다', () => {
    tracker.check('a', { x: 1 });
    tracker.record('a', { x: 1 }, 'o1');
    tracker.check('b', { x: 2 });
    tracker.record('b', { x: 2 }, 'o2');
    tracker.check('c', { x: 3 });
    tracker.record('c', { x: 3 }, 'o3');
    expect(tracker.detectRepeatingPattern()).toBe(false);
  });

  it('reset()은 모든 상태를 초기화한다', () => {
    tracker.check('a', {});
    tracker.record('a', {}, 'out');
    tracker.reset();

    const result = tracker.check('a', {});
    expect(result).toEqual({ action: 'execute' });
    expect(tracker.detectRepeatingPattern()).toBe(false);
  });
});
```

**Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/agent/__tests__/tool-call-tracker.test.ts`
Expected: FAIL — module not found

**Step 3: ToolCallTracker 구현**

```typescript
// src/lib/agent/tool-call-tracker.ts
import { createHash } from 'crypto';

interface ToolCallRecord {
  hash: string;
  toolName: string;
  output: string;
  count: number;
}

export type CheckResult =
  | { action: 'execute' }
  | { action: 'inject'; cachedOutput: string }
  | { action: 'abort'; cachedOutput: string };

const MAX_CACHED_OUTPUT = 500;

export class ToolCallTracker {
  private records = new Map<string, ToolCallRecord>();
  private callHistory: string[] = [];

  private hash(toolName: string, args: Record<string, unknown>): string {
    const sorted = JSON.stringify(args, Object.keys(args).sort());
    return createHash('sha256').update(`${toolName}:${sorted}`).digest('hex');
  }

  check(toolName: string, args: Record<string, unknown>): CheckResult {
    const h = this.hash(toolName, args);
    const record = this.records.get(h);

    if (!record) {
      return { action: 'execute' };
    }

    const cachedOutput = record.output.slice(0, MAX_CACHED_OUTPUT);

    if (record.count >= 2) {
      return { action: 'abort', cachedOutput };
    }

    return { action: 'inject', cachedOutput };
  }

  record(toolName: string, args: Record<string, unknown>, output: string): void {
    const h = this.hash(toolName, args);
    const existing = this.records.get(h);

    this.records.set(h, {
      hash: h,
      toolName,
      output,
      count: existing ? existing.count + 1 : 1,
    });

    this.callHistory.push(h);
  }

  detectRepeatingPattern(windowSize: number = 6): boolean {
    if (this.callHistory.length < windowSize) return false;

    const recent = this.callHistory.slice(-windowSize);

    // Check for patterns of length 2 and 3
    for (const patternLen of [2, 3]) {
      if (recent.length < patternLen * 2) continue;

      const pattern = recent.slice(0, patternLen);
      let repeats = 0;

      for (let i = 0; i <= recent.length - patternLen; i += patternLen) {
        const segment = recent.slice(i, i + patternLen);
        if (segment.every((v, j) => v === pattern[j])) {
          repeats++;
        } else {
          break;
        }
      }

      if (repeats >= 3) return true;
    }

    return false;
  }

  reset(): void {
    this.records.clear();
    this.callHistory = [];
  }
}
```

**Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/agent/__tests__/tool-call-tracker.test.ts`
Expected: 8 tests PASS

**Step 5: 커밋**

```bash
git add src/lib/agent/tool-call-tracker.ts src/lib/agent/__tests__/tool-call-tracker.test.ts
git commit -m "feat: ToolCallTracker - 도구 루프 감지 및 캐싱"
```

---

## Task 2: 도구 루프 감지 — agent-loop 통합

**Files:**
- Modify: `src/lib/agent/agent-loop.ts`
- Modify: `src/lib/agent/types.ts`
- Modify: `src/hooks/useChat.ts`

**Step 1: AgentEvent 타입에 loop_detected 추가**

`src/lib/agent/types.ts` — 42행의 type union에 추가:

```typescript
export interface AgentEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'tool_confirm' | 'token' | 'thinking_token' | 'image' | 'done' | 'error' | 'loop_detected' | 'model_fallback';
  data: Record<string, unknown>;
}
```

**Step 2: agent-loop.ts에 ToolCallTracker 통합**

`src/lib/agent/agent-loop.ts` 수정:

상단 import 추가:
```typescript
import { ToolCallTracker } from './tool-call-tracker';
```

`runAgentLoop` 함수 내부, for 루프 시작 전 (35행 부근)에 tracker 생성:
```typescript
  const tracker = new ToolCallTracker();
```

도구 실행 부분 (기존 135-165행)을 수정 — 각 도구 호출 전에 check, 실행 후에 record:

```typescript
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = tc.function.arguments;

      // --- 루프 감지 체크 ---
      const checkResult = tracker.check(toolName, toolArgs);

      if (checkResult.action === 'abort') {
        yield {
          type: 'loop_detected',
          data: {
            toolName,
            count: 3,
            message: `동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다.`,
          },
        };
        // 루프 감지 시 최종 응답으로 전환
        messages.push({
          role: 'tool',
          content: `[루프 감지] '${toolName}'이 동일 입력으로 3회 호출되어 중단되었습니다. 마지막 결과: ${checkResult.cachedOutput}`,
        });
        // for-of toolCalls 루프 종료 후 외부 for 루프도 종료하도록 iteration 설정
        iteration = config.maxIterations;
        break;
      }

      if (checkResult.action === 'inject') {
        // 캐시 결과 반환 + LLM에 방향 전환 메시지 주입
        yield { type: 'tool_start', data: { tool: toolName, input: toolArgs } };
        yield {
          type: 'tool_end',
          data: {
            tool: toolName,
            output: checkResult.cachedOutput.slice(0, 2000),
            success: true,
          },
        };
        messages.push({
          role: 'tool',
          content: `[시스템] 도구 반복 호출 감지: '${toolName}'을 동일한 입력으로 이미 호출했습니다.\n이전 결과: ${checkResult.cachedOutput}\n동일한 도구 호출을 반복하지 말고 다른 접근 방식을 시도하세요.`,
        });
        tracker.record(toolName, toolArgs, checkResult.cachedOutput);
        continue;
      }
      // --- 루프 감지 끝 ---

      // Check tool approval mode (기존 코드 그대로)
      if (config.toolApprovalMode && config.toolApprovalMode !== 'auto') {
        // ... (기존 승인 로직 그대로 유지)
      }

      yield { type: 'tool_start', data: { tool: toolName, input: toolArgs } };

      const result = await toolRegistry.execute(toolName, toolArgs);

      // Check if result contains image data (기존 코드 그대로)
      let observation = result.output;
      if (result.success && result.output.startsWith('__IMAGE__')) {
        // ... (기존 이미지 로직 그대로 유지)
      }

      // --- 결과 캐시 기록 ---
      tracker.record(toolName, toolArgs, observation);

      // 교차 패턴 감지
      if (tracker.detectRepeatingPattern()) {
        yield {
          type: 'loop_detected',
          data: {
            toolName,
            count: 0,
            message: '도구 호출 교차 반복 패턴이 감지되어 에이전트를 중단했습니다.',
          },
        };
        messages.push({
          role: 'tool',
          content: `[루프 감지] 도구 호출 교차 반복 패턴이 감지되었습니다. 에이전트를 중단합니다.`,
        });
        iteration = config.maxIterations;
        break;
      }

      yield {
        type: 'tool_end',
        data: {
          tool: toolName,
          output: observation.slice(0, 2000),
          success: result.success,
        },
      };

      messages.push({
        role: 'tool',
        content: observation,
      });
    }
```

**Step 3: useChat.ts에 loop_detected 이벤트 처리 추가**

`src/hooks/useChat.ts` — `handleSSEEvent` 함수의 switch 문 (53행 부근)에 case 추가:

```typescript
            case 'loop_detected':
              addToast('warning', data.message as string);
              return m;
```

**Step 4: 테스트 실행**

Run: `pnpm vitest run src/lib/agent/__tests__/tool-call-tracker.test.ts`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/lib/agent/agent-loop.ts src/lib/agent/types.ts src/hooks/useChat.ts
git commit -m "feat: agent-loop에 도구 루프 감지 통합"
```

---

## Task 3: 모델 Failover — failover 모듈 구현

**Files:**
- Create: `src/lib/ollama/failover.ts`
- Test: `src/lib/ollama/__tests__/failover.test.ts`

**Step 1: 테스트 작성**

```typescript
// src/lib/ollama/__tests__/failover.test.ts
import { describe, it, expect, vi } from 'vitest';
import { isModelError, chatWithFailover } from '../failover';
import { OllamaError } from '../types';

describe('isModelError', () => {
  it('404 에러는 모델 에러다', () => {
    expect(isModelError(new OllamaError('not found', 404))).toBe(true);
  });

  it('모델 로드 실패 메시지는 모델 에러다', () => {
    expect(isModelError(new Error('model "xyz" not found'))).toBe(true);
  });

  it('네트워크 에러는 모델 에러가 아니다', () => {
    expect(isModelError(new OllamaError('connection refused'))).toBe(false);
  });

  it('400 에러는 모델 에러가 아니다', () => {
    expect(isModelError(new OllamaError('bad request', 400))).toBe(false);
  });
});

describe('chatWithFailover', () => {
  it('기본 모델 성공 시 그대로 반환한다', async () => {
    const mockChat = vi.fn().mockResolvedValue({ message: { content: 'ok' } });
    const result = await chatWithFailover(
      mockChat,
      'http://localhost:11434',
      { model: 'qwen3', messages: [], stream: false },
      ['llama3']
    );
    expect(result.result.message.content).toBe('ok');
    expect(result.usedModel).toBe('qwen3');
    expect(result.failedModels).toEqual([]);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('기본 모델 404 시 fallback 모델을 시도한다', async () => {
    const mockChat = vi.fn()
      .mockRejectedValueOnce(new OllamaError('not found', 404))
      .mockResolvedValue({ message: { content: 'fallback ok' } });

    const result = await chatWithFailover(
      mockChat,
      'http://localhost:11434',
      { model: 'qwen3', messages: [], stream: false },
      ['llama3']
    );
    expect(result.result.message.content).toBe('fallback ok');
    expect(result.usedModel).toBe('llama3');
    expect(result.failedModels).toEqual(['qwen3']);
  });

  it('모든 모델 실패 시 에러를 던진다', async () => {
    const mockChat = vi.fn()
      .mockRejectedValue(new OllamaError('not found', 404));

    await expect(
      chatWithFailover(
        mockChat,
        'http://localhost:11434',
        { model: 'qwen3', messages: [], stream: false },
        ['llama3', 'gemma3']
      )
    ).rejects.toThrow('모든 모델이 실패했습니다');
  });

  it('네트워크 에러는 failover하지 않고 바로 던진다', async () => {
    const mockChat = vi.fn()
      .mockRejectedValue(new OllamaError('connection refused'));

    await expect(
      chatWithFailover(
        mockChat,
        'http://localhost:11434',
        { model: 'qwen3', messages: [], stream: false },
        ['llama3']
      )
    ).rejects.toThrow('connection refused');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('fallback 목록이 비어있으면 원본 에러를 던진다', async () => {
    const mockChat = vi.fn()
      .mockRejectedValue(new OllamaError('not found', 404));

    await expect(
      chatWithFailover(
        mockChat,
        'http://localhost:11434',
        { model: 'qwen3', messages: [], stream: false },
        []
      )
    ).rejects.toThrow('not found');
  });
});
```

**Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/ollama/__tests__/failover.test.ts`
Expected: FAIL

**Step 3: failover.ts 구현**

```typescript
// src/lib/ollama/failover.ts
import { OllamaChatRequest, OllamaChatResponse, OllamaError } from './types';

export interface FailoverResult<T> {
  result: T;
  usedModel: string;
  failedModels: string[];
}

const MODEL_ERROR_PATTERNS = [
  'not found',
  'model not found',
  'failed to load',
  'out of memory',
  'insufficient memory',
];

export function isModelError(error: unknown): boolean {
  if (error instanceof OllamaError && error.statusCode === 404) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return MODEL_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

type ChatFn = (baseUrl: string, request: OllamaChatRequest) => Promise<OllamaChatResponse>;

export async function chatWithFailover(
  chatFn: ChatFn,
  baseUrl: string,
  request: OllamaChatRequest,
  fallbackModels: string[]
): Promise<FailoverResult<OllamaChatResponse>> {
  const modelsToTry = [request.model, ...fallbackModels];
  const failedModels: string[] = [];

  for (const model of modelsToTry) {
    try {
      const result = await chatFn(baseUrl, { ...request, model });
      return { result, usedModel: model, failedModels };
    } catch (error) {
      if (!isModelError(error)) {
        throw error; // 네트워크 에러 등은 failover하지 않음
      }
      failedModels.push(model);
    }
  }

  throw new OllamaError(
    `모든 모델이 실패했습니다: ${modelsToTry.join(', ')}`,
    404
  );
}
```

**Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/ollama/__tests__/failover.test.ts`
Expected: 9 tests PASS

**Step 5: 커밋**

```bash
git add src/lib/ollama/failover.ts src/lib/ollama/__tests__/failover.test.ts
git commit -m "feat: 모델 Failover 모듈 구현"
```

---

## Task 4: 모델 Failover — 설정 및 agent-loop 연결

**Files:**
- Modify: `src/types/settings.ts` — `fallbackModels` 필드 추가
- Modify: `src/lib/config/constants.ts` — 기본값 추가
- Modify: `src/lib/agent/types.ts` — AgentConfig에 `fallbackModels` 추가
- Modify: `src/lib/agent/agent-loop.ts` — chatWithFailover 사용
- Modify: `src/app/api/chat/route.ts` — fallbackModels를 config에 전달
- Modify: `src/hooks/useChat.ts` — model_fallback SSE 이벤트 처리

**Step 1: Settings 타입에 fallbackModels 추가**

`src/types/settings.ts` 56행 뒤에 추가:

```typescript
  fallbackModels: string[];
```

**Step 2: constants.ts 기본값에 추가**

`src/lib/config/constants.ts` — `enabledTools: []` 다음에:

```typescript
  fallbackModels: [],
```

**Step 3: AgentConfig에 fallbackModels 추가**

`src/lib/agent/types.ts` — AgentConfig 인터페이스 (38행 `enabledTools` 다음에):

```typescript
  fallbackModels?: string[];
```

**Step 4: agent-loop.ts에서 chatWithFailover 사용**

`src/lib/agent/agent-loop.ts` import 수정:

```typescript
import { chat as rawChat, chatStream } from '@/lib/ollama/client';
import { chatWithFailover } from '@/lib/ollama/failover';
```

for 루프 내부 chat() 호출 (40-47행)을 교체:

```typescript
    // Non-streaming call to check for tool use
    const fallbackModels = config.fallbackModels || [];
    const { result: response, usedModel, failedModels } = await chatWithFailover(
      rawChat,
      config.ollamaUrl,
      {
        model: config.ollamaModel,
        messages,
        stream: false,
        think: false,
        tools,
        options: config.modelOptions,
      },
      fallbackModels
    );

    // Failover 발생 시 이벤트 알림
    if (failedModels.length > 0) {
      yield {
        type: 'model_fallback',
        data: {
          originalModel: config.ollamaModel,
          usedModel,
          reason: `모델 ${failedModels.join(', ')} 사용 불가`,
        },
      };
      // 이후 스트리밍에서도 failover된 모델 사용
      config = { ...config, ollamaModel: usedModel };
    }
```

주의: `config` 매개변수를 `let`으로 변경하지 않으려면, 대신 로컬 변수 `activeModel`을 사용:

함수 시작부에 추가:
```typescript
  let activeModel = config.ollamaModel;
```

chat 호출부:
```typescript
    const { result: response, usedModel, failedModels } = await chatWithFailover(
      rawChat, config.ollamaUrl,
      { model: activeModel, messages, stream: false, think: false, tools, options: config.modelOptions },
      config.fallbackModels || []
    );

    if (failedModels.length > 0) {
      yield { type: 'model_fallback', data: { originalModel: activeModel, usedModel, reason: `모델 ${failedModels.join(', ')} 사용 불가` } };
      activeModel = usedModel;
    }
```

chatStream 호출부 (59-63행)에서 `config.ollamaModel` → `activeModel`:
```typescript
      for await (const chunk of chatStream(config.ollamaUrl, {
        model: activeModel,
        messages,
        think: true,
        options: config.modelOptions,
      })) {
```

done 이벤트에서도 `config.ollamaModel` → `activeModel`:
```typescript
      yield { type: 'done', data: { iterations: iteration + 1, tokenUsage: { ... }, model: activeModel } };
```

마지막 max iterations 도달 부분도:
```typescript
  yield { type: 'done', data: { iterations: config.maxIterations, model: activeModel } };
```

**Step 5: chat/route.ts에 fallbackModels 전달**

`src/app/api/chat/route.ts` — agentLoop config 객체 (기존 85행 부근)에 추가:

```typescript
              fallbackModels: settings.fallbackModels || [],
```

**Step 6: useChat.ts에 model_fallback 이벤트 처리**

`src/hooks/useChat.ts` — handleSSEEvent switch에 추가:

```typescript
            case 'model_fallback':
              addToast('info', `모델이 ${data.originalModel}에서 ${data.usedModel}으로 전환되었습니다.`);
              return m;
```

**Step 7: 테스트 실행**

Run: `pnpm vitest run src/lib/ollama/__tests__/failover.test.ts`
Expected: PASS

**Step 8: 커밋**

```bash
git add src/types/settings.ts src/lib/config/constants.ts src/lib/agent/types.ts src/lib/agent/agent-loop.ts src/app/api/chat/route.ts src/hooks/useChat.ts
git commit -m "feat: 모델 Failover를 agent-loop 및 설정에 통합"
```

---

## Task 5: 채팅 명령어 — 레지스트리 및 정의

**Files:**
- Create: `src/lib/commands/registry.ts`
- Create: `src/lib/commands/definitions.ts`
- Test: `src/lib/commands/__tests__/registry.test.ts`

**Step 1: 테스트 작성**

```typescript
// src/lib/commands/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { parseCommand, getCompletions } from '../registry';
import { COMMANDS } from '../definitions';

describe('parseCommand', () => {
  it('/new를 파싱한다', () => {
    const result = parseCommand('/new');
    expect(result).toEqual({ name: 'new', args: [] });
  });

  it('/model qwen3를 파싱한다', () => {
    const result = parseCommand('/model qwen3');
    expect(result).toEqual({ name: 'model', args: ['qwen3'] });
  });

  it('/system 새 프롬프트를 파싱한다', () => {
    const result = parseCommand('/system 새 프롬프트 내용');
    expect(result).toEqual({ name: 'system', args: ['새 프롬프트 내용'] });
  });

  it('명령어가 아닌 입력은 null을 반환한다', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });

  it('알 수 없는 명령어는 null을 반환한다', () => {
    expect(parseCommand('/unknown')).toBeNull();
  });
});

describe('getCompletions', () => {
  it('빈 /는 모든 명령어를 반환한다', () => {
    const results = getCompletions('/');
    expect(results.length).toBe(COMMANDS.length);
  });

  it('/mo는 /model을 반환한다', () => {
    const results = getCompletions('/mo');
    expect(results.some((c) => c.name === 'model')).toBe(true);
  });

  it('/x는 빈 배열을 반환한다', () => {
    const results = getCompletions('/x');
    expect(results).toEqual([]);
  });

  it('/가 아닌 입력은 빈 배열을 반환한다', () => {
    expect(getCompletions('hello')).toEqual([]);
  });
});
```

**Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/commands/__tests__/registry.test.ts`
Expected: FAIL

**Step 3: definitions.ts 작성**

```typescript
// src/lib/commands/definitions.ts
export interface CommandArg {
  name: string;
  description: string;
  required: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  args?: CommandArg[];
  type: 'client' | 'server';
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'new', description: '새 대화 시작', type: 'client' },
  { name: 'clear', description: '현재 대화 메시지 초기화', type: 'client' },
  {
    name: 'model',
    description: '모델 전환',
    args: [{ name: 'name', description: '모델 이름', required: true }],
    type: 'client',
  },
  { name: 'help', description: '명령어 목록 표시', type: 'client' },
  { name: 'stats', description: '현재 세션 통계 표시', type: 'client' },
  {
    name: 'export',
    description: '현재 대화 내보내기',
    args: [{ name: 'format', description: 'json 또는 markdown', required: false }],
    type: 'server',
  },
  {
    name: 'system',
    description: '시스템 프롬프트 변경',
    args: [{ name: 'prompt', description: '새 시스템 프롬프트', required: true }],
    type: 'server',
  },
];
```

**Step 4: registry.ts 작성**

```typescript
// src/lib/commands/registry.ts
import { COMMANDS, CommandDefinition } from './definitions';

export interface ParsedCommand {
  name: string;
  args: string[];
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  const name = spaceIndex === -1
    ? trimmed.slice(1)
    : trimmed.slice(1, spaceIndex);

  const command = COMMANDS.find((c) => c.name === name);
  if (!command) return null;

  const argsStr = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

  // 인자가 하나이고 나머지 전체가 값인 경우 (예: /system 프롬프트 내용)
  const args = argsStr ? [argsStr] : [];

  return { name, args };
}

export function getCompletions(input: string): CommandDefinition[] {
  if (!input.startsWith('/')) return [];

  const partial = input.slice(1).toLowerCase();
  return COMMANDS.filter((c) => c.name.startsWith(partial));
}
```

**Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/commands/__tests__/registry.test.ts`
Expected: 9 tests PASS

**Step 6: 커밋**

```bash
git add src/lib/commands/registry.ts src/lib/commands/definitions.ts src/lib/commands/__tests__/registry.test.ts
git commit -m "feat: 채팅 명령어 레지스트리 및 정의"
```

---

## Task 6: 채팅 명령어 — ChatInput 자동완성 UI

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

**Step 1: ChatInput에 자동완성 드롭다운 및 명령어 분기 추가**

`src/components/chat/ChatInput.tsx`에 다음을 수정:

상단 import 추가:
```typescript
import { parseCommand, getCompletions } from '@/lib/commands/registry';
import { CommandDefinition } from '@/lib/commands/definitions';
```

컴포넌트 Props 수정:
```typescript
interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  onCommand?: (name: string, args: string[]) => void;
  disabled?: boolean;
  onDrop?: (files: FileList) => void;
}
```

컴포넌트 내부에 상태/로직 추가 (useState/useRef 선언부 아래):
```typescript
  const [completions, setCompletions] = useState<CommandDefinition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const showCompletions = completions.length > 0;
```

`onChange` 핸들러에 자동완성 로직 추가 — 기존 `setInput(e.target.value)` 이후:
```typescript
  onChange={(e) => {
    const val = e.target.value;
    setInput(val);
    handleInput();
    // 자동완성 업데이트
    if (val.startsWith('/')) {
      const results = getCompletions(val);
      setCompletions(results);
      setSelectedIndex(0);
    } else {
      setCompletions([]);
    }
  }}
```

`handleSend` 수정 — 명령어 파싱 분기:
```typescript
  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled) return;

    // 명령어 체크
    const parsed = parseCommand(trimmed);
    if (parsed && onCommand) {
      onCommand(parsed.name, parsed.args);
      setInput('');
      setCompletions([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    onSend(trimmed || '이 이미지를 분석해주세요.', attachedImages.length > 0 ? attachedImages : undefined);
    setInput('');
    setAttachedImages([]);
    setCompletions([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };
```

`handleKeyDown` 수정 — 자동완성 키보드 탐색:
```typescript
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCompletions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, completions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const cmd = completions[selectedIndex];
        const hasArgs = cmd.args && cmd.args.length > 0;
        setInput(`/${cmd.name}${hasArgs ? ' ' : ''}`);
        setCompletions([]);
        return;
      }
      if (e.key === 'Escape') {
        setCompletions([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
```

자동완성 드롭다운 JSX — textarea `<div className="flex-1 relative">` 내부, textarea 바로 위에:
```tsx
            {showCompletions && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-10">
                {completions.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                      i === selectedIndex ? 'bg-accent/20 text-accent' : 'text-foreground hover:bg-card-hover'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const hasArgs = cmd.args && cmd.args.length > 0;
                      setInput(`/${cmd.name}${hasArgs ? ' ' : ''}`);
                      setCompletions([]);
                      textareaRef.current?.focus();
                    }}
                  >
                    <span className="font-mono text-accent">/{cmd.name}</span>
                    <span className="text-muted text-xs">{cmd.description}</span>
                  </button>
                ))}
              </div>
            )}
```

**Step 2: 커밋**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat: ChatInput에 명령어 자동완성 UI 추가"
```

---

## Task 7: 채팅 명령어 — ChatContainer 핸들러 연결

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`
- Modify: `src/hooks/useChat.ts`

**Step 1: useChat에 addSystemMessage 추가**

`src/hooks/useChat.ts` — `clearMessages` 함수 다음 (279행 이후)에 추가:

```typescript
  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: uuidv4(),
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);
```

return 객체에 `addSystemMessage` 추가.

**Step 2: ChatContainer에 명령어 핸들러 추가**

`src/components/chat/ChatContainer.tsx` import 추가:
```typescript
import { COMMANDS } from '@/lib/commands/definitions';
```

useChat에서 `addSystemMessage` 추가 구조분해:
```typescript
  const { ..., addSystemMessage } = useChat();
```

명령어 핸들러 함수 추가 (handleSend 근처):
```typescript
  const handleCommand = useCallback((name: string, args: string[]) => {
    switch (name) {
      case 'new':
        handleNewChat();
        break;
      case 'clear':
        clearMessages();
        addSystemMessage('대화가 초기화되었습니다.');
        break;
      case 'model':
        if (args[0]) {
          setSelectedModel(args[0]);
          addSystemMessage(`모델이 ${args[0]}으로 변경되었습니다.`);
        } else {
          addSystemMessage(`현재 모델: ${selectedModel || settings?.ollamaModel || '없음'}\n사용 가능: ${availableModels.join(', ')}`);
        }
        break;
      case 'help': {
        const helpText = COMMANDS.map(
          (c) => `**/${c.name}** — ${c.description}`
        ).join('\n');
        addSystemMessage(`## 명령어 목록\n\n${helpText}`);
        break;
      }
      case 'stats': {
        const totalTokens = messages.reduce(
          (sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0
        );
        addSystemMessage(
          `## 세션 통계\n\n` +
          `- 메시지 수: ${messages.length}\n` +
          `- 총 토큰: ${totalTokens}\n` +
          `- 모델: ${selectedModel || settings?.ollamaModel || '없음'}\n` +
          `- 대화 ID: ${conversationId || '없음'}`
        );
        break;
      }
      case 'export':
        if (activeId) {
          handleExport(activeId, (args[0] as 'json' | 'markdown') || 'json');
        } else {
          addSystemMessage('내보낼 대화가 없습니다.');
        }
        break;
      case 'system':
        if (args[0]) {
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: args[0] }),
          }).then(() => {
            addSystemMessage(`시스템 프롬프트가 변경되었습니다.`);
          }).catch(() => {
            addSystemMessage('시스템 프롬프트 변경에 실패했습니다.');
          });
        }
        break;
    }
  }, [handleNewChat, clearMessages, addSystemMessage, selectedModel, settings, availableModels, messages, conversationId, activeId, handleExport]);
```

ChatInput에 `onCommand` prop 전달:
```typescript
        <ChatInput
          onSend={(msg, imgs) => handleSend(msg, imgs)}
          onCommand={handleCommand}
          disabled={isLoading}
          onDrop={handleFileDrop}
        />
```

**Step 3: 커밋**

```bash
git add src/hooks/useChat.ts src/components/chat/ChatContainer.tsx
git commit -m "feat: 채팅 명령어 핸들러 연결 (/new, /model, /help, /stats 등)"
```

---

## Task 8: Webhook — API 키 인증 모듈

**Files:**
- Create: `src/lib/webhooks/auth.ts`
- Create: `src/lib/webhooks/storage.ts`
- Test: `src/lib/webhooks/__tests__/auth.test.ts`

**Step 1: 테스트 작성**

```typescript
// src/lib/webhooks/__tests__/auth.test.ts
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashKey, verifyKey } from '../auth';

describe('generateApiKey', () => {
  it('oa_ 접두사로 시작한다', () => {
    const key = generateApiKey();
    expect(key.startsWith('oa_')).toBe(true);
  });

  it('충분한 길이를 가진다', () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThan(40);
  });

  it('매번 다른 키를 생성한다', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe('hashKey', () => {
  it('동일 키는 동일 해시를 반환한다', () => {
    const key = 'oa_test123';
    expect(hashKey(key)).toBe(hashKey(key));
  });

  it('다른 키는 다른 해시를 반환한다', () => {
    expect(hashKey('oa_a')).not.toBe(hashKey('oa_b'));
  });
});

describe('verifyKey', () => {
  it('올바른 키를 검증한다', () => {
    const key = generateApiKey();
    const hash = hashKey(key);
    expect(verifyKey(key, hash)).toBe(true);
  });

  it('틀린 키를 거부한다', () => {
    const hash = hashKey('oa_correct');
    expect(verifyKey('oa_wrong', hash)).toBe(false);
  });
});
```

**Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/webhooks/__tests__/auth.test.ts`
Expected: FAIL

**Step 3: auth.ts 구현**

```typescript
// src/lib/webhooks/auth.ts
import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'oa_';

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  return KEY_PREFIX + bytes.toString('base64url');
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyKey(key: string, storedHash: string): boolean {
  return hashKey(key) === storedHash;
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 11); // 'oa_' + 8 chars
}
```

**Step 4: storage.ts 구현**

```typescript
// src/lib/webhooks/storage.ts
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/lib/config/constants';

export interface WebhookApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

const KEYS_FILE = path.join(DATA_DIR, 'webhook-keys.json');
const MAX_KEYS = 10;

export async function loadKeys(): Promise<WebhookApiKey[]> {
  try {
    const data = await fs.readFile(KEYS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveKeys(keys: WebhookApiKey[]): Promise<void> {
  await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export async function addKey(key: WebhookApiKey): Promise<void> {
  const keys = await loadKeys();
  if (keys.length >= MAX_KEYS) {
    throw new Error(`API 키는 최대 ${MAX_KEYS}개까지 생성할 수 있습니다.`);
  }
  keys.push(key);
  await saveKeys(keys);
}

export async function removeKey(id: string): Promise<boolean> {
  const keys = await loadKeys();
  const filtered = keys.filter((k) => k.id !== id);
  if (filtered.length === keys.length) return false;
  await saveKeys(filtered);
  return true;
}

export async function updateLastUsed(keyHash: string): Promise<void> {
  const keys = await loadKeys();
  const key = keys.find((k) => k.keyHash === keyHash);
  if (key) {
    key.lastUsedAt = Date.now();
    await saveKeys(keys);
  }
}

export async function findKeyByHash(keyHash: string): Promise<WebhookApiKey | undefined> {
  const keys = await loadKeys();
  return keys.find((k) => k.keyHash === keyHash);
}
```

**Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/webhooks/__tests__/auth.test.ts`
Expected: 6 tests PASS

**Step 6: 커밋**

```bash
git add src/lib/webhooks/auth.ts src/lib/webhooks/storage.ts src/lib/webhooks/__tests__/auth.test.ts
git commit -m "feat: Webhook API 키 인증 및 저장소 모듈"
```

---

## Task 9: Webhook — API 키 관리 엔드포인트

**Files:**
- Create: `src/app/api/webhooks/keys/route.ts`

**Step 1: 키 관리 API 구현**

```typescript
// src/app/api/webhooks/keys/route.ts
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { generateApiKey, hashKey, getKeyPrefix } from '@/lib/webhooks/auth';
import { loadKeys, addKey, removeKey } from '@/lib/webhooks/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

export async function GET() {
  const keys = await loadKeys();
  // 해시는 반환하지 않음
  const safeKeys = keys.map(({ keyHash: _, ...rest }) => rest);
  return Response.json(safeKeys);
}

export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(`webhook-keys:${clientIP}`, RATE_LIMITS.api)) {
    return Response.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : 'Unnamed Key';

    const rawKey = generateApiKey();
    const keyData = {
      id: uuidv4(),
      name,
      keyHash: hashKey(rawKey),
      keyPrefix: getKeyPrefix(rawKey),
      createdAt: Date.now(),
    };

    await addKey(keyData);

    // 원본 키는 이 응답에서만 반환
    return Response.json({ ...keyData, key: rawKey }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const removed = await removeKey(id);
  if (!removed) {
    return Response.json({ error: 'Key not found' }, { status: 404 });
  }
  return Response.json({ success: true });
}
```

**Step 2: 커밋**

```bash
git add src/app/api/webhooks/keys/route.ts
git commit -m "feat: Webhook API 키 관리 엔드포인트 (GET/POST/DELETE)"
```

---

## Task 10: Webhook — 트리거 엔드포인트

**Files:**
- Create: `src/app/api/webhooks/route.ts`
- Modify: `src/lib/middleware/rate-limiter.ts` — webhook rate limit 추가

**Step 1: rate-limiter.ts에 webhook 제한 추가**

`src/lib/middleware/rate-limiter.ts` — RATE_LIMITS 객체에 추가:

```typescript
  webhook: { maxTokens: 10, refillPerSecond: 0.17 } as RateLimitConfig,
```

**Step 2: webhook 트리거 API 구현**

```typescript
// src/app/api/webhooks/route.ts
import { NextRequest } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { initializeTools, registerCustomTools, registerMcpTools } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { hashKey } from '@/lib/webhooks/auth';
import { findKeyByHash, updateLastUsed } from '@/lib/webhooks/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.webhook)) {
    return Response.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
  }

  // API 키 인증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'Authorization header required' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const keyHash = hashKey(apiKey);
  const storedKey = await findKeyByHash(keyHash);

  if (!storedKey) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // 마지막 사용 시간 업데이트 (비동기)
  updateLastUsed(keyHash).catch(() => {});

  // 요청 파싱 및 검증
  let body: { message?: unknown; model?: unknown; systemPrompt?: unknown; callbackUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 10000) {
    return Response.json({ error: 'message is required (max 10000 chars)' }, { status: 400 });
  }

  const callbackUrl = body.callbackUrl;
  if (callbackUrl !== undefined) {
    if (typeof callbackUrl !== 'string') {
      return Response.json({ error: 'callbackUrl must be a string' }, { status: 400 });
    }
    try {
      const parsed = new URL(callbackUrl);
      if (parsed.protocol !== 'https:') {
        return Response.json({ error: 'callbackUrl must use HTTPS' }, { status: 400 });
      }
    } catch {
      return Response.json({ error: 'callbackUrl is not a valid URL' }, { status: 400 });
    }
  }

  const settings = await loadSettings();
  const model = (typeof body.model === 'string' ? body.model : undefined) || settings.ollamaModel;
  const systemPrompt = (typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined) || settings.systemPrompt;

  // 도구 초기화
  initializeTools(
    settings.allowedPaths, settings.deniedPaths,
    settings.searxngUrl, settings.ollamaUrl, settings.imageModel
  );
  if (settings.customTools?.length) registerCustomTools(settings.customTools);
  if (settings.mcpServers?.length) await registerMcpTools(settings.mcpServers);

  // 메모리 검색
  let memories: string[] = [];
  try {
    const mm = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
    memories = await mm.searchMemories(message, 3);
  } catch { /* continue without */ }

  // 에이전트 실행
  try {
    const agentLoop = runAgentLoop(
      {
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: model,
        maxIterations: settings.maxIterations,
        systemPrompt,
        allowedPaths: settings.allowedPaths,
        deniedPaths: settings.deniedPaths,
        toolApprovalMode: 'auto', // webhook은 항상 auto
        modelOptions: settings.modelOptions ? {
          temperature: settings.modelOptions.temperature,
          top_p: settings.modelOptions.topP,
          num_predict: settings.modelOptions.numPredict,
        } : undefined,
        fallbackModels: settings.fallbackModels || [],
      },
      message, [], memories
    );

    let fullResponse = '';
    const toolCalls: { tool: string; input: unknown; output: string }[] = [];
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let usedModel = model;

    for await (const event of agentLoop) {
      if (event.type === 'token') fullResponse += event.data.content as string;
      if (event.type === 'tool_end') {
        toolCalls.push({
          tool: event.data.tool as string,
          input: event.data.input ?? {},
          output: event.data.output as string,
        });
      }
      if (event.type === 'done') {
        if (event.data.tokenUsage) {
          tokenUsage = event.data.tokenUsage as typeof tokenUsage;
        }
        usedModel = (event.data.model as string) || model;
      }
    }

    const result = {
      success: true,
      response: fullResponse,
      model: usedModel,
      toolCalls,
      tokenUsage,
    };

    // 비동기 콜백
    if (typeof callbackUrl === 'string') {
      fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }

    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
```

**Step 3: 커밋**

```bash
git add src/app/api/webhooks/route.ts src/lib/middleware/rate-limiter.ts
git commit -m "feat: Webhook 트리거 엔드포인트 (API 키 인증)"
```

---

## Task 11: Webhook — 설정 UI

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: SettingsPanel에 Webhook 섹션 추가**

`src/components/settings/SettingsPanel.tsx`를 읽고 기존 구조를 확인한 뒤, 설정 패널 하단에 "Webhook API 키" 섹션을 추가한다.

이 섹션은:
- `GET /api/webhooks/keys`로 키 목록 조회
- `POST /api/webhooks/keys`로 키 생성 → 생성된 원본 키를 모달/인라인으로 표시
- `DELETE /api/webhooks/keys?id=xxx`로 키 삭제
- 키 목록: 이름, 접두사(`oa_xxxx...`), 생성일, 마지막 사용일 표시

구현 시 SettingsPanel.tsx의 기존 패턴(로컬 state + useEffect fetch)을 따른다.

상세 JSX는 기존 CustomToolEditor/McpServerManager 패턴과 유사하게 구성:
- useEffect로 키 목록 fetch
- "새 키 생성" 버튼 → name 입력 → POST → 원본 키 표시 (복사 기능)
- 각 키에 삭제 버튼

**Step 2: 커밋**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat: Webhook API 키 관리 UI를 설정 패널에 추가"
```

---

## Task 12: 모델 Failover — 설정 UI

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: Fallback 모델 설정 UI 추가**

SettingsPanel에 "Fallback 모델" 섹션 추가:
- 현재 `availableModels`(`/api/models`)에서 가져온 모델 목록을 select로 추가
- 추가된 모델은 순서대로 리스트 표시 (위/아래 이동 버튼)
- 삭제 버튼
- `settings.fallbackModels` 배열로 저장

기존 모델 선택 UI 근처에 배치.

**Step 2: 커밋**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat: Fallback 모델 설정 UI 추가"
```

---

## Task 13: 전체 통합 테스트

**Step 1: 기존 테스트 모두 통과 확인**

Run: `pnpm vitest run`
Expected: 모든 테스트 PASS (기존 + 신규)

**Step 2: 수동 확인 사항**

- `pnpm dev` 실행 후:
  1. 채팅에서 `/help` 입력 → 명령어 목록 표시 확인
  2. `/model` 입력 시 자동완성 드롭다운 확인
  3. `/new` 입력 → 새 대화 생성 확인
  4. 설정에서 Fallback 모델 추가 확인
  5. 설정에서 Webhook API 키 생성 → 키 표시 확인
  6. `curl -H "Authorization: Bearer <key>" -d '{"message":"hello"}' http://localhost:3000/api/webhooks` 테스트

**Step 3: 최종 커밋**

```bash
git add -A
git commit -m "feat: Phase 9 완료 - 채팅 명령어, 모델 Failover, Webhook, 도구 루프 감지"
```
