# OllamaAgent Feature Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 대화 관리, 에이전트 강화, UX 개선 3가지 기능 영역을 에이전트 팀 병렬 개발로 구현한다.

**Architecture:** 3개의 독립 git worktree에서 병렬 작업. 각 에이전트가 feature branch에서 작업 후 순차 머지. 서버 측 파일 저장소(`data/conversations/`)로 대화 관리, 도구 승인/프리셋/MCP로 에이전트 강화, 테마·편집·반응형으로 UX 개선.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Ollama API, pnpm

---

## Team Structure

| Agent | Branch | Worktree | Scope |
|-------|--------|----------|-------|
| conversation-agent | feature/conversation-management | .claude/worktrees/conversation | 대화 관리 전체 |
| agent-enhancement | feature/agent-enhancement | .claude/worktrees/agent-enhance | 에이전트 강화 전체 |
| ux-improvement | feature/ux-improvement | .claude/worktrees/ux-improve | UX 개선 전체 |

---

## Part A: Conversation Management (conversation-agent)

### Task A1: Conversation 타입 및 서버 저장소 유틸리티

**Files:**
- Create: `src/types/conversation.ts`
- Create: `src/lib/conversations/storage.ts`

**Step 1: Create conversation type**

```typescript
// src/types/conversation.ts
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Conversation extends ConversationMeta {
  messages: import('./message').Message[];
}
```

**Step 2: Create server-side storage utility**

```typescript
// src/lib/conversations/storage.ts
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/lib/config/constants';
import { Conversation, ConversationMeta } from '@/types/conversation';

const CONV_DIR = path.join(DATA_DIR, 'conversations');
const INDEX_FILE = path.join(CONV_DIR, 'index.json');

async function ensureDir() {
  await fs.mkdir(CONV_DIR, { recursive: true });
}

async function readIndex(): Promise<ConversationMeta[]> {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(index: ConversationMeta[]) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function listConversations(): Promise<ConversationMeta[]> {
  const index = await readIndex();
  return index.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const data = await fs.readFile(path.join(CONV_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    path.join(CONV_DIR, `${conv.id}.json`),
    JSON.stringify(conv, null, 2)
  );
  // Update index
  const index = await readIndex();
  const meta: ConversationMeta = {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
  };
  const existing = index.findIndex((c) => c.id === conv.id);
  if (existing >= 0) {
    index[existing] = meta;
  } else {
    index.push(meta);
  }
  await writeIndex(index);
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(CONV_DIR, `${id}.json`));
    const index = await readIndex();
    await writeIndex(index.filter((c) => c.id !== id));
    return true;
  } catch {
    return false;
  }
}

export async function searchConversations(query: string): Promise<ConversationMeta[]> {
  const index = await readIndex();
  const results: ConversationMeta[] = [];
  const lowerQuery = query.toLowerCase();

  // Search titles first
  for (const meta of index) {
    if (meta.title.toLowerCase().includes(lowerQuery)) {
      results.push(meta);
    }
  }

  // Search message content
  for (const meta of index) {
    if (results.some((r) => r.id === meta.id)) continue;
    const conv = await getConversation(meta.id);
    if (conv && conv.messages.some((m) => m.content.toLowerCase().includes(lowerQuery))) {
      results.push(meta);
    }
  }

  return results;
}
```

**Step 3: Commit**

```bash
git add src/types/conversation.ts src/lib/conversations/storage.ts
git commit -m "feat: add conversation type and server-side storage"
```

---

### Task A2: Conversations REST API

