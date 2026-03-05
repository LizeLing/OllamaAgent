# Phase 3 버그 수정 및 UX 개선 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 9개 버그 수정 및 UX 개선 — enabledTools 적용, 도구 재초기화, 태그 편집, 메시지 복사, 파일 업로드 개선, 설정 반영, 에러 UI, 삭제 확인, 도구 출력 확장

**Architecture:** 9개 기능을 의존성 기준으로 3개 그룹으로 나눠 병렬 작업. Agent A(백엔드 핵심 버그 1,2,5,9), Agent B(Sidebar UX 3,8), Agent C(채팅 UX 4,6,7).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4

---

## 에이전트 팀 구성

| 에이전트 | 기능 | 파일 영역 |
|----------|------|-----------|
| **Agent A** | 1.enabledTools 적용, 2.도구 재초기화, 5.파일 업로드, 9.트런케이션 | agent 타입, tools, API routes |
| **Agent B** | 3.태그 편집 UI, 8.삭제 확인 다이얼로그 | Sidebar, ConversationItem, ChatContainer |
| **Agent C** | 4.메시지 복사, 6.설정 즉시 반영, 7.에러 UI+재시도 | MessageBubble, useChat, useSettings |

---

## Agent A: 백엔드 핵심 버그 수정 (기능 1, 2, 5, 9)

### Task A1: ToolRegistry에 필터링 지원 추가

**Files:**
- Modify: `src/lib/tools/registry.ts:38-67`

**Step 1: toOllamaTools에 enabledTools 파라미터 추가**

`src/lib/tools/registry.ts`의 `toOllamaTools` 메서드를 수정:

```typescript
/** Convert tool definitions to Ollama native tool format */
toOllamaTools(enabledTools?: string[]): OllamaTool[] {
  let tools = Array.from(this.tools.values());

  // enabledTools가 비어있지 않으면 필터링
  if (enabledTools && enabledTools.length > 0) {
    tools = tools.filter((t) => enabledTools.includes(t.definition.name));
  }

  return tools.map((tool) => {
    const def = tool.definition;
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    for (const param of def.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: {
          type: 'object' as const,
          properties,
          required,
        },
      },
    };
  });
}
```

**Step 2: Commit**

```bash
git add src/lib/tools/registry.ts
git commit -m "fix: add enabledTools filtering to toOllamaTools"
```

---

### Task A2: AgentConfig에 enabledTools 추가 + agent-loop 필터링

**Files:**
- Modify: `src/lib/agent/types.ts:24-38`
- Modify: `src/lib/agent/agent-loop.ts:30`

**Step 1: AgentConfig에 enabledTools 필드 추가**

`src/lib/agent/types.ts`:

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
  enabledTools?: string[];
}
```

**Step 2: agent-loop에서 enabledTools 전달**

`src/lib/agent/agent-loop.ts`에서 `const tools = toolRegistry.toOllamaTools();` 라인을 변경:

```typescript
const tools = toolRegistry.toOllamaTools(config.enabledTools);
```

**Step 3: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/agent-loop.ts
git commit -m "fix: pass enabledTools filter through AgentConfig to agent-loop"
```

---

### Task A3: PresetSelector에서 enabledTools 전달 + chat route에서 프리셋 로드

**Files:**
- Modify: `src/components/settings/PresetSelector.tsx:22-29`
- Modify: `src/app/api/chat/route.ts:14-65`

**Step 1: PresetSelector의 handleSelect에서 enabledTools도 전달**

`src/components/settings/PresetSelector.tsx`의 handleSelect 수정 (기존 systemPrompt만 전달 → enabledTools도 함께):

기존:
```typescript
onSelect({
  activePresetId: preset.id,
  systemPrompt: preset.systemPrompt,
});
```

변경:
```typescript
onSelect({
  activePresetId: preset.id,
  systemPrompt: preset.systemPrompt,
  enabledTools: preset.enabledTools,
});
```

