# Phase 2 기능 확장 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 3개 기능 추가 — Thinking 토큰 스트리밍, 대화 폴더/태그/고정, 모델 파라미터 슬라이더

**Architecture:** 3개 기능이 독립적이므로 3개 에이전트가 병렬 작업. 각 에이전트는 타입 → 백엔드 → 프론트엔드 순으로 구현. 기존 파일 기반 저장소와 SSE 스트리밍 패턴을 따름.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Ollama API

---

## Agent A: Thinking 토큰 스트리밍 표시

### Task A1: OllamaChatStreamChunk에 thinking 필드 추가

**Files:**
- Modify: `src/lib/ollama/types.ts:53-60`

**Step 1: OllamaChatStreamChunk에 thinking 필드 추가**

`src/lib/ollama/types.ts`에서 `OllamaChatStreamChunk` 인터페이스를 수정:

```typescript
export interface OllamaChatStreamChunk {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  thinking?: string;
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/ollama/types.ts
git commit -m "feat(thinking): add thinking field to OllamaChatStreamChunk"
```

---

### Task A2: chatStream에서 think 파라미터 지원

**Files:**
- Modify: `src/lib/ollama/client.ts:56-63`

**Step 1: chatStream에서 think 파라미터를 request에서 받도록 변경**

`src/lib/ollama/client.ts`의 `chatStream` 함수에서 hardcoded `think: false`를 request의 think 값 사용으로 변경:

```typescript
export async function* chatStream(
  baseUrl: string,
  request: OllamaChatRequest
): AsyncGenerator<OllamaChatStreamChunk> {
  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, stream: true }),
  });
```

**주의:** `think: false` 하드코딩 제거. request에 `think` 필드가 있으면 그 값을 사용. 없으면 Ollama 기본값(모델 기본).

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/ollama/client.ts
git commit -m "feat(thinking): allow think parameter in chatStream"
```

---

### Task A3: AgentEvent에 thinking_token 타입 추가

**Files:**
- Modify: `src/lib/agent/types.ts:35-38`

**Step 1: AgentEvent type union에 thinking_token 추가**

```typescript
export interface AgentEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'tool_confirm' | 'token' | 'thinking_token' | 'image' | 'done' | 'error';
  data: Record<string, unknown>;
}
```

**Step 2: AgentConfig에 modelOptions 추가 (Agent C와 공유 타입)**

```typescript
export interface AgentConfig {
  ollamaUrl: string;
  ollamaModel: string;
  maxIterations: number;
  systemPrompt: string;
  allowedPaths: string[];
  deniedPaths: string[];
  toolApprovalMode?: 'auto' | 'confirm' | 'deny-dangerous';
  onToolApproval?: (toolName: string, args: Record<string, unknown>, confirmId: string) => Promise<boolean>;
  modelOptions?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/agent/types.ts
git commit -m "feat(thinking): add thinking_token to AgentEvent, modelOptions to AgentConfig"
```

---

### Task A4: agent-loop에서 최종 응답을 chatStream으로 스트리밍 + thinking 토큰 yield

**Files:**
- Modify: `src/lib/agent/agent-loop.ts:47-60`

**Step 1: 최종 응답(tool call 없는 경우)을 chatStream으로 변경**

현재 agent-loop는 non-streaming `chat()`으로 전체 응답을 받고 `splitIntoChunks`로 분할. 이를 `chatStream()`으로 변경하여 진짜 스트리밍 + thinking 토큰 지원.

`src/lib/agent/agent-loop.ts` 전체를 다음으로 교체:

```typescript
import { AgentConfig, AgentEvent } from './types';
import { toolRegistry } from '@/lib/tools/registry';
import { chat, chatStream } from '@/lib/ollama/client';
import { OllamaChatMessage } from '@/lib/ollama/types';

export async function* runAgentLoop(
  config: AgentConfig,
  userMessage: string,
  history: { role: string; content: string }[],
  memories: string[] = [],
  images: string[] = []
): AsyncGenerator<AgentEvent> {
  // Build system prompt with memories
  let systemPrompt = config.systemPrompt;
  if (memories.length > 0) {
    systemPrompt += '\n\n## 관련 기억\n' + memories.map((m) => `- ${m}`).join('\n');
  }

  const userMsg: OllamaChatMessage = { role: 'user', content: userMessage };
  if (images.length > 0) {
    userMsg.images = images;
  }

  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];

  const tools = toolRegistry.toOllamaTools();

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    yield { type: 'thinking', data: { iteration } };