**Files:**
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/route.ts`
- Create: `src/app/api/conversations/[id]/export/route.ts`
- Create: `src/app/api/conversations/import/route.ts`
- Create: `src/app/api/conversations/search/route.ts`

**Step 1: Create list + create endpoint**

```typescript
// src/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listConversations, saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const conversations = await listConversations();
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = Date.now();
  const conv: Conversation = {
    id: uuidv4(),
    title: body.title || '새 대화',
    messages: [],
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
  await saveConversation(conv);
  return NextResponse.json(conv, { status: 201 });
}
```

**Step 2: Create single conversation CRUD endpoint**

```typescript
// src/app/api/conversations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConversation, saveConversation, deleteConversation } from '@/lib/conversations/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(conv);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates = await request.json();
  const updated = { ...conv, ...updates, updatedAt: Date.now() };
  if (updated.messages) updated.messageCount = updated.messages.length;
  await saveConversation(updated);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteConversation(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
```

**Step 3: Create export endpoint**

```typescript
// src/app/api/conversations/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '@/lib/conversations/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get('format') || 'json';
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (format === 'markdown') {
    let md = `# ${conv.title}\n\n`;
    for (const msg of conv.messages) {
      const label = msg.role === 'user' ? '**사용자**' : '**어시스턴트**';
      md += `${label}:\n${msg.content}\n\n---\n\n`;
    }
    return new Response(md, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${conv.title}.md"`,
      },
    });
  }

  return new Response(JSON.stringify(conv, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${conv.title}.json"`,
    },
  });
}
```

**Step 4: Create import endpoint**

```typescript
// src/app/api/conversations/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = Date.now();
  const conv: Conversation = {
    id: uuidv4(),
    title: body.title || '가져온 대화',
    messages: body.messages || [],
    createdAt: body.createdAt || now,
    updatedAt: now,
    messageCount: (body.messages || []).length,
  };
  await saveConversation(conv);
  return NextResponse.json(conv, { status: 201 });
}
```

**Step 5: Create search endpoint**

```typescript
// src/app/api/conversations/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { searchConversations } from '@/lib/conversations/storage';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || '';
  if (!query) return NextResponse.json({ results: [] });
  const results = await searchConversations(query);
  return NextResponse.json({ results });
}
```

**Step 6: Commit**

```bash
git add src/app/api/conversations/
git commit -m "feat: add conversations REST API endpoints"
```

---

### Task A3: useConversations 훅

**Files:**
- Create: `src/hooks/useConversations.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/useConversations.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { ConversationMeta } from '@/types/conversation';

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const conv = await res.json();
      setConversations((prev) => [
        { id: conv.id, title: conv.title, createdAt: conv.createdAt, updatedAt: conv.updatedAt, messageCount: 0 },
        ...prev,
      ]);
      setActiveId(conv.id);
      return conv.id;
    } catch {
      return null;
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    } catch {
      // ignore
    }
  }, [activeId]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch {
      // ignore
    }
  }, []);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchConversations();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setConversations(data.results || []);
    } catch {
      // ignore
    }
  }, [fetchConversations]);

  return {
    conversations,
    activeId,
    setActiveId,
    isLoading,
    searchQuery,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
    refresh: fetchConversations,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useConversations.ts
git commit -m "feat: add useConversations hook"
```

---

### Task A4: Sidebar 컴포넌트

**Files:**
- Create: `src/components/sidebar/Sidebar.tsx`
- Create: `src/components/sidebar/ConversationItem.tsx`

**Step 1: Create ConversationItem**

```typescript
// src/components/sidebar/ConversationItem.tsx
'use client';

import { useState } from 'react';
import { ConversationMeta } from '@/types/conversation';

interface ConversationItemProps {
  conversation: ConversationMeta;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export default function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  const handleRename = () => {
    if (editTitle.trim()) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const timeAgo = formatTimeAgo(conversation.updatedAt);

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-accent/20 text-foreground' : 'hover:bg-card-hover text-muted hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full bg-transparent border-b border-accent text-sm focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p className="text-sm truncate">{conversation.title}</p>
            <p className="text-[10px] text-muted">{timeAgo}</p>
          </>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditTitle(conversation.title); }}
          className="p-1 hover:bg-card rounded text-muted hover:text-foreground"
          title="이름 변경"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 hover:bg-error/20 rounded text-muted hover:text-error"
          title="삭제"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(timestamp).toLocaleDateString('ko-KR');
}
```

**Step 2: Create Sidebar**

```typescript
// src/components/sidebar/Sidebar.tsx
'use client';