**주의:** Settings 타입에 `enabledTools`가 없으므로 추가 필요.

**Step 2: Settings 타입에 enabledTools 추가**

`src/types/settings.ts`의 Settings 인터페이스에 추가:

```typescript
enabledTools?: string[];
```

**Step 3: DEFAULT_SETTINGS에 enabledTools 기본값 추가**

`src/lib/config/constants.ts`의 DEFAULT_SETTINGS에:

```typescript
enabledTools: [],
```

**Step 4: chat route에서 settings.enabledTools를 AgentConfig에 전달**

`src/app/api/chat/route.ts`의 runAgentLoop config 객체에 추가:

```typescript
enabledTools: settings.enabledTools?.length ? settings.enabledTools : undefined,
```

이 라인을 `modelOptions` 아래에 추가.

**Step 5: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 6: Commit**

```bash
git add src/components/settings/PresetSelector.tsx src/types/settings.ts src/lib/config/constants.ts src/app/api/chat/route.ts
git commit -m "fix: apply preset enabledTools filtering end-to-end"
```

---

### Task A4: 도구 레지스트리 재초기화 버그 수정

**Files:**
- Modify: `src/lib/tools/init.ts:17-37`
- Modify: `src/lib/tools/registry.ts` (clear 메서드 추가)

**Step 1: ToolRegistry에 clear 메서드 추가**

`src/lib/tools/registry.ts`에 clear 메서드 추가 (register 메서드 아래):

```typescript
clear(): void {
  this.tools.clear();
}
```

**Step 2: initializeTools에서 initialized 플래그 제거, 매번 재등록**

`src/lib/tools/init.ts` 전체 수정:

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

let lastConfigHash = '';

export function initializeTools(
  allowedPaths: string[],
  deniedPaths: string[],
  searxngUrl: string = 'http://localhost:8888',
  ollamaUrl: string = 'http://localhost:11434',
  imageModel: string = 'x/z-image-turbo:latest'
) {
  // 설정이 동일하면 재등록 스킵 (성능 최적화)
  const configHash = JSON.stringify({ allowedPaths, deniedPaths, searxngUrl, ollamaUrl, imageModel });
  if (configHash === lastConfigHash) return;

  toolRegistry.clear();

  toolRegistry.register(new FilesystemReadTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemWriteTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemListTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemSearchTool(allowedPaths, deniedPaths));
  toolRegistry.register(new HttpClientTool());
  toolRegistry.register(new WebSearchTool(searxngUrl));
  toolRegistry.register(new CodeExecutorTool());
  toolRegistry.register(new ImageGeneratorTool(ollamaUrl, imageModel));

  lastConfigHash = configHash;
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

**핵심:** `initialized` 불리언 → `lastConfigHash` 문자열 비교. 설정이 바뀌면 `clear()` 후 재등록, 같으면 스킵.

**Step 3: resetTools 함수 제거 (더 이상 불필요)**

`resetTools()` 함수를 삭제하고, 이를 import하는 곳이 있으면 제거.

**Step 4: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 5: Commit**

```bash
git add src/lib/tools/init.ts src/lib/tools/registry.ts
git commit -m "fix: re-initialize tools when settings change using config hash"
```

---

### Task A5: 파일 업로드 시 텍스트 내용을 응답에 포함

**Files:**
- Modify: `src/app/api/upload/route.ts:43-48`
- Modify: `src/components/chat/ChatContainer.tsx:132-147`

**Step 1: upload API에서 텍스트 파일 내용을 응답에 포함**

`src/app/api/upload/route.ts`의 텍스트 파일 처리 부분 수정. 텍스트 파일이면 content를 응답에 추가:

기존 return문 (라인 43-48):
```typescript
return NextResponse.json({
  filename,
  originalName: file.name,
  path: filepath,
  size: file.size,
});
```

변경:
```typescript
// 텍스트 파일이면 내용 포함
let content: string | undefined;
if (textExtensions.includes(ext.toLowerCase())) {
  content = Buffer.from(bytes).toString('utf-8').slice(0, 5000);
}

return NextResponse.json({
  filename,
  originalName: file.name,
  path: filepath,
  size: file.size,
  content,
});
```

**주의:** `textExtensions` 변수는 이미 라인 28에 정의되어 있으므로 if 블록 밖에서 재사용. content 변수 선언을 try 블록 안, 메모리 저장 블록 앞으로 옮겨야 함.

실제로는 전체 try 블록을 다음과 같이 재구성:

```typescript
const textExtensions = ['.txt', '.md', '.json', '.csv', '.log', '.ts', '.js', '.py'];
const isText = textExtensions.includes(ext.toLowerCase());
let textContent: string | undefined;

if (isText) {
  textContent = Buffer.from(bytes).toString('utf-8');
  // Save to memory
  try {
    const settings = await loadSettings();
    const memoryManager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
    await memoryManager.saveMemory(
      `File: ${file.name}\n${textContent.slice(0, 2000)}`,
      { type: 'upload', filename: file.name }
    );
  } catch {
    // Memory save failed
  }
}

return NextResponse.json({
  filename,
  originalName: file.name,
  path: filepath,
  size: file.size,
  content: textContent?.slice(0, 5000),
});
```

**Step 2: ChatContainer의 handleFileDrop에서 텍스트 내용 포함**

`src/components/chat/ChatContainer.tsx`의 `handleFileDrop` 수정:

기존:
```typescript
handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
```

변경:
```typescript
if (data.content) {
  handleSend(`파일 "${data.originalName}"의 내용입니다:\n\n\`\`\`\n${data.content}\n\`\`\``);
} else {
  handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
}
```

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/app/api/upload/route.ts src/components/chat/ChatContainer.tsx
git commit -m "fix: include text file content in upload response and chat message"
```