    // Non-streaming call to check for tool use (think: false for speed)
    const response = await chat(config.ollamaUrl, {
      model: config.ollamaModel,
      messages,
      stream: false,
      think: false,
      tools,
      options: config.modelOptions,
    });

    const assistantMsg = response.message;
    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // No tool call -> final answer. Use chatStream with think: true for thinking tokens.
      const thinkingStartTime = Date.now();
      let hasThinking = false;

      for await (const chunk of chatStream(config.ollamaUrl, {
        model: config.ollamaModel,
        messages,
        think: true,
        options: config.modelOptions,
      })) {
        if (chunk.thinking) {
          hasThinking = true;
          yield { type: 'thinking_token', data: { content: chunk.thinking } };
        }
        if (chunk.message?.content) {
          yield { type: 'token', data: { content: chunk.message.content } };
        }
      }

      if (hasThinking) {
        const thinkingDuration = Date.now() - thinkingStartTime;
        yield { type: 'thinking_token', data: { done: true, duration: thinkingDuration } };
      }

      yield { type: 'done', data: { iterations: iteration + 1 } };
      return;
    }

    // Yield any text content before tool calls
    if (assistantMsg.content) {
      const chunks = splitIntoChunks(assistantMsg.content, 4);
      for (const chunk of chunks) {
        yield { type: 'token', data: { content: chunk } };
      }
    }

    // Add assistant message with tool_calls to conversation
    messages.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: toolCalls,
    });

    // Execute each tool call
    const DANGEROUS_TOOLS = ['code_executor', 'filesystem_write'];

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = tc.function.arguments;

      // Check tool approval mode
      if (config.toolApprovalMode && config.toolApprovalMode !== 'auto') {
        const isDangerous = DANGEROUS_TOOLS.includes(toolName);
        if (config.toolApprovalMode === 'confirm' ||
            (config.toolApprovalMode === 'deny-dangerous' && isDangerous)) {
          const confirmId = `${Date.now()}-${toolName}`;
          yield { type: 'tool_confirm', data: { tool: toolName, input: toolArgs, confirmId } };
          if (config.onToolApproval) {
            const approved = await config.onToolApproval(toolName, toolArgs, confirmId);
            if (!approved) {
              messages.push({ role: 'tool', content: `도구 "${toolName}" 실행이 사용자에 의해 거부되었습니다.` });
              yield { type: 'tool_end', data: { tool: toolName, output: '사용자가 거부함', success: false } };
              continue;
            }
          }
        }
      }

      yield { type: 'tool_start', data: { tool: toolName, input: toolArgs } };

      const result = await toolRegistry.execute(toolName, toolArgs);

      // Check if result contains image data
      let observation = result.output;
      if (result.success && result.output.startsWith('__IMAGE__')) {
        const imageMatch = result.output.match(/__IMAGE__([\s\S]+?)__PROMPT__([\s\S]+)/);
        if (imageMatch) {
          yield {
            type: 'image',
            data: { base64: imageMatch[1], prompt: imageMatch[2] },
          };
          observation = `Image generated successfully for prompt: "${imageMatch[2]}"`;
        }
      }

      yield {
        type: 'tool_end',
        data: {
          tool: toolName,
          output: observation.slice(0, 500),
          success: result.success,
        },
      };

      // Add tool response to conversation
      messages.push({
        role: 'tool',
        content: observation,
      });
    }
  }

  // Max iterations reached
  yield {
    type: 'token',
    data: { content: '최대 반복 횟수에 도달했습니다. 작업을 완료하지 못했을 수 있습니다.' },
  };
  yield { type: 'done', data: { iterations: config.maxIterations } };
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}
```

**핵심 변경:**
1. 최종 응답(tool call 없음)을 `chatStream`으로 변경 (`think: true`)
2. `chunk.thinking`이 있으면 `thinking_token` 이벤트 yield
3. thinking 완료 시 `{ done: true, duration }` 전송
4. non-streaming tool 판단은 `chat()`에 `think: false` 유지
5. `config.modelOptions`를 `options`에 전달

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/agent/agent-loop.ts
git commit -m "feat(thinking): stream final response with chatStream, yield thinking tokens"
```

---

### Task A5: Message 타입에 thinkingContent 필드 추가

**Files:**
- Modify: `src/types/message.ts:1-9`

**Step 1: Message 인터페이스에 thinkingContent 추가**

```typescript
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  images?: ImageInfo[];
  attachedImages?: string[];
  thinkingContent?: string;
  thinkingDuration?: number;
}
```

**Step 2: Commit**