import { useState } from 'react';
import { ConversationMeta } from '@/types/conversation';
import ConversationItem from './ConversationItem';

interface SidebarProps {
  conversations: ConversationMeta[];
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
}

export default function Sidebar({
  conversations,
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
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:relative top-0 left-0 h-full w-72 bg-background border-r border-border z-40 flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-border">
          <button
            onClick={onNew}
            className="w-full py-2 px-3 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
          >
            + 새 대화
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            placeholder="대화 검색..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent placeholder:text-muted"
          />
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="text-center text-muted text-xs py-4">
              {searchQuery ? '검색 결과 없음' : '대화가 없습니다'}
            </p>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeId === conv.id}
                onClick={() => onSelect(conv.id)}
                onDelete={() => onDelete(conv.id)}
                onRename={(title) => onRename(conv.id, title)}
              />
            ))
          )}
        </div>

        {/* Footer - Import/Export */}
        <div className="p-3 border-t border-border flex gap-2">
          <button
            onClick={onImport}
            className="flex-1 py-1.5 px-2 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
          >
            가져오기
          </button>
          {activeId && (
            <button
              onClick={() => onExport(activeId, 'json')}
              className="flex-1 py-1.5 px-2 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
            >
              내보내기
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/sidebar/
git commit -m "feat: add Sidebar and ConversationItem components"
```

---

### Task A5: ChatContainer 리팩토링 — 사이드바 통합 및 서버 저장소 연동

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`
- Modify: `src/hooks/useChat.ts`

**Step 1: Update useChat to support conversation loading/saving**

`useChat`에 다음 기능 추가:
- `loadConversation(id)` — 서버에서 대화 로드
- `setMessages` 노출 — 외부에서 메시지 설정
- 메시지 변경 시 서버에 자동 저장 (debounce)
- `sendMessage` 후 서버에 대화 업데이트

`useChat.ts`의 주요 변경:
- `conversationId` 상태 추가
- localStorage 저장 제거 → 서버 API 호출로 교체
- `loadConversation`, `setConversationId` 함수 export

**Step 2: Rewrite ChatContainer layout**

`ChatContainer.tsx` 전체 레이아웃을 `flex` 기반으로 변경:
```
<div className="flex h-screen">
  <Sidebar ... />
  <main className="flex-1 flex flex-col">
    <header ... />
    <MessageList ... />
    <ChatInput ... />
  </main>
  <SettingsPanel ... />
</div>
```

- 사이드바 토글 버튼 추가 (헤더 좌측 햄버거)
- `useConversations` 훅 연동
- 대화 선택 시 `loadConversation` 호출
- 새 대화 시 `createConversation` + `clearMessages`

**Step 3: Auto-title generation**

`useChat.ts`의 `sendMessage` 완료 콜백에서:
- 대화의 첫 메시지인 경우 `/api/conversations/[id]/title` 생성 호출
- Ollama generate API로 제목 생성 (별도 API 라우트 or 클라이언트 직접 호출)

간단한 접근: `sendMessage` 완료 후 대화 제목이 '새 대화'이면 첫 메시지 앞 30자를 제목으로 설정

**Step 4: Commit**

```bash
git add src/components/chat/ChatContainer.tsx src/hooks/useChat.ts
git commit -m "feat: integrate sidebar and server-side conversation storage"
```

---

### Task A6: Auto-Title API

**Files:**
- Create: `src/app/api/conversations/[id]/title/route.ts`

**Step 1: Create auto-title endpoint**

```typescript
// src/app/api/conversations/[id]/title/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConversation, saveConversation } from '@/lib/conversations/storage';
import { loadSettings } from '@/lib/config/settings';
import { generate } from '@/lib/ollama/client';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const settings = await loadSettings();
  const firstUserMsg = conv.messages.find((m) => m.role === 'user');
  if (!firstUserMsg) return NextResponse.json({ title: conv.title });

  try {
    const res = await generate(settings.ollamaUrl, {
      model: settings.ollamaModel,
      prompt: `다음 대화의 제목을 한국어로 10자 이내로 요약하세요. 제목만 출력하세요.\n\n사용자: ${firstUserMsg.content.slice(0, 200)}`,
      stream: false,
    });
    const title = res.response.trim().replace(/^["']|["']$/g, '').slice(0, 50) || conv.title;
    conv.title = title;
    await saveConversation(conv);
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: conv.title });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/conversations/[id]/title/route.ts
git commit -m "feat: add auto-title generation API"
```

---

## Part B: Agent Enhancement (agent-enhancement)

### Task B1: Settings 타입 확장

**Files:**
- Modify: `src/types/settings.ts`
- Modify: `src/lib/config/constants.ts`

**Step 1: Add new fields to Settings**

`src/types/settings.ts`에 추가:
```typescript
export type ToolApprovalMode = 'auto' | 'confirm' | 'deny-dangerous';

export interface AgentPreset {
  id: string;
  name: string;
  systemPrompt: string;
  enabledTools: string[];
  model?: string;
}

export interface CustomToolDef {
  id: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  enabled: boolean;
}

// Settings 인터페이스에 필드 추가:
// toolApprovalMode: ToolApprovalMode;
// activePresetId?: string;
// customTools: CustomToolDef[];
// mcpServers: McpServerConfig[];
```

**Step 2: Update DEFAULT_SETTINGS in constants.ts**

```typescript
// constants.ts에 추가 기본값:
toolApprovalMode: 'auto' as const,
activePresetId: undefined,
customTools: [],
mcpServers: [],
```

**Step 3: Commit**

```bash
git add src/types/settings.ts src/lib/config/constants.ts
git commit -m "feat: extend settings with tool approval, presets, custom tools, MCP"
```

---

### Task B2: Tool Approval Mode

**Files:**
- Modify: `src/lib/agent/agent-loop.ts`
- Modify: `src/lib/agent/types.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/hooks/useChat.ts`
- Create: `src/components/chat/ToolApprovalModal.tsx`

**Step 1: Add tool_confirm event type to AgentEvent**

`src/lib/agent/types.ts`의 AgentEvent type에 `'tool_confirm'` 추가

**Step 2: Add approval callback to AgentConfig**

```typescript
// AgentConfig에 추가:
toolApprovalMode: 'auto' | 'confirm' | 'deny-dangerous';
onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
```

**Step 3: Modify agent-loop.ts tool execution section**

도구 실행 전 승인 검사 로직 추가:
```typescript
// agent-loop.ts 도구 실행 루프 내 (line ~79 이후)
const DANGEROUS_TOOLS = ['code_executor', 'filesystem_write'];

for (const tc of toolCalls) {
  const toolName = tc.function.name;
  const toolArgs = tc.function.arguments;

  // Tool approval check
  if (config.toolApprovalMode !== 'auto') {
    const isDangerous = DANGEROUS_TOOLS.includes(toolName);
    if (config.toolApprovalMode === 'confirm' || (config.toolApprovalMode === 'deny-dangerous' && isDangerous)) {
      yield { type: 'tool_confirm', data: { tool: toolName, input: toolArgs } };
      if (config.onToolApproval) {
        const approved = await config.onToolApproval(toolName, toolArgs);
        if (!approved) {
          messages.push({ role: 'tool', content: `도구 "${toolName}" 실행이 사용자에 의해 거부되었습니다.` });
          continue;
        }
      }
    }
  }

  // ... 기존 도구 실행 코드 ...
}
```

**Step 4: Create ToolApprovalModal component**

```typescript
// src/components/chat/ToolApprovalModal.tsx
'use client';

interface ToolApprovalModalProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}

export default function ToolApprovalModal({ toolName, toolInput, onApprove, onDeny }: ToolApprovalModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-base font-semibold mb-2">도구 실행 승인</h3>
        <p className="text-sm text-muted mb-3">다음 도구를 실행하시겠습니까?</p>
        <div className="bg-card rounded-lg p-3 mb-4">
          <p className="text-sm font-mono text-accent">{toolName}</p>
          <pre className="text-xs text-muted mt-1 overflow-auto max-h-32">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button onClick={onApprove} className="flex-1 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover">
            승인
          </button>
          <button onClick={onDeny} className="flex-1 py-2 bg-card text-muted rounded-lg text-sm hover:bg-card-hover hover:text-foreground">
            거부
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Wire approval in useChat.ts**

SSE 이벤트에 `tool_confirm` 핸들러 추가. approval Promise를 pending 상태로 유지하고, 사용자가 모달에서 승인/거부하면 resolve.

서버 측 구현: `/api/chat/route.ts`에서 tool approval을 구현하려면 SSE + POST confirm 패턴이 필요.

- SSE 스트림에서 `tool_confirm` 이벤트 발송
- 클라이언트가 `/api/chat/confirm` POST 요청
- 서버에서 Promise resolve

실제로는 간단한 구현: `tool_confirm` 이벤트에 `confirmId`를 포함하고, 글로벌 Map에 resolve 함수를 저장. `/api/chat/confirm` 라우트에서 해당 resolve를 호출.

Create: `src/app/api/chat/confirm/route.ts`

```typescript
// 글로벌 approval pending map
// src/lib/agent/approval.ts
const pendingApprovals = new Map<string, (approved: boolean) => void>();

export function waitForApproval(confirmId: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(confirmId, resolve);
    // 60초 타임아웃
    setTimeout(() => {
      if (pendingApprovals.has(confirmId)) {
        pendingApprovals.delete(confirmId);
        resolve(false);
      }
    }, 60000);
  });
}