---

### Task A6: 도구 출력 트런케이션 완화

**Files:**
- Modify: `src/lib/agent/agent-loop.ts:138`
- Modify: `src/components/chat/ToolCallDisplay.tsx:60`

**Step 1: agent-loop의 SSE 출력 트런케이션 완화**

`src/lib/agent/agent-loop.ts`에서:

기존:
```typescript
output: observation.slice(0, 500),
```

변경:
```typescript
output: observation.slice(0, 2000),
```

**Step 2: ToolCallDisplay에 "전체 보기" 토글 추가**

`src/components/chat/ToolCallDisplay.tsx`를 수정:

```tsx
'use client';

import { ToolCallInfo } from '@/types/message';
import { useState } from 'react';

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export default function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const isRunning = toolCall.endTime === undefined;
  const outputText = toolCall.output || '';
  const isTruncated = outputText.length > 500;

  return (
    <div
      className={`border rounded-lg text-xs ${
        isRunning
          ? 'border-accent tool-running'
          : toolCall.success
          ? 'border-border'
          : 'border-error/50'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover rounded-lg transition-colors"
      >
        <span className="text-base">
          {isRunning ? '⏳' : toolCall.success ? '✅' : '❌'}
        </span>
        <span className="font-medium font-[family-name:var(--font-jetbrains)]">
          {toolCall.tool}
        </span>
        {toolCall.endTime && (
          <span className="text-muted ml-auto">
            {toolCall.endTime - toolCall.startTime}ms
          </span>
        )}
        <svg
          className={`w-3 h-3 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          <div>
            <span className="text-muted">Input:</span>
            <pre className="mt-1 p-2 bg-[#111] rounded text-[11px] overflow-x-auto font-[family-name:var(--font-jetbrains)]">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Output:</span>
                {isTruncated && (
                  <button
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="text-accent hover:text-accent-hover text-[10px]"
                  >
                    {showFullOutput ? '접기' : '전체 보기'}
                  </button>
                )}
              </div>
              <pre className={`mt-1 p-2 bg-[#111] rounded text-[11px] overflow-x-auto overflow-y-auto font-[family-name:var(--font-jetbrains)] ${showFullOutput ? 'max-h-[500px]' : 'max-h-48'}`}>
                {showFullOutput ? outputText : outputText.slice(0, 500)}
                {!showFullOutput && isTruncated && '...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/lib/agent/agent-loop.ts src/components/chat/ToolCallDisplay.tsx
git commit -m "fix: increase tool output limit to 2000 chars, add full view toggle"
```

---

## Agent B: Sidebar UX 개선 (기능 3, 8)

### Task B1: ConversationItem에 태그 편집 UI 추가

**Files:**
- Modify: `src/components/sidebar/ConversationItem.tsx`

**Step 1: props에 onUpdateTags 추가, 태그 편집 UI 구현**

ConversationItem의 props 인터페이스에 추가:

```typescript
onUpdateTags?: (id: string, tags: string[]) => void;
```

상태 추가:

```typescript
const [showTagEditor, setShowTagEditor] = useState(false);
const [tagInput, setTagInput] = useState('');
```

호버 액션 버튼 영역 (폴더 이동 버튼 뒤, 이름 변경 버튼 앞)에 태그 편집 버튼 추가:

```tsx
{onUpdateTags && (
  <button
    onClick={(e) => { e.stopPropagation(); setShowTagEditor(!showTagEditor); }}
    className="p-1 text-muted hover:text-foreground rounded transition-colors"
    title="태그 편집"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  </button>
)}
```

컨텍스트 메뉴/폴더 드롭다운 아래에 태그 편집 패널 추가 (컴포넌트 최하단, 메인 div 안):

```tsx
{showTagEditor && onUpdateTags && (
  <div
    className="mt-1 px-2 pb-1"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="flex flex-wrap gap-1 mb-1">
      {(conversation.tags || []).map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
          {tag}
          <button
            onClick={() => {
              const newTags = (conversation.tags || []).filter((t) => t !== tag);
              onUpdateTags(conversation.id, newTags);
            }}
            className="hover:text-error"
          >
            ×
          </button>
        </span>
      ))}
    </div>
    <div className="flex gap-1">
      <input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && tagInput.trim()) {
            const newTags = [...(conversation.tags || []), tagInput.trim()];
            onUpdateTags(conversation.id, [...new Set(newTags)]);
            setTagInput('');
          }
          if (e.key === 'Escape') setShowTagEditor(false);
        }}
        placeholder="태그 추가..."
        className="flex-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:border-accent"
        autoFocus
      />
    </div>
  </div>
)}
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/sidebar/ConversationItem.tsx
git commit -m "feat: add inline tag editor UI to ConversationItem"
```

---

### Task B2: Sidebar에 onUpdateTags prop 전달

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`