```bash
git add src/types/message.ts
git commit -m "feat(thinking): add thinkingContent and thinkingDuration to Message"
```

---

### Task A6: useChat에서 thinking_token SSE 이벤트 처리

**Files:**
- Modify: `src/hooks/useChat.ts:140-192`

**Step 1: handleSSEEvent에 thinking_token 케이스 추가**

`handleSSEEvent`의 switch문에 `thinking_token` 케이스를 `token` 아래에 추가:

```typescript
case 'thinking_token': {
  if (data.done) {
    return { ...m, thinkingDuration: data.duration as number };
  }
  return {
    ...m,
    thinkingContent: (m.thinkingContent || '') + (data.content as string),
  };
}
```

이 코드를 `case 'token':` 반환문 바로 뒤에 추가.

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat(thinking): handle thinking_token SSE events in useChat"
```

---

### Task A7: MessageBubble에 ThinkingToggle UI 추가

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

**Step 1: ThinkingToggle 컴포넌트를 MessageBubble 안에 추가**

MessageBubble에서 assistant 메시지이고 `thinkingContent`가 있을 때 접이식 토글 표시. ToolCallDisplay 위에 추가.

`MessageBubble.tsx` 상단에 ThinkingToggle 인라인 컴포넌트 추가:

```typescript
'use client';

import { useState } from 'react';
import { Message } from '@/types/message';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import ToolCallDisplay from './ToolCallDisplay';
import ImageDisplay from './ImageDisplay';
import AudioPlayer from '@/components/voice/AudioPlayer';
import { useVoice } from '@/hooks/useVoice';