export function resolveApproval(confirmId: string, approved: boolean) {
  const resolve = pendingApprovals.get(confirmId);
  if (resolve) {
    resolve(approved);
    pendingApprovals.delete(confirmId);
  }
}
```

**Step 6: Commit**

```bash
git add src/lib/agent/agent-loop.ts src/lib/agent/types.ts src/lib/agent/approval.ts \
  src/app/api/chat/route.ts src/app/api/chat/confirm/route.ts \
  src/hooks/useChat.ts src/components/chat/ToolApprovalModal.tsx
git commit -m "feat: add tool approval mode with confirm/deny flow"
```

---

### Task B3: Agent Presets

**Files:**
- Create: `src/lib/presets/storage.ts`
- Create: `src/lib/presets/defaults.ts`
- Create: `src/app/api/presets/route.ts`
- Create: `src/app/api/presets/[id]/route.ts`
- Create: `src/components/settings/PresetSelector.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: Create default presets**

```typescript
// src/lib/presets/defaults.ts
import { AgentPreset } from '@/types/settings';

export const DEFAULT_PRESETS: AgentPreset[] = [
  {
    id: 'coding',
    name: '코딩 어시스턴트',
    systemPrompt: '당신은 숙련된 소프트웨어 개발자입니다. 코드를 작성하고, 디버깅하고, 리팩토링하는 데 도움을 줍니다. 한국어로 응답하세요.',
    enabledTools: ['filesystem_read', 'filesystem_write', 'filesystem_list', 'filesystem_search', 'code_executor'],
  },
  {
    id: 'research',
    name: '리서치',
    systemPrompt: '당신은 정보 검색과 분석에 특화된 리서치 어시스턴트입니다. 웹 검색과 자료 분석으로 정확한 정보를 제공합니다. 한국어로 응답하세요.',
    enabledTools: ['web_search', 'http_client', 'filesystem_read'],
  },
  {
    id: 'general',
    name: '일반',
    systemPrompt: '당신은 유능한 AI 어시스턴트입니다. 사용자의 질문에 정확하고 도움이 되는 답변을 제공합니다. 한국어로 응답하세요.',
    enabledTools: [],  // empty = all tools enabled
  },
];
```