**Step 1: SidebarProps에 onUpdateTags 추가**

```typescript
onUpdateTags: (id: string, tags: string[]) => void;
```

**Step 2: renderItem에 onUpdateTags 전달**

renderItem 함수에서 ConversationItem에 prop 추가:

```tsx
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
    onUpdateTags={onUpdateTags}
    folders={folders}
  />
);
```

**Step 3: Commit**

```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat: pass onUpdateTags prop through Sidebar to ConversationItem"
```

---

### Task B3: ChatContainer에서 updateTags를 Sidebar에 전달

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: Sidebar JSX에 onUpdateTags prop 추가**

ChatContainer의 Sidebar 컴포넌트에:

```tsx
onUpdateTags={updateTags}
```

`updateTags`는 이미 `useConversations`에서 destructure 되어 있음 (현재 코드 확인 필요).

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/chat/ChatContainer.tsx
git commit -m "feat: connect updateTags from useConversations to Sidebar"
```

---

### Task B4: 대화 삭제 확인 다이얼로그

**Files:**
- Modify: `src/components/sidebar/ConversationItem.tsx`

**Step 1: 삭제 버튼에 확인 상태 추가**

ConversationItem에 `confirmDelete` 상태 추가:

```typescript
const [confirmDelete, setConfirmDelete] = useState(false);
```

삭제 버튼의 onClick 수정. 첫 번째 클릭 → 확인 상태, 두 번째 클릭 → 실제 삭제:

기존 삭제 버튼:
```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    onDelete(conversation.id);
  }}
  className="p-1 text-muted hover:text-error rounded transition-colors"
  title="삭제"