function ThinkingToggle({ content, duration }: { content: string; duration?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const durationText = duration ? `${(duration / 1000).toFixed(1)}초` : '';

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>
        <span>Thinking{durationText ? ` (${durationText})` : ''}</span>
      </button>
      {isOpen && (
        <div className="mt-1 pl-4 border-l-2 border-border text-xs text-muted leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}
```

그 다음 MessageBubble JSX에서 tool calls 위에 추가:

```tsx
{!isUser && message.thinkingContent && (
  <ThinkingToggle
    content={message.thinkingContent}
    duration={message.thinkingDuration}
  />
)}
```

이 코드를 `{!isUser && message.toolCalls && ...}` 블록 바로 위에 삽입.

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat(thinking): add collapsible ThinkingToggle UI in MessageBubble"
```

---

### Task A8: chat route에서 modelOptions를 agent config에 전달

**Files:**
- Modify: `src/app/api/chat/route.ts:51-65`

**Step 1: AgentConfig에 modelOptions 전달**

`runAgentLoop` 호출 시 config 객체에 `modelOptions` 추가:

```typescript
const agentLoop = runAgentLoop(
  {
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    maxIterations: settings.maxIterations,
    systemPrompt: settings.systemPrompt,
    allowedPaths: settings.allowedPaths,
    deniedPaths: settings.deniedPaths,
    toolApprovalMode: settings.toolApprovalMode,
    modelOptions: settings.modelOptions,
    onToolApproval: settings.toolApprovalMode !== 'auto'
      ? (_toolName: string, _args: Record<string, unknown>, confirmId: string) => {
          return waitForApproval(confirmId);
        }
      : undefined,
  },
  body.message,
  history,
  memories,
  body.images || [],
);
```

**Step 2: thinking_token 이벤트도 SSE로 전달 확인**

현재 `for await (const event of agentLoop)` 루프에서 `event.type === 'token'`만 `fullResponse`에 누적하고, 모든 이벤트를 SSE로 전달함. `thinking_token`은 `fullResponse`에 누적하지 않아도 되므로 기존 코드가 그대로 동작.

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(thinking): pass modelOptions to agent config in chat route"
```

---

## Agent B: 대화 폴더/태그/고정

### Task B1: ConversationMeta에 folderId, tags, pinned 추가

**Files:**
- Modify: `src/types/conversation.ts`

**Step 1: ConversationMeta 확장**

```typescript
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  folderId?: string;
  tags?: string[];
  pinned?: boolean;
}

export interface Conversation extends ConversationMeta {
  messages: import('./message').Message[];
}
```

**Step 2: Commit**

```bash
git add src/types/conversation.ts
git commit -m "feat(folders): add folderId, tags, pinned to ConversationMeta"
```

---

### Task B2: FolderMeta 타입 생성

**Files:**
- Create: `src/types/folder.ts`

**Step 1: FolderMeta 인터페이스 생성**

```typescript
export interface FolderMeta {
  id: string;
  name: string;
  color: string;
  order: number;
}
```

**Step 2: Commit**

```bash
git add src/types/folder.ts
git commit -m "feat(folders): create FolderMeta type"
```

---

### Task B3: 폴더 CRUD 저장소 구현

**Files:**
- Create: `src/lib/conversations/folders.ts`

**Step 1: 폴더 저장소 구현**

```typescript
import { FolderMeta } from '@/types/folder';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');

async function readFolders(): Promise<FolderMeta[]> {
  try {
    const data = await fs.readFile(FOLDERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeFolders(folders: FolderMeta[]): Promise<void> {
  await fs.mkdir(path.dirname(FOLDERS_FILE), { recursive: true });
  await fs.writeFile(FOLDERS_FILE, JSON.stringify(folders, null, 2));
}

export async function listFolders(): Promise<FolderMeta[]> {
  const folders = await readFolders();
  return folders.sort((a, b) => a.order - b.order);
}

export async function createFolder(name: string, color: string): Promise<FolderMeta> {
  const folders = await readFolders();
  const folder: FolderMeta = {
    id: `folder-${Date.now()}`,
    name,
    color,
    order: folders.length,
  };
  folders.push(folder);
  await writeFolders(folders);
  return folder;
}

export async function updateFolder(id: string, updates: Partial<FolderMeta>): Promise<FolderMeta | null> {
  const folders = await readFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  folders[idx] = { ...folders[idx], ...updates, id };
  await writeFolders(folders);
  return folders[idx];
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await readFolders();
  const filtered = folders.filter((f) => f.id !== id);
  await writeFolders(filtered);
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/conversations/folders.ts
git commit -m "feat(folders): implement folder CRUD storage"
```

---

### Task B4: 폴더 API 라우트 구현

**Files:**
- Create: `src/app/api/folders/route.ts`
- Create: `src/app/api/folders/[id]/route.ts`

**Step 1: 폴더 목록/생성 API**

`src/app/api/folders/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { listFolders, createFolder } from '@/lib/conversations/folders';

export async function GET() {
  try {
    const folders = await listFolders();
    return NextResponse.json(folders);
  } catch {
    return NextResponse.json({ error: 'Failed to list folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, color } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const folder = await createFolder(name, color || '#6366f1');
    return NextResponse.json(folder, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
```

**Step 2: 개별 폴더 수정/삭제 API**

`src/app/api/folders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateFolder, deleteFolder } from '@/lib/conversations/folders';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const folder = await updateFolder(id, body);
    if (!folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(folder);
  } catch {
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteFolder(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
```

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/app/api/folders/route.ts src/app/api/folders/\[id\]/route.ts
git commit -m "feat(folders): add folder API routes"
```

---

### Task B5: useConversations에 폴더/태그/핀 기능 추가

**Files:**
- Modify: `src/hooks/useConversations.ts`

**Step 1: 폴더 상태와 대화 관리 함수 추가**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // fetch failed
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch {
      // fetch failed
    }
  }, []);

  const createConversation = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || '새 대화' }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchConversations();
        setActiveId(data.id);
        return data.id;
      }
    } catch {
      // create failed
    }
    return null;
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      await fetchConversations();
      if (activeId === id) {
        setActiveId(null);
      }
    } catch {
      // delete failed
    }
  }, [activeId, fetchConversations]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      await fetchConversations();
    } catch {
      // rename failed
    }
  }, [fetchConversations]);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchConversations();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // search failed
    }
  }, [fetchConversations]);

  const togglePin = useCallback(async (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !conv.pinned }),
      });
      await fetchConversations();
    } catch {
      // toggle failed
    }
  }, [conversations, fetchConversations]);

  const moveToFolder = useCallback(async (convId: string, folderId: string | null) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId || undefined }),
      });
      await fetchConversations();
    } catch {
      // move failed
    }
  }, [fetchConversations]);

  const updateTags = useCallback(async (convId: string, tags: string[]) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      await fetchConversations();
    } catch {
      // update failed
    }
  }, [fetchConversations]);

  const createFolder = useCallback(async (name: string, color?: string) => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (res.ok) {
        await fetchFolders();
      }
    } catch {
      // create failed
    }
  }, [fetchFolders]);

  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      await fetchFolders();
      await fetchConversations();
    } catch {
      // delete failed
    }
  }, [fetchFolders, fetchConversations]);

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await fetchFolders();
    } catch {
      // rename failed
    }
  }, [fetchFolders]);

  useEffect(() => {
    fetchConversations();
    fetchFolders();
  }, [fetchConversations, fetchFolders]);

  return {
    conversations,
    folders,
    activeId,
    setActiveId,
    searchQuery,
    fetchConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
    togglePin,
    moveToFolder,
    updateTags,
    createFolder,
    deleteFolder,
    renameFolder,
  };
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/hooks/useConversations.ts
git commit -m "feat(folders): add folder/tag/pin functions to useConversations"
```

---

### Task B6: FolderGroup 컴포넌트 생성

**Files:**
- Create: `src/components/sidebar/FolderGroup.tsx`

**Step 1: 접이식 폴더 그룹 컴포넌트**

```tsx
'use client';