**Step 2: Create presets storage**

```typescript
// src/lib/presets/storage.ts
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/lib/config/constants';
import { AgentPreset } from '@/types/settings';
import { DEFAULT_PRESETS } from './defaults';

const PRESETS_DIR = path.join(DATA_DIR, 'presets');

async function ensureDir() {
  await fs.mkdir(PRESETS_DIR, { recursive: true });
}

export async function listPresets(): Promise<AgentPreset[]> {
  await ensureDir();
  const presets = [...DEFAULT_PRESETS];
  try {
    const files = await fs.readdir(PRESETS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await fs.readFile(path.join(PRESETS_DIR, file), 'utf-8');
      presets.push(JSON.parse(data));
    }
  } catch {
    // ignore
  }
  return presets;
}

export async function getPreset(id: string): Promise<AgentPreset | null> {
  const defaultPreset = DEFAULT_PRESETS.find((p) => p.id === id);
  if (defaultPreset) return defaultPreset;
  try {
    const data = await fs.readFile(path.join(PRESETS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function savePreset(preset: AgentPreset): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(PRESETS_DIR, `${preset.id}.json`), JSON.stringify(preset, null, 2));
}

export async function deletePreset(id: string): Promise<boolean> {
  if (DEFAULT_PRESETS.some((p) => p.id === id)) return false; // Can't delete defaults
  try {
    await fs.unlink(path.join(PRESETS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
```