>
```

변경:
```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(conversation.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      // 3초 후 확인 상태 초기화
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }}
  className={`p-1 rounded transition-colors ${confirmDelete ? 'text-error bg-error/10' : 'text-muted hover:text-error'}`}
  title={confirmDelete ? '삭제 확인' : '삭제'}
>
  {confirmDelete ? (
    <span className="text-[10px] font-medium px-0.5">삭제?</span>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )}
</button>
```

**Step 2: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add src/components/sidebar/ConversationItem.tsx
git commit -m "feat: add double-click delete confirmation on ConversationItem"
```

---

## Agent C: 채팅 UX 개선 (기능 4, 6, 7)

### Task C1: 메시지 복사 버튼 추가

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

**Step 1: 복사 상태와 핸들러 추가**

MessageBubble 컴포넌트에 상태 추가:

```typescript
const [copied, setCopied] = useState(false);

const handleCopy = async () => {
  await navigator.clipboard.writeText(message.content);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

**Step 2: 어시스턴트 메시지 액션 버튼에 복사 버튼 추가**

TTS 버튼과 재생성 버튼 사이에 복사 버튼 추가. 현재 어시스턴트 액션 버튼 영역 (AudioPlayer 뒤):

```tsx
{/* Copy button */}
<button onClick={handleCopy} className="p-1 text-muted hover:text-foreground" title="복사">
  {copied ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )}
</button>
```

이 버튼을 `<AudioPlayer ... />` 뒤에 삽입.

**Step 3: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: add copy-to-clipboard button on assistant messages"
```

---

### Task C2: 설정 변경 즉시 반영 개선

**Files:**
- Modify: `src/hooks/useSettings.ts`

**Step 1: useSettings에서 설정 저장 후 자동 refetch**

현재 `useSettings`를 확인하면 `updateSettings`가 응답을 `setSettings`에 반영하므로 기본적으로 동작함. 문제는 다른 탭이나 컴포넌트에서 설정이 변경된 경우인데, 이는 이 프로젝트에서 해당 안 됨.

실제 문제: `SettingsPanel`에서 `handleSave` 후 `onClose()`를 호출하는데, 이 시점에 `settings` state가 이미 갱신되어 있으므로 헤더의 모델명도 갱신됨.

**확인 결과:** 설정 즉시 반영은 이미 동작함. 추가 개선으로 `useSettings`의 `fetchSettings`를 `visibility change` 이벤트에 연결:

```typescript
// 탭 복귀 시 설정 재로드
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      fetchSettings();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, [fetchSettings]);
```

이 코드를 `useSettings` 훅의 기존 `useEffect` 아래에 추가.

**Step 2: Commit**

```bash
git add src/hooks/useSettings.ts
git commit -m "fix: refetch settings on tab visibility change for instant sync"
```

---

### Task C3: Message 타입에 error 필드 추가

**Files:**
- Modify: `src/types/message.ts`

**Step 1: Message에 error 필드 추가**

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
  error?: string;
}
```

**Step 2: Commit**

```bash
git add src/types/message.ts
git commit -m "feat: add error field to Message type for dedicated error display"
```

---

### Task C4: useChat에서 에러를 error 필드로 분리

**Files:**
- Modify: `src/hooks/useChat.ts`

**Step 1: sendMessage catch에서 content 대신 error 필드에 저장**

기존 (라인 121-127):
```typescript
setMessages((prev) =>
  prev.map((m) =>
    m.id === assistantId
      ? { ...m, content: m.content || `오류가 발생했습니다: ${msg}` }
      : m
  )
);
```

변경:
```typescript
setMessages((prev) =>
  prev.map((m) =>
    m.id === assistantId
      ? { ...m, error: msg }
      : m
  )
);
```

**Step 2: handleSSEEvent의 error 케이스도 수정**

기존:
```typescript
case 'error':
  return {
    ...m,
    content: m.content || `오류: ${data.message as string}`,
  };