import { useState } from 'react';
import { FolderMeta } from '@/types/folder';

interface FolderGroupProps {
  folder: FolderMeta;
  children: React.ReactNode;
  count: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function FolderGroup({ folder, children, count, onRename, onDelete }: FolderGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 px-2 py-1 group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-0.5 text-muted hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: folder.color }}
        />
        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="flex-1 text-xs bg-background border border-border rounded px-1 py-0.5 outline-none focus:border-accent"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-muted truncate">
            {folder.name}
          </span>
        )}
        <span className="text-[10px] text-muted">{count}</span>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setEditName(folder.name); setIsEditing(true); }}
            className="p-0.5 text-muted hover:text-foreground"
            title="이름 변경"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
            className="p-0.5 text-muted hover:text-error"
            title="삭제"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      {isOpen && <div className="ml-2">{children}</div>}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/sidebar/FolderGroup.tsx
git commit -m "feat(folders): create FolderGroup collapsible component"
```

---

### Task B7: ConversationItem에 핀/태그/폴더 이동 UI 추가

**Files:**
- Modify: `src/components/sidebar/ConversationItem.tsx`

**Step 1: props에 폴더/핀/태그 관련 추가**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 30) return `${days}일 전`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

interface ConversationItemProps {
  conversation: ConversationMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin?: (id: string) => void;
  onMoveToFolder?: (convId: string, folderId: string | null) => void;
  folders?: FolderMeta[];
}

export default function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onMoveToFolder,
  folders,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!showFolderMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFolderMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderMenu]);

  const handleRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-accent/20 text-foreground' : 'text-muted hover:bg-card hover:text-foreground'
      }`}
      onClick={() => !isEditing && onSelect(conversation.id)}
    >
      {/* Pin indicator */}
      {conversation.pinned && (
        <span className="text-accent text-[10px] shrink-0" title="고정됨">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </span>
      )}

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full text-sm bg-background border border-border rounded px-1 py-0.5 outline-none focus:border-accent"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="text-sm truncate">{conversation.title}</div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">{formatTimeAgo(conversation.updatedAt)}</span>
              {conversation.tags && conversation.tags.length > 0 && (
                <div className="flex gap-0.5">
                  {conversation.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[9px] bg-accent/10 text-accent px-1 rounded">
                      {tag}
                    </span>
                  ))}
                  {conversation.tags.length > 2 && (
                    <span className="text-[9px] text-muted">+{conversation.tags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 relative">
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(conversation.id); }}
              className={`p-1 rounded transition-colors ${conversation.pinned ? 'text-accent' : 'text-muted hover:text-foreground'}`}
              title={conversation.pinned ? '고정 해제' : '고정'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={conversation.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          )}
          {onMoveToFolder && folders && folders.length > 0 && (
            <div ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFolderMenu(!showFolderMenu); }}
                className="p-1 text-muted hover:text-foreground rounded transition-colors"
                title="폴더 이동"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </button>
              {showFolderMenu && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 py-1 min-w-[120px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(conversation.id, null); setShowFolderMenu(false); }}
                    className="w-full px-3 py-1 text-xs text-left text-muted hover:bg-card-hover hover:text-foreground"
                  >
                    미분류
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => { e.stopPropagation(); onMoveToFolder(conversation.id, f.id); setShowFolderMenu(false); }}
                      className="w-full px-3 py-1 text-xs text-left text-muted hover:bg-card-hover hover:text-foreground flex items-center gap-1.5"
                    >
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: f.color }} />
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditTitle(conversation.title);
              setIsEditing(true);
            }}
            className="p-1 text-muted hover:text-foreground rounded transition-colors"
            title="이름 변경"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conversation.id);
            }}
            className="p-1 text-muted hover:text-error rounded transition-colors"
            title="삭제"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/sidebar/ConversationItem.tsx