**Step 3: Create API routes**

```typescript
// src/app/api/presets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const presets = await listPresets();
  return NextResponse.json({ presets });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const preset = { ...body, id: body.id || uuidv4() };
  await savePreset(preset);
  return NextResponse.json(preset, { status: 201 });
}
```

**Step 4: Create PresetSelector component**

설정 패널에 드롭다운으로 프리셋 선택 UI 추가. 선택 시 시스템 프롬프트와 활성 도구가 자동 변경.

**Step 5: Modify SettingsPanel to include PresetSelector and toolApprovalMode**

`SettingsPanel.tsx`에:
- 프리셋 드롭다운 추가 (상단)
- Tool Approval Mode 라디오 버튼 추가

**Step 6: Commit**

```bash
git add src/lib/presets/ src/app/api/presets/ src/components/settings/PresetSelector.tsx src/components/settings/SettingsPanel.tsx
git commit -m "feat: add agent presets with coding, research, general defaults"
```

---

### Task B4: Custom Tool Registration

**Files:**
- Create: `src/lib/tools/custom-tool.ts`
- Create: `src/app/api/custom-tools/route.ts`
- Create: `src/components/settings/CustomToolEditor.tsx`
- Modify: `src/lib/tools/init.ts`

**Step 1: Create CustomTool class**

```typescript
// src/lib/tools/custom-tool.ts
import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { CustomToolDef } from '@/types/settings';

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
        for (const [k, v] of Object.entries(args)) {
          params.set(k, String(v));
        }
        url += '?' + params.toString();
      } else if (this.config.bodyTemplate) {
        body = this.config.bodyTemplate.replace(
          /\{\{(\w+)\}\}/g,
          (_, key) => String(args[key] || '')
        );
      } else {
        body = JSON.stringify(args);
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
```

**Step 2: Modify init.ts to load custom tools**

`initializeTools`에 `customTools: CustomToolDef[]` 파라미터 추가. 각 커스텀 도구를 `CustomTool`로 생성하여 레지스트리에 등록.

**Step 3: Create API route and editor component**

커스텀 도구 CRUD API + 설정 패널 내 도구 관리 탭.

**Step 4: Commit**

```bash
git add src/lib/tools/custom-tool.ts src/lib/tools/init.ts src/app/api/custom-tools/ \
  src/components/settings/CustomToolEditor.tsx src/components/settings/SettingsPanel.tsx
git commit -m "feat: add custom tool registration with HTTP endpoint support"
```

---

### Task B5: MCP Server Integration