```

변경:
```typescript
case 'error':
  return {
    ...m,
    error: data.message as string,
  };
```

**Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "fix: store errors in dedicated error field instead of content"
```

---

### Task C5: MessageBubble에 에러 UI + 재시도 버튼 추가

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

**Step 1: MessageBubbleProps에 onRetry 추가**

```typescript
interface MessageBubbleProps {
  message: Message;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  isLast?: boolean;
}
```

**Step 2: 에러 표시 UI 추가**

어시스턴트 메시지의 MarkdownRenderer 아래에 에러 블록 추가:

```tsx
{!isUser && message.error && (
  <div className="mt-2 p-2 bg-error/10 border border-error/30 rounded-lg">
    <div className="flex items-start gap-2">
      <span className="text-error text-sm shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-error">{message.error}</p>
      </div>
    </div>
    {isLast && onRetry && (
      <button
        onClick={onRetry}
        className="mt-1.5 px-3 py-1 text-xs bg-error/20 text-error rounded hover:bg-error/30 transition-colors"
      >
        재시도
      </button>
    )}
  </div>
)}
```

이 코드를 `<MarkdownRenderer content={message.content} />` 바로 뒤에 삽입.

**Step 3: MessageList에서 onRetry prop 전달**

MessageList에서 MessageBubble을 렌더링하는 곳에서 `onRetry={onRegenerate}` 전달 (재시도 = 마지막 사용자 메시지 재전송과 동일).

`src/components/chat/MessageList.tsx`를 확인하고 onRetry prop 전달 필요.

**Step 4: 빌드 확인**

Run: `cd /Users/lizeling/Documents/OllamaAgent && pnpm build`
Expected: 빌드 성공

**Step 5: Commit**

```bash
git add src/components/chat/MessageBubble.tsx src/components/chat/MessageList.tsx
git commit -m "feat: add error display UI with retry button in MessageBubble"
```

---

## 충돌 가능 파일

| 파일 | Agent A | Agent B | Agent C |
|------|---------|---------|---------|
| `src/lib/agent/types.ts` | Task A2 | - | - |
| `src/lib/agent/agent-loop.ts` | Task A2, A6 | - | - |
| `src/app/api/chat/route.ts` | Task A3 | - | - |
| `src/components/chat/ChatContainer.tsx` | Task A5 | Task B3 | - |
| `src/components/sidebar/ConversationItem.tsx` | - | Task B1, B4 | - |
| `src/components/chat/MessageBubble.tsx` | - | - | Task C1, C5 |
| `src/types/message.ts` | - | - | Task C3 |
| `src/hooks/useChat.ts` | - | - | Task C4 |

**ChatContainer.tsx 충돌:** Agent A(Task A5)와 Agent B(Task B3)가 각각 다른 부분 수정 (A5: handleFileDrop, B3: Sidebar props). 충돌 가능성 낮음.

**ConversationItem.tsx:** Agent B 내부에서 Task B1과 B4가 순차적으로 수정. 충돌 없음.

**MessageBubble.tsx:** Agent C 내부에서 Task C1과 C5가 순차적으로 수정. 충돌 없음.

## 실행 순서 권장

**Phase 1 (병렬):**
- Agent A: Task A1 → A2 → A3 → A4
- Agent B: Task B1 → B2 → B3
- Agent C: Task C1 → C2 → C3 → C4

**Phase 2 (병렬):**
- Agent A: Task A5 → A6
- Agent B: Task B4
- Agent C: Task C5

**Phase 3:** 최종 빌드 확인 `pnpm build`