git commit -m "feat(folders): add pin/folder/tag UI to ConversationItem"
```

---

### Task B8: Sidebar에 폴더별 그룹, 고정 섹션 적용

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`

**Step 1: Sidebar를 폴더/핀/미분류 구조로 재구성**

```tsx
'use client';

import { useState, useRef } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';
import ConversationItem from './ConversationItem';
import FolderGroup from './FolderGroup';

interface SidebarProps {
  conversations: ConversationMeta[];
  folders: FolderMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  isOpen: boolean;
  onClose: () => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
  onImport: () => void;
  onTogglePin: (id: string) => void;
  onMoveToFolder: (convId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, color?: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
}

export default function Sidebar({
  conversations,
  folders,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearch,
  searchQuery,
  isOpen,
  onClose,
  onExport,
  onImport,
  onTogglePin,
  onMoveToFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/conversations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        onImport();
      }
    } catch {
      // import failed
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = (id: string) => {
    onExport(id, 'json');
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed);
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  // Group conversations
  const pinned = conversations.filter((c) => c.pinned);
  const byFolder = new Map<string, ConversationMeta[]>();
  const uncategorized: ConversationMeta[] = [];

  for (const conv of conversations) {
    if (conv.pinned) continue; // pinned shown separately
    if (conv.folderId) {
      const list = byFolder.get(conv.folderId) || [];
      list.push(conv);
      byFolder.set(conv.folderId, list);
    } else {
      uncategorized.push(conv);
    }
  }

  const renderItem = (conv: ConversationMeta) => (
    <ConversationItem
      key={conv.id}
      conversation={conv}
      isActive={conv.id === activeId}
      onSelect={(id) => { onSelect(id); onClose(); }}
      onDelete={onDelete}
      onRename={onRename}
      onTogglePin={onTogglePin}
      onMoveToFolder={onMoveToFolder}
      folders={folders}
    />
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed md:relative z-30 md:z-auto md:translate-x-0 w-72 h-screen flex flex-col bg-background border-r border-border transition-transform duration-200`}
      >
        {/* New conversation button */}
        <div className="p-3 border-b border-border flex gap-2">
          <button
            onClick={onNew}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 대화
          </button>
          <button
            onClick={() => setShowNewFolder(true)}
            className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
            title="새 폴더"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="px-3 py-2 border-b border-border flex gap-2">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolder(false);
              }}
              placeholder="폴더 이름..."
              className="flex-1 text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent border border-border"
              autoFocus
            />
            <button onClick={handleCreateFolder} className="text-xs text-accent hover:text-accent-hover">생성</button>
            <button onClick={() => setShowNewFolder(false)} className="text-xs text-muted hover:text-foreground">취소</button>
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="대화 검색..."
            className="w-full text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-accent border border-border"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {conversations.length === 0 ? (
            <div className="text-center text-muted text-xs py-8">
              {searchQuery ? '검색 결과가 없습니다' : '대화가 없습니다'}
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-medium text-muted uppercase tracking-wider">고정됨</div>
                  <div className="space-y-0.5">{pinned.map(renderItem)}</div>
                </div>
              )}

              {/* Folder groups */}
              {folders.map((folder) => {
                const items = byFolder.get(folder.id) || [];
                if (items.length === 0 && searchQuery) return null;
                return (
                  <FolderGroup
                    key={folder.id}
                    folder={folder}
                    count={items.length}
                    onRename={onRenameFolder}
                    onDelete={onDeleteFolder}
                  >
                    <div className="space-y-0.5">{items.map(renderItem)}</div>
                  </FolderGroup>
                );
              })}

              {/* Uncategorized */}
              {uncategorized.length > 0 && (
                <div className="mb-2">
                  {(folders.length > 0 || pinned.length > 0) && (
                    <div className="px-2 py-1 text-[10px] font-medium text-muted uppercase tracking-wider">미분류</div>
                  )}
                  <div className="space-y-0.5">{uncategorized.map(renderItem)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-border flex gap-2">
          <button
            onClick={handleImportClick}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            가져오기
          </button>
          {activeId && (
            <button
              onClick={() => handleExport(activeId)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              내보내기
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </aside>
    </>
  );
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat(folders): restructure Sidebar with pinned/folder/uncategorized groups"
```

---

### Task B9: ChatContainer에서 새 Sidebar props 전달

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: useConversations에서 새 함수들 destructure하고 Sidebar에 전달**

ChatContainer에서 `useConversations`의 destructure를 확장:

```typescript
const {
  conversations,
  folders,
  activeId,
  setActiveId,
  searchQuery,
  fetchConversations,
  createConversation,
  deleteConversation,
  renameConversation,
  search,
  togglePin,
  moveToFolder,
  updateTags,
  createFolder,
  deleteFolder: deleteFolderFn,
  renameFolder,
} = useConversations();
```

그리고 Sidebar JSX에 새 props 추가:

```tsx
<Sidebar
  conversations={conversations}
  folders={folders}
  activeId={activeId}
  onSelect={handleSelectConversation}
  onNew={handleNewChat}
  onDelete={handleDeleteConversation}
  onRename={renameConversation}
  onSearch={search}
  searchQuery={searchQuery}
  isOpen={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  onExport={handleExport}
  onImport={handleImport}
  onTogglePin={togglePin}
  onMoveToFolder={moveToFolder}
  onCreateFolder={createFolder}
  onDeleteFolder={deleteFolderFn}
  onRenameFolder={renameFolder}
/>
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/chat/ChatContainer.tsx
git commit -m "feat(folders): pass folder/pin/tag props from ChatContainer to Sidebar"
```

---

### Task B10: 대화 저장소에서 pinned 정렬 지원

**Files:**
- Modify: `src/lib/conversations/storage.ts:27-30`

**Step 1: listConversations에서 pinned 대화를 상단에 정렬**

`listConversations` 함수를 수정. `saveConversation`은 이미 spread로 처리하므로 folderId, tags, pinned가 자동 저장.

```typescript
export async function listConversations(): Promise<ConversationMeta[]> {
  const index = await readIndex();
  return index.sort((a, b) => {
    // Pinned first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Then by updatedAt
    return b.updatedAt - a.updatedAt;
  });
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/conversations/storage.ts
git commit -m "feat(folders): sort pinned conversations first in listing"
```

---

## Agent C: 모델 파라미터 조정 UI

### Task C1: Settings 타입에 modelOptions 추가

**Files:**
- Modify: `src/types/settings.ts:32-49`

**Step 1: ModelOptions 인터페이스와 Settings 확장**

`src/types/settings.ts`에 `ModelOptions` 인터페이스를 추가하고 Settings에 반영:

```typescript
export interface ModelOptions {
  temperature: number;
  topP: number;
  numPredict: number;
}

export interface Settings {
  systemPrompt: string;
  maxIterations: number;
  allowedPaths: string[];
  deniedPaths: string[];
  responseLanguage: string;
  ollamaUrl: string;
  ollamaModel: string;
  embeddingModel: string;
  imageModel: string;
  searxngUrl: string;
  autoReadResponses: boolean;
  ttsVoice: string;
  toolApprovalMode: ToolApprovalMode;
  activePresetId?: string;
  customTools: CustomToolDef[];
  mcpServers: McpServerConfig[];
  modelOptions: ModelOptions;
}
```

**Step 2: Commit**

```bash
git add src/types/settings.ts
git commit -m "feat(params): add ModelOptions interface to Settings type"
```

---

### Task C2: DEFAULT_SETTINGS에 modelOptions 기본값 추가

**Files:**
- Modify: `src/lib/config/constants.ts:6-23`

**Step 1: DEFAULT_SETTINGS에 modelOptions 추가**

```typescript
export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: `당신은 유능한 AI 어시스턴트입니다. 사용자의 질문에 정확하고 도움이 되는 답변을 제공합니다. 한국어로 응답하세요.`,
  maxIterations: 10,
  allowedPaths: ['/Users', '/tmp'],
  deniedPaths: ['/etc', '/var', '/usr', '/bin', '/sbin', '/System'],
  responseLanguage: 'ko',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.5:9b',
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:8b',
  imageModel: process.env.OLLAMA_IMAGE_MODEL || 'x/z-image-turbo:latest',
  searxngUrl: process.env.SEARXNG_URL || 'http://localhost:8888',
  autoReadResponses: false,
  ttsVoice: 'ko-KR-SunHiNeural',
  toolApprovalMode: 'auto' as const,
  activePresetId: undefined,
  customTools: [],
  mcpServers: [],
  modelOptions: {
    temperature: 0.7,
    topP: 0.9,
    numPredict: 2048,
  },
};
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/lib/config/constants.ts
git commit -m "feat(params): add modelOptions defaults to DEFAULT_SETTINGS"
```

---

### Task C3: chat route에서 modelOptions를 AgentConfig options로 변환

**Files:**
- Modify: `src/app/api/chat/route.ts:51-65`

**Step 1: settings.modelOptions를 Ollama API options 형식으로 변환하여 전달**

`runAgentLoop` config에 `modelOptions` 추가. camelCase → snake_case 변환:

```typescript
const agentLoop = runAgentLoop(
  {
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    maxIterations: settings.maxIterations,
    systemPrompt: settings.systemPrompt,
    allowedPaths: settings.allowedPaths,
    deniedPaths: settings.deniedPaths,
    toolApprovalMode: settings.toolApprovalMode,
    modelOptions: settings.modelOptions ? {
      temperature: settings.modelOptions.temperature,
      top_p: settings.modelOptions.topP,
      num_predict: settings.modelOptions.numPredict,
    } : undefined,
    onToolApproval: settings.toolApprovalMode !== 'auto'
      ? (_toolName: string, _args: Record<string, unknown>, confirmId: string) => {
          return waitForApproval(confirmId);
        }
      : undefined,
  },
  body.message,
  history,
  memories,
  body.images || [],
);
```

**참고:** AgentConfig의 `modelOptions`는 Ollama API 형식(snake_case)을 사용. Settings의 `modelOptions`는 camelCase. 여기서 변환.

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(params): pass modelOptions from settings to agent config"
```

---

### Task C4: ModelOptionsSliders 컴포넌트 생성

**Files:**
- Create: `src/components/settings/ModelOptionsSliders.tsx`

**Step 1: 슬라이더 컴포넌트 구현**

```tsx
'use client';

import { ModelOptions } from '@/types/settings';

interface ModelOptionsSlidersProps {
  options: ModelOptions;
  onChange: (options: ModelOptions) => void;
}

interface SliderConfig {
  key: keyof ModelOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'numPredict',
    label: 'Max Tokens',
    min: 256,
    max: 8192,
    step: 256,
    format: (v) => v.toString(),
  },
];

export default function ModelOptionsSliders({ options, onChange }: ModelOptionsSlidersProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-3">Model Parameters</label>
      <div className="space-y-4">
        {SLIDER_CONFIGS.map((config) => {
          const value = options[config.key];
          return (
            <div key={config.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">{config.label}</span>
                <span className="text-xs font-mono text-foreground">{config.format(value)}</span>
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={value}
                onChange={(e) =>
                  onChange({ ...options, [config.key]: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>{config.format(config.min)}</span>
                <span>{config.format(config.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/settings/ModelOptionsSliders.tsx
git commit -m "feat(params): create ModelOptionsSliders component"
```

---

### Task C5: SettingsPanel에 ModelOptionsSliders 통합

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: ModelOptionsSliders import 추가**

파일 상단 import에 추가:

```typescript
import ModelOptionsSliders from './ModelOptionsSliders';
```

**Step 2: Model 드롭다운과 SearXNG URL 사이에 슬라이더 삽입**

SettingsPanel JSX에서 `{/* Model Dropdown */}` 섹션 바로 뒤, `SearXNG URL` 섹션 바로 앞에 추가:

```tsx
<ModelOptionsSliders
  options={draft.modelOptions || { temperature: 0.7, topP: 0.9, numPredict: 2048 }}
  onChange={(modelOptions) => setDraft({ ...draft, modelOptions })}
/>
```

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat(params): integrate ModelOptionsSliders into SettingsPanel"
```

---

## 주의사항

### 파일 충돌 가능 지점

3개 에이전트가 동시에 수정할 수 있는 파일:

| 파일 | Agent A | Agent B | Agent C |
|------|---------|---------|---------|
| `src/lib/agent/types.ts` | Task A3 (AgentEvent, AgentConfig) | - | - |
| `src/app/api/chat/route.ts` | Task A8 (modelOptions 전달) | - | Task C3 (modelOptions 변환) |
| `src/components/chat/ChatContainer.tsx` | - | Task B9 (Sidebar props) | - |

**해결:** Agent A가 `types.ts`와 `chat/route.ts`를 먼저 수정. Agent C는 Agent A의 Task A8 완료 후 Task C3 진행 (같은 라인 수정). 또는 Agent A의 Task A8과 Agent C의 Task C3를 하나로 합쳐서 진행.

### 실행 순서 권장

1. **Agent A Task A1~A3** + **Agent B Task B1~B4** + **Agent C Task C1~C2** (병렬, 타입/저장소/API)
2. **Agent A Task A4~A5** + **Agent B Task B5~B7** + **Agent C Task C3~C4** (병렬, 로직/훅/컴포넌트)
3. **Agent A Task A6~A8** + **Agent B Task B8~B10** + **Agent C Task C5** (병렬, UI 통합)
4. 최종 빌드 확인: `pnpm build`