**Files:**
- Create: `src/lib/mcp/client.ts`
- Create: `src/lib/mcp/types.ts`
- Create: `src/lib/tools/mcp-tool.ts`
- Create: `src/app/api/mcp-servers/route.ts`
- Create: `src/components/settings/McpServerManager.tsx`
- Modify: `src/lib/tools/init.ts`
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: Create MCP types**

```typescript
// src/lib/mcp/types.ts
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}
```

**Step 2: Create MCP client**

SSE 기반 MCP 클라이언트:
- `connect(url)` — SSE 연결
- `listTools()` — 도구 목록 조회
- `callTool(name, args)` — 도구 실행
- `disconnect()` — 연결 종료

**Step 3: Create McpTool class**

MCP 도구를 `BaseTool`로 래핑. `execute`에서 MCP 클라이언트의 `callTool` 호출.

**Step 4: Modify init.ts**

`initializeTools`에 `mcpServers: McpServerConfig[]` 파라미터 추가. 각 활성 MCP 서버에 연결하여 도구 조회 후 레지스트리에 등록.

**Step 5: Create API routes and UI**

MCP 서버 CRUD API + 설정 패널 내 MCP 관리 UI.

**Step 6: Commit**

```bash
git add src/lib/mcp/ src/lib/tools/mcp-tool.ts src/app/api/mcp-servers/ \
  src/components/settings/McpServerManager.tsx src/lib/tools/init.ts \
  src/components/settings/SettingsPanel.tsx
git commit -m "feat: add MCP server integration with dynamic tool discovery"
```

---

## Part C: UX Improvement (ux-improvement)

### Task C1: Dark/Light Theme System

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/hooks/useTheme.ts`
- Create: `src/components/ui/ThemeToggle.tsx`
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: Add light theme CSS variables**

`globals.css`에 라이트 모드 변수 추가:
```css
:root {
  /* 기존 다크 모드 변수 유지 */
}

[data-theme='light'] {
  --background: #ffffff;
  --foreground: #1a1a1a;
  --card: #f5f5f5;
  --card-hover: #e5e5e5;
  --border: #e0e0e0;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --muted: #737373;
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
}
```

코드 하이라이팅도 라이트 모드 대응:
```css
[data-theme='light'] pre code.hljs {
  background: #f5f5f5 !important;
}
[data-theme='light'] code:not(pre code) {
  background: #e5e5e5;
}
```

**Step 2: Create useTheme hook**

```typescript
// src/hooks/useTheme.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light' | 'system';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      setThemeState(saved);
      applyTheme(saved);
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
  }, []);

  return { theme, setTheme };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
```

**Step 3: Create ThemeToggle component**

```typescript
// src/components/ui/ThemeToggle.tsx
'use client';

import { useTheme } from '@/hooks/useTheme';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻';

  return (
    <button
      onClick={() => setTheme(next)}
      className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
      title={`테마: ${theme}`}
    >
      <span className="text-sm">{icon}</span>
    </button>
  );
}
```

**Step 4: Add ThemeToggle to ChatContainer header**

헤더의 설정 버튼 옆에 ThemeToggle 추가.

**Step 5: Update layout.tsx**

`<html>` 태그에서 `className="dark"` 제거 (data-theme 어트리뷰트로 대체).

**Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/hooks/useTheme.ts \
  src/components/ui/ThemeToggle.tsx src/components/chat/ChatContainer.tsx
git commit -m "feat: add dark/light/system theme toggle"
```

---

### Task C2: Message Edit & Regenerate

**Files:**
- Modify: `src/hooks/useChat.ts`
- Modify: `src/components/chat/MessageBubble.tsx`
- Modify: `src/components/chat/MessageList.tsx`

**Step 1: Add editMessage and regenerate to useChat**

