# Phase 6: 긴급 보안/버그 수정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 10개의 긴급 보안 취약점 및 버그를 수정하여 애플리케이션의 안정성과 보안을 확보한다.

**Architecture:** 4개 에이전트로 병렬 처리. 파일 충돌 없음.

**Tech Stack:** Next.js 16, TypeScript, React 19, Tailwind CSS 4

---

## Agent A: 도구 시스템 수정 (Task 1, 4, 7)

### Task 1: 프리셋 도구 이름 불일치 수정

**Files:**
- Modify: `src/lib/presets/defaults.ts:8,14`

**문제:** 프리셋이 존재하지 않는 도구 이름을 참조. `code_executor`→실제는 `code_execute`, `http_client`→실제는 `http_request`. 코딩/리서치 프리셋 선택 시 해당 도구가 활성화되지 않음.

**Step 1: 수정**

`src/lib/presets/defaults.ts` 8행과 14행을 수정:

```typescript
// Line 8: code_executor → code_execute
enabledTools: ['filesystem_read', 'filesystem_write', 'filesystem_list', 'filesystem_search', 'code_execute'],

// Line 14: http_client → http_request
enabledTools: ['web_search', 'http_request', 'filesystem_read'],
```

**Step 2: 커밋**

```bash
git add src/lib/presets/defaults.ts
git commit -m "fix: 프리셋 도구 이름 불일치 수정 (code_executor→code_execute, http_client→http_request)

코딩/리서치 프리셋 선택 시 해당 도구가 활성화되지 않던 버그 수정."
```

---

### Task 4: http_request 도구 SSRF 방지

**Files:**
- Modify: `src/lib/tools/http-client.ts:16-48`

**문제:** AI 에이전트가 `http://localhost:*`, `http://127.0.0.1:*`, `http://169.254.169.254/` 등 내부 URL에 접근 가능한 SSRF 취약점.

**Step 1: URL 검증 함수 추가 및 execute에 적용**

`src/lib/tools/http-client.ts`의 `execute` 메서드 시작 부분에 URL 검증 추가:

```typescript
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) return this.error('url is required');

    // SSRF prevention: block internal/private URLs
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.169.254'];
      if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return this.error('내부 네트워크 URL에는 접근할 수 없습니다.');
      }
      // Block private IP ranges
      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const [, a, b] = ipMatch.map(Number);
        if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
          return this.error('사설 IP 대역에는 접근할 수 없습니다.');
        }
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return this.error('HTTP/HTTPS 프로토콜만 허용됩니다.');
      }
    } catch {
      return this.error('유효하지 않은 URL입니다.');
    }

    const method = ((args.method as string) || 'GET').toUpperCase();
    // ... (나머지 기존 코드 유지)
```

**Step 2: 커밋**

```bash
git add src/lib/tools/http-client.ts
git commit -m "fix: http_request 도구 SSRF 방지 - 내부 네트워크 URL 차단

localhost, 사설 IP(10.x, 172.16-31.x, 192.168.x), 메타데이터 서비스(169.254.169.254),
.local/.internal 도메인 차단. HTTP/HTTPS만 허용."
```

---

### Task 7: toolRegistry 경쟁 조건 수정

**Files:**
- Modify: `src/lib/tools/init.ts:17-42`

**문제:** `initializeTools`에서 `toolRegistry.clear()` 후 도구 재등록 사이에 동시 요청이 빈 레지스트리를 사용할 수 있음. 또한 `registerCustomTools`/`registerMcpTools` 전에 다른 요청이 기본 도구만 있는 레지스트리를 사용.

**해결:** clear → register 순서 대신, 새 레지스트리를 구성한 후 한 번에 교체. 그리고 초기화 중 Lock으로 동시 접근 방지.

**Step 1: registry.ts에 atomic swap 지원 추가**

`src/lib/tools/registry.ts`에서 `clear()` 대신 `replaceAll(tools)` 메서드 추가:

파일 끝의 `export const toolRegistry` 앞에 추가:

```typescript
  replaceAll(newTools: BaseTool[]): void {
    this.tools.clear();
    for (const tool of newTools) {
      this.tools.set(tool.definition.name, tool);
    }
  }
```

**Step 2: init.ts에서 atomic 교체 방식으로 변경**

`src/lib/tools/init.ts` 전체를 다음으로 교체:

```typescript
import { toolRegistry } from './registry';
import {
  FilesystemReadTool,
  FilesystemWriteTool,
  FilesystemListTool,
  FilesystemSearchTool,
} from './filesystem';
import { HttpClientTool } from './http-client';
import { WebSearchTool } from './web-search';
import { CodeExecutorTool } from './code-executor';
import { ImageGeneratorTool } from './image-generator';
import { CustomTool } from './custom-tool';
import { McpTool } from './mcp-tool';
import { CustomToolDef, McpServerConfig } from '@/types/settings';
import { listTools } from '@/lib/mcp/client';
import { BaseTool } from './base-tool';

let lastConfigHash = '';
let initPromise: Promise<void> | null = null;

export async function initializeTools(
  allowedPaths: string[],
  deniedPaths: string[],
  searxngUrl: string = 'http://localhost:8888',
  ollamaUrl: string = 'http://localhost:11434',
  imageModel: string = 'x/z-image-turbo:latest'
) {
  const configHash = JSON.stringify({ allowedPaths, deniedPaths, searxngUrl, ollamaUrl, imageModel });
  if (configHash === lastConfigHash) return;

  // Prevent concurrent initialization
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      // Build all tools first, then swap atomically
      const tools: BaseTool[] = [
        new FilesystemReadTool(allowedPaths, deniedPaths),
        new FilesystemWriteTool(allowedPaths, deniedPaths),
        new FilesystemListTool(allowedPaths, deniedPaths),
        new FilesystemSearchTool(allowedPaths, deniedPaths),
        new HttpClientTool(),
        new WebSearchTool(searxngUrl),
        new CodeExecutorTool(),
        new ImageGeneratorTool(ollamaUrl, imageModel),
      ];

      toolRegistry.replaceAll(tools);
      lastConfigHash = configHash;
    } finally {
      initPromise = null;
    }
  })();

  await initPromise;
}

export function registerCustomTools(customTools: CustomToolDef[]) {
  for (const def of customTools) {
    toolRegistry.register(new CustomTool(def));
  }
}

export async function registerMcpTools(mcpServers: McpServerConfig[]) {
  for (const server of mcpServers) {
    if (!server.enabled) continue;
    try {
      const schemas = await listTools(server.url);
      for (const schema of schemas) {
        toolRegistry.register(new McpTool(server.url, schema));
      }
    } catch {
      // MCP server unavailable, skip
    }
  }
}
```

핵심 변경:
- `clear()` + 개별 `register()` 대신 `replaceAll(tools)` 한 번에 교체 (atomic swap)
- `initPromise`로 동시 초기화 방지 (두 번째 호출은 첫 번째 완료를 기다림)

**Step 3: 커밋**

```bash
git add src/lib/tools/registry.ts src/lib/tools/init.ts
git commit -m "fix: toolRegistry 경쟁 조건 수정 - atomic swap + 동시 초기화 방지

clear→register 사이 빈 레지스트리 노출 방지를 위해 replaceAll 도입.
initPromise로 동시 초기화 요청 시 중복 실행 방지."
```

---

## Agent B: 클라이언트 + 스토리지 수정 (Task 2, 3)

### Task 2: 키보드 핸들러 stale 클로저 수정

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx:69-85`

**문제:** `useEffect` 의존성 배열에 `handleNewChat`이 누락. `Ctrl+Shift+N` 단축키가 stale 클로저를 실행.

**Step 1: 수정**

`src/components/chat/ChatContainer.tsx` 69~85행의 useEffect를 수정. 의존성 배열에 `handleNewChat` 추가:

```typescript
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration, handleNewChat]);
```

변경: `}, [isLoading, stopGeneration]);` → `}, [isLoading, stopGeneration, handleNewChat]);`

**Step 2: 커밋**

```bash
git add src/components/chat/ChatContainer.tsx
git commit -m "fix: 키보드 핸들러 useEffect 의존성에 handleNewChat 추가

Ctrl+Shift+N 단축키가 stale 클로저를 참조하던 버그 수정."
```

---

### Task 3: 경로 순회(Path Traversal) 취약점 수정

**Files:**
- Modify: `src/lib/conversations/storage.ts` (상단에 validateId 추가, 함수들에 적용)
- Modify: `src/lib/presets/storage.ts` (동일하게 적용)

**문제:** API에서 받은 `id`를 검증 없이 `path.join(DIR, id + '.json')`에 사용. `id = "../../../etc/passwd"`로 임의 파일 접근 가능.

**Step 1: storage.ts에 ID 검증 추가**

`src/lib/conversations/storage.ts` 파일 상단(`const INDEX_FILE` 뒤)에 검증 함수 추가:

```typescript
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID: ${id}`);
  }
}
```