```typescript
// useChat.ts에 추가할 함수들:

const editMessage = useCallback(async (messageId: string, newContent: string) => {
  // 해당 메시지 이후 모든 메시지 삭제
  setMessages((prev) => {
    const idx = prev.findIndex((m) => m.id === messageId);
    if (idx < 0) return prev;
    const updated = prev.slice(0, idx);
    updated.push({ ...prev[idx], content: newContent });
    return updated;
  });
  // 수정된 메시지로 재전송
  // sendMessage가 현재 messages를 참조하므로 약간의 지연 후 전송
  await sendMessage(newContent);
}, [sendMessage]);

const regenerate = useCallback(async () => {
  // 마지막 assistant 메시지 삭제하고 마지막 user 메시지 재전송
  setMessages((prev) => {
    if (prev.length < 2) return prev;
    const lastUserIdx = [...prev].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx < 0) return prev;
    const actualIdx = prev.length - 1 - lastUserIdx;
    return prev.slice(0, actualIdx + 1);
  });
  // 마지막 user 메시지 내용으로 재전송
  const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
  if (lastUserMsg) {
    await sendMessage(lastUserMsg.content, lastUserMsg.attachedImages);
  }
}, [messages, sendMessage]);
```

**Step 2: Add edit/regenerate buttons to MessageBubble**

`MessageBubble.tsx`에서:
- 사용자 메시지: hover 시 편집 아이콘 표시
- 어시스턴트 메시지: hover 시 재생성 아이콘 표시
- 편집 클릭 시 inline textarea로 전환

Props 추가:
```typescript
interface MessageBubbleProps {
  message: Message;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  isLast?: boolean;
}
```

**Step 3: Update MessageList to pass callbacks**

```typescript
// MessageList.tsx
<MessageBubble
  key={message.id}
  message={message}
  onEdit={onEdit}
  onRegenerate={onRegenerate}
  isLast={i === messages.length - 1}
/>
```

**Step 4: Commit**

```bash
git add src/hooks/useChat.ts src/components/chat/MessageBubble.tsx src/components/chat/MessageList.tsx
git commit -m "feat: add message edit and regenerate functionality"
```

---

### Task C3: Responsive Mobile UI

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/app/globals.css`

**Step 1: Make ChatContainer responsive**

- 사이드바: 모바일(`< md`)에서 `fixed` 오버레이, 데스크톱에서 `relative`
- 햄버거 버튼: 모바일에서만 표시
- 메인 영역: `flex-1` 유지

**Step 2: Make ChatInput mobile-friendly**

- 버튼 크기 모바일 최적화
- `safe-area-inset-bottom` 대응 (iOS)
- 키보드 올라올 때 입력 영역 위치 조정

```css
/* globals.css에 추가 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .chat-input-area {
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }
}
```

**Step 3: Make SettingsPanel responsive**

모바일에서 풀스크린 모달:
```typescript
// SettingsPanel.tsx의 패널 클래스 변경:
className="fixed right-0 top-0 h-full w-full md:max-w-md bg-background border-l border-border z-50 overflow-y-auto"
```

**Step 4: Add viewport meta tag**

`layout.tsx`에 viewport 설정 확인 (Next.js 16은 metadata export로 처리).

**Step 5: Commit**

```bash
git add src/components/chat/ChatContainer.tsx src/components/chat/ChatInput.tsx \
  src/components/settings/SettingsPanel.tsx src/app/globals.css
git commit -m "feat: add responsive mobile UI with overlay sidebar"
```

---

## Part D: Integration & Merge

### Task D1: Sequential Merge

각 feature branch 작업 완료 후 순차적으로 main에 머지:

1. `feature/conversation-management` → main (충돌 가능성 낮음)
2. `feature/ux-improvement` → main (ChatContainer 충돌 수동 해결)
3. `feature/agent-enhancement` → main (settings/init 충돌 수동 해결)

### Task D2: Integration Testing

모든 머지 후 통합 확인:
- `pnpm dev` 실행 → 에러 없이 빌드 확인
- 대화 생성/저장/로드/삭제 동작 확인
- 테마 전환 동작 확인
- 메시지 편집/재생성 동작 확인
- 설정 패널에서 프리셋/도구승인/커스텀도구/MCP 설정 확인

### Task D3: Final Commit

```bash
git add .
git commit -m "feat: integrate conversation management, agent enhancement, and UX improvements"
```