그리고 외부 입력을 받는 함수들 시작 부분에 `validateId(id)` 호출 추가:

- `getConversation(id)`: 39행 `try {` 다음 줄에 `validateId(id);` 추가
- `saveConversation(conv)`: 49행 `await ensureDir();` 다음 줄에 `validateId(conv.id);` 추가
- `deleteConversation(id)`: 77행 `try {` 다음 줄에 `validateId(id);` 추가

**Step 2: presets/storage.ts에도 동일하게 적용**

`src/lib/presets/storage.ts` 파일 상단(`const PRESETS_DIR` 뒤)에 동일한 검증 추가:

```typescript
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID: ${id}`);
  }
}
```

그리고 함수들에 적용:

- `getPreset(id)`: 42행 `try {` 다음 줄에 `validateId(id);` 추가
- `savePreset(preset)`: 51행 `await ensureDir();` 다음 줄에 `validateId(preset.id);` 추가
- `deletePreset(id)`: 59행 `try {` 다음 줄에 `validateId(id);` 추가

**Step 3: 커밋**

```bash
git add src/lib/conversations/storage.ts src/lib/presets/storage.ts
git commit -m "fix: 경로 순회(Path Traversal) 취약점 수정 - ID 검증 추가

대화 ID, 프리셋 ID를 파일 경로에 사용하기 전 정규식 검증.
영숫자, 하이픈, 언더스코어만 허용하여 ../etc/passwd 등 경로 조작 차단."
```

---

## Agent C: 승인 시스템 수정 (Task 5, 8)

### Task 5: 도구 승인 API 검증 추가

**Files:**
- Modify: `src/app/api/chat/confirm/route.ts`

**문제:** 누구든 임의의 `confirmId`로 POST 요청을 보내 도구 실행을 강제 승인/거부 가능. 입력 검증 없음.

**Step 1: 수정**

`src/app/api/chat/confirm/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveApproval } from '@/lib/agent/approval';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confirmId, approved } = body;

    // Input validation
    if (typeof confirmId !== 'string' || !confirmId || confirmId.length > 200) {
      return NextResponse.json({ error: 'Invalid confirmId' }, { status: 400 });
    }
    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Invalid approved value' }, { status: 400 });
    }

    const found = resolveApproval(confirmId, approved);
    if (!found) {
      return NextResponse.json({ error: 'Approval request not found or expired' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
```

**Step 2: 커밋**

```bash
git add src/app/api/chat/confirm/route.ts
git commit -m "fix: 도구 승인 API에 입력 검증 추가

confirmId 타입/길이 검증, approved boolean 검증.
존재하지 않는 승인 요청에 404 반환."
```

---

### Task 8: 승인 시스템 안정성 개선

**Files:**
- Modify: `src/lib/agent/approval.ts`

**문제:** `resolveApproval`이 void를 반환하여 승인 요청 존재 여부를 확인할 수 없음. Task 5의 검증 로직에서 필요.

**Step 1: 수정**

`src/lib/agent/approval.ts` 전체를 다음으로 교체:

```typescript
const pendingApprovals = new Map<string, (approved: boolean) => void>();

export function waitForApproval(confirmId: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(confirmId, resolve);
    setTimeout(() => {
      if (pendingApprovals.has(confirmId)) {
        pendingApprovals.delete(confirmId);
        resolve(false);
      }
    }, 60000);
  });
}

export function resolveApproval(confirmId: string, approved: boolean): boolean {
  const resolve = pendingApprovals.get(confirmId);
  if (resolve) {
    resolve(approved);
    pendingApprovals.delete(confirmId);
    return true;
  }
  return false;
}
```

변경: `resolveApproval`의 반환 타입을 `void` → `boolean`으로 변경. 승인 요청이 존재하면 `true`, 아니면 `false` 반환.

**Step 2: 커밋**

```bash
git add src/lib/agent/approval.ts
git commit -m "fix: resolveApproval 반환값 추가 - 승인 요청 존재 여부 확인

void → boolean 반환으로 변경하여 존재하지 않는 승인 요청 감지 가능.
confirm API에서 404 응답에 활용."
```

---

## Agent D: API 라우트 보안 수정 (Task 6, 9, 10)

### Task 6: 대화 임포트 입력 검증 추가

**Files:**
- Modify: `src/app/api/conversations/import/route.ts`

**문제:** 임포트된 JSON 데이터를 검증 없이 저장. `messages`에 악의적 데이터(XSS 페이로드, 시스템 역할 메시지) 주입 가능.

**Step 1: 수정**

`src/app/api/conversations/import/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

function sanitizeMessage(msg: unknown): { role: string; content: string; timestamp: number } | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;

  const role = m.role;
  if (role !== 'user' && role !== 'assistant') return null;

  const content = typeof m.content === 'string' ? m.content.slice(0, 50000) : '';
  const timestamp = typeof m.timestamp === 'number' ? m.timestamp : Date.now();

  return { role, content, timestamp };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();

    // Validate and sanitize title
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '가져온 대화';

    // Validate and sanitize messages
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages
      .map(sanitizeMessage)
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(0, 1000); // Max 1000 messages

    const conv: Conversation = {
      id: uuidv4(),
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
      messages,
    };

    await saveConversation(conv);
    return NextResponse.json(conv, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to import conversation' }, { status: 500 });
  }
}
```

핵심 변경:
- `sanitizeMessage`: role을 user/assistant로 제한 (system 차단), content 길이 제한
- title 길이 200자 제한
- messages 배열 1000개 제한
- 타입 검증 추가

**Step 2: 커밋**

```bash
git add src/app/api/conversations/import/route.ts
git commit -m "fix: 대화 임포트 입력 검증 추가 - XSS/주입 방지

role을 user/assistant로 제한, content 50K자 제한, title 200자 제한,
messages 1000개 제한, system 역할 메시지 차단."
```

---

### Task 9: SVG 업로드 XSS 위험 제거

**Files:**
- Modify: `src/app/api/upload/route.ts:14`

**문제:** SVG 파일이 허용되지만, SVG는 `<script>` 태그로 JavaScript를 실행할 수 있어 XSS 취약점.

**Step 1: ALLOWED_EXTENSIONS에서 .svg 제거**

`src/app/api/upload/route.ts` 14행에서 `'.svg'` 제거:

```typescript
// Before:
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',

// After:
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
```

**Step 2: 커밋**

```bash
git add src/app/api/upload/route.ts
git commit -m "fix: SVG 업로드 차단 - XSS 위험 제거

SVG 파일은 <script> 태그로 JavaScript 실행 가능하므로 허용 목록에서 제거."
```

---

### Task 10: Content-Disposition 헤더 인젝션 수정

**Files:**
- Modify: `src/app/api/conversations/[id]/export/route.ts:23-33`

**문제:** `conv.title`에 `"` 문자가 포함되면 Content-Disposition 헤더가 깨짐. 파일명 인젝션 가능.

**Step 1: 수정**

`src/app/api/conversations/[id]/export/route.ts`에서 Content-Disposition 헤더의 파일명을 안전하게 인코딩:

23~28행을 수정:

```typescript
      // Before:
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${conv.title}.md"`,
        },
      });

      // After:
      const safeTitle = conv.title.replace(/[^\w가-힣\s.-]/g, '_');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}.md"; filename*=UTF-8''${encodeURIComponent(conv.title)}.md`,
        },
      });
```

31~35행도 동일하게 수정:

```typescript
      // Before:
      return NextResponse.json(conv, {
        headers: {
          'Content-Disposition': `attachment; filename="${conv.id}.json"`,
        },
      });

      // After:
      return NextResponse.json(conv, {
        headers: {
          'Content-Disposition': `attachment; filename="${conv.id}.json"`,
        },
      });
```

(JSON 내보내기는 `conv.id`가 UUID이므로 안전. Markdown 내보내기만 수정 필요.)

**Step 2: 커밋**

```bash
git add "src/app/api/conversations/[id]/export/route.ts"
git commit -m "fix: Content-Disposition 헤더 인젝션 수정

conv.title의 특수문자를 안전한 문자로 치환.
RFC 5987 filename* 파라미터로 UTF-8 파일명 지원."
```

---

## 에이전트 구성

| 에이전트 | 작업 | 파일 |
|----------|------|------|
| **Agent A** (도구 시스템) | Task 1, 4, 7 | defaults.ts, http-client.ts, registry.ts, init.ts |
| **Agent B** (클라이언트+스토리지) | Task 2, 3 | ChatContainer.tsx, storage.ts, presets/storage.ts |
| **Agent C** (승인 시스템) | Task 5, 8 | confirm/route.ts, approval.ts |
| **Agent D** (API 라우트) | Task 6, 9, 10 | import/route.ts, upload/route.ts, export/route.ts |

파일 충돌 없음 → 완전 병렬 실행 가능.
